/**
 * Fortell Nexus — thin desk agent with 3 tools only.
 * Never auto-starts work or sends mail; UI confirms actions.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, stepCountIs, tool } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getGeminiApiKey, getGeminiModel } from "@/lib/ai-gateway.server";

export type FortellStep = { label: string; detail: string | null };

export type FortellDraft = {
  to: string;
  subject: string;
  body: string;
};

export type FortellWorkProposal = {
  organizationId: string;
  organizationName: string;
  projectId: string;
  projectName: string;
  rateId: string | null;
  rateName: string | null;
  hourlyRate: number | null;
  comment: string | null;
  platformOrgSlug: string | null;
};

export type FortellResult = {
  answer: string;
  steps: FortellStep[];
  draft: FortellDraft | null;
  workProposal: FortellWorkProposal | null;
};

const Input = z.object({
  instruction: z.string().min(2).max(2000),
});

function osloToday(): string {
  return new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "full",
    timeZone: "Europe/Oslo",
  }).format(new Date());
}

function matchByName<T extends { name: string }>(
  items: T[],
  query: string,
): T | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const exact = items.find((i) => i.name.toLowerCase() === q);
  if (exact) return exact;
  const starts = items.find((i) => i.name.toLowerCase().startsWith(q));
  if (starts) return starts;
  return items.find((i) => i.name.toLowerCase().includes(q)) ?? null;
}

export const runFortell = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }): Promise<FortellResult> => {
    const { supabase, userId } = context;
    if (!getGeminiApiKey()) {
      throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY)");
    }

    const steps: FortellStep[] = [];
    /** Mutable bag — TS does not track assignments inside tool closures. */
    const out: {
      draft: FortellDraft | null;
      workProposal: FortellWorkProposal | null;
    } = { draft: null, workProposal: null };

    const tools = {
      readContact: tool({
        description:
          "Les kontakt(er) i Nexus etter navn eller nøkkelord. Returnerer e-post, rolle, fakta, åpne oppfølginger, relasjoner og nylige signaler. Bruk når brukeren spør om en person/selskap.",
        inputSchema: z.object({
          query: z.string().min(1).max(120),
        }),
        execute: async ({ query }) => {
          const q = query.trim();
          steps.push({ label: "Leste kontakt", detail: q });

          const { data: ents } = await supabase
            .from("entities")
            .select("id, name, type, summary, metadata, last_seen_at")
            .eq("user_id", userId)
            .in("type", ["person", "company"])
            .or(`name.ilike.%${q}%,summary.ilike.%${q}%`)
            .limit(6);

          const contacts = [];
          for (const e of ents ?? []) {
            const meta = (e.metadata ?? {}) as Record<string, unknown>;
            const facts = Array.isArray(meta.notes_facts)
              ? meta.notes_facts
                  .filter((x): x is string => typeof x === "string")
                  .slice(0, 6)
              : [];
            const [{ data: fus }, { data: sigs }, { data: rels }] = await Promise.all([
              supabase
                .from("field_follow_ups")
                .select("action, due_at, status")
                .eq("user_id", userId)
                .eq("entity_id", e.id)
                .eq("status", "open")
                .limit(3),
              supabase
                .from("entity_signals")
                .select("source, signal_type, snippet, occurred_at")
                .eq("user_id", userId)
                .eq("entity_id", e.id)
                .order("occurred_at", { ascending: false, nullsFirst: false })
                .limit(4),
              supabase
                .from("entity_relationships")
                .select("from_entity_id, to_entity_id, kind")
                .eq("user_id", userId)
                .or(`from_entity_id.eq.${e.id},to_entity_id.eq.${e.id}`)
                .limit(6),
            ]);

            const otherIds = new Set<string>();
            for (const r of rels ?? []) {
              otherIds.add(r.from_entity_id === e.id ? r.to_entity_id : r.from_entity_id);
            }
            let relatedNames: { name: string; kind: string }[] = [];
            if (otherIds.size) {
              const { data: others } = await supabase
                .from("entities")
                .select("id, name")
                .eq("user_id", userId)
                .in("id", [...otherIds]);
              const byId = new Map((others ?? []).map((o) => [o.id, o.name]));
              relatedNames = (rels ?? []).map((r) => {
                const oid = r.from_entity_id === e.id ? r.to_entity_id : r.from_entity_id;
                return { name: byId.get(oid) ?? "?", kind: r.kind };
              });
            }

            contacts.push({
              entityId: e.id,
              name: e.name,
              type: e.type,
              summary: e.summary,
              email: typeof meta.email === "string" ? meta.email : null,
              role: typeof meta.role === "string" ? meta.role : null,
              phone: typeof meta.phone === "string" ? meta.phone : null,
              facts,
              openFollowUps: (fus ?? []).map((f) => ({
                action: f.action,
                dueAt: f.due_at,
              })),
              recentSignals: (sigs ?? []).map((s) => ({
                source: s.source,
                type: s.signal_type,
                snippet: s.snippet,
                at: s.occurred_at,
              })),
              relations: relatedNames,
            });
          }

          return { count: contacts.length, contacts };
        },
      }),

      proposeWorkSession: tool({
        description:
          "Foreslå start av arbeidsøkt i Work. Starter ALDRI automatisk — brukeren må bekrefte i UI. Oppgi prosjektnavn (valgfritt org-navn og sats). Bruk når brukeren vil starte timer/økt.",
        inputSchema: z.object({
          projectName: z.string().min(1).max(120),
          orgName: z.string().max(120).nullable().optional(),
          rateName: z.string().max(80).nullable().optional(),
          comment: z.string().max(500).nullable().optional(),
        }),
        execute: async ({ projectName, orgName, rateName, comment }) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { resolveWorkConnection, listWorkProjects, listWorkRates } = await import(
            "@/lib/work/work-api.server"
          );

          const { data: memberships } = await supabase
            .from("memberships")
            .select("org_id")
            .eq("user_id", userId);
          const orgIds = (memberships ?? []).map((m) => m.org_id as string);
          if (!orgIds.length) {
            steps.push({ label: "Work-økt", detail: "Ingen medlemskap" });
            return { ok: false, error: "Ingen organisasjoner funnet" };
          }

          const { data: platformOrgs } = await supabase
            .from("organizations")
            .select("id, name, slug")
            .in("id", orgIds);

          let platformOrgSlug: string | null = null;
          if (orgName?.trim() && platformOrgs?.length) {
            const match = matchByName(
              platformOrgs.map((o) => ({ name: o.name as string, slug: o.slug as string })),
              orgName,
            );
            platformOrgSlug = match?.slug ?? null;
          }
          if (!platformOrgSlug && platformOrgs?.[0]) {
            platformOrgSlug = platformOrgs[0].slug as string;
          }

          const ctx = await resolveWorkConnection({
            supabaseAdmin,
            userId,
            orgSlug: platformOrgSlug,
          });
          if (!ctx) {
            steps.push({ label: "Work-økt", detail: "Ingen koblet Work" });
            return { ok: false, error: "Ingen koblet Work-organisasjon" };
          }

          try {
            const [projects, rates] = await Promise.all([
              listWorkProjects(ctx),
              listWorkRates(ctx),
            ]);
            const project = matchByName(projects, projectName);
            if (!project) {
              steps.push({
                label: "Work-økt",
                detail: `Fant ikke prosjekt «${projectName}»`,
              });
              return {
                ok: false,
                error: `Fant ikke prosjekt «${projectName}»`,
                availableProjects: projects.slice(0, 12).map((p) => p.name),
              };
            }

            const rate = rateName?.trim()
              ? matchByName(rates, rateName)
              : (rates[0] ?? null);

            out.workProposal = {
              organizationId: ctx.connection.external_org_id as string,
              organizationName:
                (ctx.connection.external_org_name as string | null) ||
                ctx.orgName ||
                "Work",
              projectId: project.id,
              projectName: project.name,
              rateId: rate?.id ?? null,
              rateName: rate?.name ?? null,
              hourlyRate: rate ? Number(rate.amount) : null,
              comment: comment?.trim() || null,
              platformOrgSlug,
            };

            steps.push({
              label: "Foreslo arbeidsøkt",
              detail: `${out.workProposal.organizationName} · ${project.name}`,
            });

            return {
              ok: true,
              note: "Forslag klart — brukeren må bekrefte i UI før økten starter.",
              proposal: out.workProposal,
            };
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Work-feil";
            steps.push({ label: "Work-økt", detail: msg });
            return { ok: false, error: msg };
          }
        },
      }),

      proposeEmailDraft: tool({
        description:
          "Lag e-postutkast. Sender ALDRI automatisk — brukeren forhåndsviser og lagrer/sender i UI. Bruk når brukeren ber om å skrive mail. Oppgi to (e-post), subject og body.",
        inputSchema: z.object({
          to: z.string().email(),
          subject: z.string().min(1).max(300),
          body: z.string().min(1).max(20000),
        }),
        execute: async ({ to, subject, body }) => {
          out.draft = { to, subject, body };
          steps.push({ label: `Utkast til ${to}`, detail: subject });
          return {
            ok: true,
            note: "Utkastet vises i Nexus. Brukeren lagrer i Gmail eller sender selv.",
          };
        },
      }),
    };

    const system = [
      "Du er Fortell — Peders desk-assistent i Nexus.",
      `I dag er ${osloToday()} (Europe/Oslo).`,
      "Du har KUN tre verktøy:",
      "1) readContact — les person/selskap i Nexus",
      "2) proposeWorkSession — foreslå start av arbeidsøkt (starter ikke selv)",
      "3) proposeEmailDraft — foreslå e-postutkast (sender ikke selv)",
      "Regler:",
      "- Bruk verktøy når det trengs. Oppfinn ikke e-postadresser, prosjektnavn eller fakta.",
      "- Ved arbeidsøkt: hvis prosjekt er uklart, spør eller list forslag fra tool-feil.",
      "- Ved mail: skriv kort norsk body (2–8 setninger), ingen oppdiktede fakta. Ikke signer med navn.",
      "- Du utfører ALDRI handlinger uten foreslå-tools — brukeren bekrefter i UI.",
      "- Skriv alltid et klart sluttsvar på norsk. Ingen markdown-overskrifter.",
    ].join("\n");

    const result = await generateText({
      model: getGeminiModel("flash"),
      system,
      prompt: data.instruction,
      tools,
      stopWhen: stepCountIs(8),
    });

    const answer = result.text.trim();
    let fallback = "Si hvem du vil vite om, hvilken økt du vil starte, eller hvem du vil maile.";
    if (out.draft) {
      fallback = "Utkastet er klart under — les gjennom før du lagrer eller sender.";
    }
    if (out.workProposal) {
      fallback = `Klar til å starte økt: ${out.workProposal.projectName} hos ${out.workProposal.organizationName}. Bekreft under.`;
    }

    return {
      answer: answer || fallback,
      steps,
      draft: out.draft,
      workProposal: out.workProposal,
    };
  });
