/**
 * Fortell Nexus — thin desk agent (contact / work start·stop / mail draft).
 * Never auto-starts, stops, or sends — UI confirms actions.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, stepCountIs, tool } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createGeminiProvider,
  getGeminiApiKey,
  getGeminiModel,
} from "@/lib/ai-gateway.server";
import { getBrregRoles, searchBrregCompanies } from "@/lib/brreg.server";

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

export type FortellStopProposal = {
  breakMinutes: number;
};

export type FortellActiveSessionHint = {
  projectName: string;
  organizationName: string;
  startedAt: string;
  platformOrgSlug: string | null;
};

export type FortellUnpaidInvoice = {
  id: string;
  orgSlug: string;
  orgName: string;
  invoiceNumber: string | null;
  customerName: string;
  customerEmail: string | null;
  total: number;
  dueDate: string | null;
  href: string | null;
};

export type FortellMailHit = {
  subject: string;
  from: string;
  snippet: string;
  href: string;
  date: string | null;
};

export type FortellSlackHit = {
  channel: string;
  from: string;
  snippet: string;
  href: string | null;
  at: string | null;
};

export type FortellContactProposal = {
  entityId: string;
  name: string;
  email: string | null;
  role: string | null;
  phone: string | null;
  website: string | null;
  orgNr: string | null;
  address: string | null;
  industry: string | null;
  summary: string | null;
  reason: string | null;
};

export type FortellChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type FortellResult = {
  answer: string;
  steps: FortellStep[];
  draft: FortellDraft | null;
  workProposal: FortellWorkProposal | null;
  stopProposal: FortellStopProposal | null;
  unpaidInvoices: FortellUnpaidInvoice[];
  mailHits: FortellMailHit[];
  slackHits: FortellSlackHit[];
  contactProposal: FortellContactProposal | null;
};

const Input = z.object({
  instruction: z.string().min(2).max(2000),
  preferredOrgSlug: z.string().max(80).nullable().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .max(16)
    .optional(),
  activeSession: z
    .object({
      projectName: z.string().min(1).max(120),
      organizationName: z.string().min(1).max(120),
      startedAt: z.string().min(1).max(40),
      platformOrgSlug: z.string().max(80).nullable().optional(),
    })
    .nullable()
    .optional(),
});

function formatNok(amount: number): string {
  return new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

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
    const active = data.activeSession ?? null;
    const preferredOrgSlug =
      data.preferredOrgSlug?.trim() ||
      data.activeSession?.platformOrgSlug?.trim() ||
      null;

    /** Mutable bag — TS does not track assignments inside tool closures. */
    const out: {
      draft: FortellDraft | null;
      workProposal: FortellWorkProposal | null;
      stopProposal: FortellStopProposal | null;
      unpaidInvoices: FortellUnpaidInvoice[];
      mailHits: FortellMailHit[];
      slackHits: FortellSlackHit[];
      contactProposal: FortellContactProposal | null;
    } = {
      draft: null,
      workProposal: null,
      stopProposal: null,
      unpaidInvoices: [],
      mailHits: [],
      slackHits: [],
      contactProposal: null,
    };

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

      searchWeb: tool({
        description:
          "Søk på nett etter person/selskap (adresse, nettside, daglig leder, handelsnavn). Bruk før proposeContactUpdate når brukeren ber om å finne mer info.",
        inputSchema: z.object({
          query: z.string().min(3).max(300),
        }),
        execute: async ({ query }) => {
          steps.push({ label: "Søkte på nett", detail: query });
          try {
            const google = createGeminiProvider();
            const grounded = await generateText({
              model: google("gemini-3.5-flash-lite"),
              tools: {
                google_search: google.tools.googleSearch({}) as never,
              },
              prompt: [
                "Du hjelper med oppslag for et norsk CRM.",
                "Svar kort på norsk. Trekk ut konkrete fakta: juridisk selskapsnavn, org.nr (9 siffer), adresse, nettside, e-post, telefon, daglig leder/eiere hvis nevnt.",
                "Ikke finn på org.nr eller e-post. Hvis usikkert, si det.",
                `Søk: ${query}`,
              ].join("\n"),
            });
            const sources = (grounded.sources ?? [])
              .slice(0, 8)
              .map((s) => {
                const url = "url" in s && typeof s.url === "string" ? s.url : null;
                const title = "title" in s && typeof s.title === "string" ? s.title : null;
                return url ? { title, url } : null;
              })
              .filter((s): s is { title: string | null; url: string } => !!s);
            return { summary: grounded.text.trim(), sources };
          } catch (e) {
            return {
              summary: "",
              sources: [],
              error: e instanceof Error ? e.message : "Nettsøk feilet",
            };
          }
        },
      }),

      lookupBrregCompany: tool({
        description:
          "Søk Brønnøysund etter norsk selskap. Bruk etter searchWeb eller når org.nr/juridisk navn er kjent.",
        inputSchema: z.object({
          name: z.string().min(2).max(120),
          city: z.string().max(80).nullable().optional(),
          addressHint: z.string().max(120).nullable().optional(),
        }),
        execute: async ({ name, city, addressHint }) => {
          steps.push({
            label: "Søkte i Brreg",
            detail: [name, city, addressHint].filter(Boolean).join(" · "),
          });
          try {
            const companies = await searchBrregCompanies({
              name,
              city: city ?? null,
              addressHint: addressHint ?? null,
            });
            return { companies, count: companies.length };
          } catch (e) {
            return {
              companies: [],
              count: 0,
              error: e instanceof Error ? e.message : "Brreg-feil",
            };
          }
        },
      }),

      getBrregRoles: tool({
        description:
          "Hent roller (daglig leder, styre) for org.nr fra Brreg. Bruk etter lookupBrregCompany.",
        inputSchema: z.object({
          orgNr: z.string().min(9).max(20),
        }),
        execute: async ({ orgNr }) => {
          steps.push({ label: "Hentet Brreg-roller", detail: orgNr });
          try {
            return await getBrregRoles(orgNr);
          } catch (e) {
            return {
              orgNr,
              roles: [],
              dagligLeder: null,
              error: e instanceof Error ? e.message : "Brreg-feil",
            };
          }
        },
      }),

      proposeContactUpdate: tool({
        description:
          "Foreslå oppdatering av eksisterende Nexus-kontakt etter oppslag. Lagrer IKKE — brukeren godkjenner i UI og åpner kontaktsiden. Bruk entityId fra readContact. Bare fyll felt du faktisk fant.",
        inputSchema: z.object({
          entityId: z.string().uuid(),
          email: z.string().email().nullable().optional(),
          role: z.string().max(120).nullable().optional(),
          phone: z.string().max(40).nullable().optional(),
          website: z.string().max(200).nullable().optional(),
          orgNr: z.string().max(20).nullable().optional(),
          address: z.string().max(200).nullable().optional(),
          industry: z.string().max(120).nullable().optional(),
          summary: z.string().max(500).nullable().optional(),
          reason: z.string().max(300).optional(),
        }),
        execute: async (input) => {
          const { data: row } = await supabase
            .from("entities")
            .select("id, name, type")
            .eq("id", input.entityId)
            .eq("user_id", userId)
            .maybeSingle();
          if (!row) {
            steps.push({ label: "Kontaktforslag", detail: "Fant ikke entityId" });
            return { ok: false, error: "Kontakt ikke funnet" };
          }
          out.contactProposal = {
            entityId: row.id as string,
            name: row.name as string,
            email: input.email ?? null,
            role: input.role ?? null,
            phone: input.phone ?? null,
            website: input.website ?? null,
            orgNr: input.orgNr ?? null,
            address: input.address ?? null,
            industry: input.industry ?? null,
            summary: input.summary ?? null,
            reason: input.reason ?? "Foreslått etter oppslag",
          };
          steps.push({
            label: "Foreslo kontaktoppdatering",
            detail: row.name as string,
          });
          return {
            ok: true,
            note: "Forslag klart — brukeren må bekrefte i UI før lagring.",
            proposal: out.contactProposal,
          };
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

      listUnpaidInvoices: tool({
        description:
          "Hent ubetalte/sendte fakturaer fra Finance. Bruk når brukeren spør om ubetalte fakturaer, utestående, forfalte fakturaer eller pengekrav. Valgfri org-slug eller org-navn.",
        inputSchema: z.object({
          orgName: z.string().max(120).nullable().optional(),
          orgSlug: z.string().max(80).nullable().optional(),
        }),
        execute: async ({ orgName, orgSlug }) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { resolveFinanceConnection, listUnpaidFinanceInvoices } = await import(
            "@/lib/finance/finance-invoice.server"
          );
          const { resolveModuleOpenUrl } = await import("@/lib/module-connections");

          const { data: memberships } = await supabase
            .from("memberships")
            .select("org_id")
            .eq("user_id", userId);
          const orgIds = (memberships ?? []).map((m) => m.org_id as string);
          if (!orgIds.length) {
            steps.push({ label: "Finance", detail: "Ingen medlemskap" });
            return { ok: false, error: "Ingen organisasjoner funnet", invoices: [] };
          }

          const { data: platformOrgs } = await supabase
            .from("organizations")
            .select("id, name, slug")
            .in("id", orgIds);

          const orgs = (platformOrgs ?? []).map((o) => ({
            id: o.id as string,
            name: o.name as string,
            slug: o.slug as string,
          }));

          let slugsToCheck: string[] = [];
          const wantSlug = orgSlug?.trim() || preferredOrgSlug;
          if (wantSlug && orgs.some((o) => o.slug === wantSlug)) {
            slugsToCheck = [wantSlug];
          } else if (orgName?.trim()) {
            const match = matchByName(orgs, orgName);
            if (match) slugsToCheck = [match.slug];
          }
          if (!slugsToCheck.length) {
            // Prefer orgs that have a connected finance module
            const { data: conns } = await supabase
              .from("module_connections")
              .select("org_id")
              .eq("module_slug", "finance")
              .eq("status", "connected")
              .in("org_id", orgIds);
            const connectedOrgIds = new Set((conns ?? []).map((c) => c.org_id as string));
            slugsToCheck = orgs.filter((o) => connectedOrgIds.has(o.id)).map((o) => o.slug);
          }
          if (!slugsToCheck.length) {
            steps.push({ label: "Finance", detail: "Ingen Finance-kobling" });
            return {
              ok: false,
              error: "Ingen koblet Finance-organisasjon",
              invoices: [],
            };
          }

          const invoices: FortellUnpaidInvoice[] = [];
          const errors: string[] = [];

          for (const slug of slugsToCheck.slice(0, 4)) {
            const fin = await resolveFinanceConnection({
              supabaseAdmin,
              userId,
              orgSlug: slug,
            }).catch(() => null);
            if (!fin) {
              errors.push(`${slug}: ikke koblet`);
              continue;
            }
            try {
              const rows = await listUnpaidFinanceInvoices(fin);
              const home = resolveModuleOpenUrl(fin.connection);
              for (const inv of rows) {
                invoices.push({
                  id: inv.id,
                  orgSlug: fin.orgSlug,
                  orgName: fin.orgName,
                  invoiceNumber: inv.invoice_number,
                  customerName: inv.customer_name,
                  customerEmail: inv.customer_email,
                  total: inv.total,
                  dueDate: inv.due_date,
                  href: home
                    ? `${home.replace(/\/$/, "")}/invoices/${inv.id}`
                    : null,
                });
              }
            } catch (e) {
              errors.push(
                `${fin.orgName}: ${e instanceof Error ? e.message : "Finance-feil"}`,
              );
            }
          }

          out.unpaidInvoices = invoices;
          const total = invoices.reduce((sum, i) => sum + i.total, 0);
          steps.push({
            label: "Hentet ubetalte fakturaer",
            detail:
              invoices.length === 0
                ? "Ingen funnet"
                : `${invoices.length} stk · ${formatNok(total)} kr`,
          });

          return {
            ok: true,
            count: invoices.length,
            totalNok: Math.round(total),
            totalFormatted: `${formatNok(total)} kr`,
            invoices: invoices.map((i) => ({
              number: i.invoiceNumber,
              customer: i.customerName,
              email: i.customerEmail,
              amount: `${formatNok(i.total)} kr`,
              dueDate: i.dueDate,
              org: i.orgName,
              href: i.href,
            })),
            errors: errors.length ? errors : undefined,
          };
        },
      }),

      searchImportantMail: tool({
        description:
          "Søk i Gmail etter viktige/ubesvarte mail. Bruk når brukeren spør om mail å svare på, uleste, viktige meldinger. Standard: ulest inbox uten promo/social. Kan også bruke Gmail-søkesyntaks (from:, subject:, newer_than:).",
        inputSchema: z.object({
          query: z.string().max(400).nullable().optional(),
          max: z.number().int().min(1).max(15).optional(),
        }),
        execute: async ({ query, max }) => {
          const gmail = await import("@/lib/inbox/gmail.server");
          const q =
            query?.trim() ||
            "is:unread label:inbox -category:promotions -category:social -category:forums";
          steps.push({ label: "Søkte i Gmail", detail: q });
          try {
            const hits = await gmail.searchGmailMessages(q, max ?? 10);
            out.mailHits = hits.map((h) => ({
              subject: h.subject,
              from: h.from,
              snippet: h.snippet,
              href: `https://mail.google.com/mail/u/0/#inbox/${h.threadId}`,
              date: h.date,
            }));
            return {
              ok: true,
              count: out.mailHits.length,
              query: q,
              hits: out.mailHits.map((h) => ({
                subject: h.subject,
                from: h.from,
                snippet: h.snippet,
                date: h.date,
              })),
            };
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Gmail-feil";
            steps.push({ label: "Gmail-feil", detail: msg });
            return { ok: false, error: msg, hits: [] };
          }
        },
      }),

      searchSlack: tool({
        description:
          "Les Slack denne uken (mentions, DM, #drift/ops og whitelisted kanaler). Bruk når brukeren spør om Slack, vakt, eSkjenk, drift, eller hva som skjer i kanaler. Valgfri filtertekst (f.eks. eskjenk, vakt).",
        inputSchema: z.object({
          query: z.string().max(120).nullable().optional(),
          channelHint: z.string().max(80).nullable().optional(),
        }),
        execute: async ({ query, channelHint }) => {
          const { data: memberships } = await supabase
            .from("memberships")
            .select("org_id")
            .eq("user_id", userId);
          const organizationIds = (memberships ?? []).map((m) => m.org_id as string);

          steps.push({
            label: "Leste Slack",
            detail: [channelHint, query].filter(Boolean).join(" · ") || "denne uken",
          });

          try {
            const { fetchSlackMissionSignals } = await import(
              "@/lib/morning-mission/slack-mission.server"
            );
            const { signals, status } = await fetchSlackMissionSignals({
              force: true,
              organizationIds,
            });

            const q = query?.trim().toLowerCase() ?? "";
            const ch = channelHint?.trim().toLowerCase().replace(/^#/, "") ?? "";

            let filtered = signals.filter((s) => s.source === "slack");
            if (ch) {
              filtered = filtered.filter(
                (s) =>
                  (s.from ?? "").toLowerCase().includes(ch) ||
                  (s.subject ?? "").toLowerCase().includes(ch) ||
                  (s.snippet ?? "").toLowerCase().includes(ch),
              );
            }
            if (q) {
              filtered = filtered.filter((s) => {
                const blob = `${s.subject} ${s.snippet} ${s.from}`.toLowerCase();
                return blob.includes(q);
              });
            }

            const hits = filtered.slice(0, 15).map((s) => ({
              channel: s.from,
              from: s.subject,
              snippet: s.snippet.slice(0, 280),
              href: s.href,
              at: s.occurred_at,
            }));
            out.slackHits = hits;

            return {
              ok: true,
              connected: status.connected,
              readOk: status.read_ok,
              statusMessage: status.message,
              suggestion: status.suggestion,
              count: hits.length,
              totalThisWeek: signals.filter((s) => s.source === "slack").length,
              hits,
            };
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Slack-feil";
            steps.push({ label: "Slack-feil", detail: msg });
            return { ok: false, error: msg, hits: [] };
          }
        },
      }),

      proposeStopWorkSession: tool({
        description:
          "Foreslå å avslutte den aktive arbeidsøkten i Nexus og synke til Work. Stopper ALDRI automatisk — brukeren må bekrefte i UI. Bruk når brukeren vil avslutte/stoppe økt. Valgfri pause i minutter.",
        inputSchema: z.object({
          breakMinutes: z.number().int().min(0).max(24 * 60).optional(),
        }),
        execute: async ({ breakMinutes }) => {
          if (!active) {
            steps.push({ label: "Avslutt økt", detail: "Ingen aktiv økt" });
            return {
              ok: false,
              error: "Ingen aktiv arbeidsøkt i Nexus akkurat nå.",
            };
          }
          const pause = breakMinutes ?? 0;
          out.stopProposal = { breakMinutes: pause };
          steps.push({
            label: "Foreslo å avslutte økt",
            detail: `${active.projectName} · ${active.organizationName}`,
          });
          return {
            ok: true,
            note: "Forslag klart — brukeren må bekrefte i UI før økten stoppes og synkes.",
            session: active,
            breakMinutes: pause,
          };
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

    const sessionLine = active
      ? `Aktiv økt nå: «${active.projectName}» hos «${active.organizationName}» (startet ${active.startedAt}). Bruk proposeStopWorkSession når brukeren vil avslutte.`
      : "Ingen aktiv arbeidsøkt i Nexus akkurat nå.";

    const system = [
      "Du er Fortell — Peders desk-assistent i Nexus.",
      `I dag er ${osloToday()} (Europe/Oslo).`,
      sessionLine,
      "Du har samtalehistorikk: les tidligere meldinger og hold kontekst (oppfølgingsspørsmål, tidligere beslutninger).",
      "Du har KUN disse verktøyene:",
      "1) readContact — les person/selskap i Nexus",
      "2) searchWeb / lookupBrregCompany / getBrregRoles — finn mer info på nett/Brreg",
      "3) proposeContactUpdate — foreslå felt på eksisterende kontakt (lagrer ikke selv)",
      "4) searchImportantMail — søk Gmail (viktige/uleste)",
      "5) searchSlack — les Slack denne uken (#drift, mentions, DM)",
      "6) listUnpaidInvoices — ubetalte fakturaer fra Finance",
      "7) proposeWorkSession / proposeStopWorkSession — Work-økt (starter/stopper ikke selv)",
      "8) proposeEmailDraft — e-postutkast (sender ikke selv)",
      "Regler:",
      "- Bruk historikk. Hvis bruker sier «send mail» etter kontekst om Josefines/ikke på jobb — bruk den konteksten.",
      "- Ved «finn X på nett / fyll kontakt»: readContact → searchWeb (+ Brreg ved selskap) → proposeContactUpdate med entityId.",
      "- Oppfinn ALDRI e-post, org.nr, telefon eller Slack-innhold.",
      "- Ved viktige mail: searchImportantMail. Ved Slack/vakt/eSkjenk: searchSlack.",
      "- Ved mailutkast: kort norsk, ingen oppdiktede fakta. Ikke signer med navn.",
      "- Du lagrer/sender/starter ALDRI uten foreslå-tools — brukeren bekrefter i UI.",
      "- Skriv alltid et klart sluttsvar på norsk. Ingen markdown-overskrifter.",
    ].join("\n");

    const history = (data.history ?? []).slice(-12);
    const result = await generateText({
      model: getGeminiModel("flash"),
      system,
      messages: [
        ...history.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: data.instruction },
      ],
      tools,
      stopWhen: stepCountIs(14),
    });

    const answer = result.text.trim();
    let fallback =
      "Si hva du trenger: mail, Slack, fakturaer, kontakt, start/avslutt økt, eller mailutkast.";
    if (out.draft) {
      fallback = "Utkastet er klart under — les gjennom før du lagrer eller sender.";
    }
    if (out.workProposal) {
      fallback = `Klar til å starte økt: ${out.workProposal.projectName} hos ${out.workProposal.organizationName}. Bekreft under.`;
    }
    if (out.stopProposal && active) {
      fallback = `Klar til å avslutte økt: ${active.projectName}. Bekreft under.`;
    }
    if (out.unpaidInvoices.length > 0) {
      const total = out.unpaidInvoices.reduce((s, i) => s + i.total, 0);
      fallback = `Du har ${out.unpaidInvoices.length} ubetalte fakturaer (${formatNok(total)} kr). Se listen under.`;
    } else if (steps.some((s) => s.label === "Hentet ubetalte fakturaer")) {
      fallback = "Ingen ubetalte fakturaer funnet i Finance akkurat nå.";
    }
    if (out.mailHits.length > 0) {
      fallback = `Fant ${out.mailHits.length} mailtreff. Se listen under.`;
    } else if (steps.some((s) => s.label === "Søkte i Gmail")) {
      fallback = "Ingen treff i Gmail for det søket.";
    }
    if (out.slackHits.length > 0) {
      fallback = `Fant ${out.slackHits.length} Slack-treff denne uken. Se listen under.`;
    } else if (steps.some((s) => s.label === "Leste Slack")) {
      fallback = "Ingen matchende Slack-meldinger denne uken.";
    }
    if (out.contactProposal) {
      fallback = `Forslag til oppdatering av ${out.contactProposal.name} er klart — bekreft under.`;
    }

    return {
      answer: answer || fallback,
      steps,
      draft: out.draft,
      workProposal: out.workProposal,
      stopProposal: out.stopProposal,
      unpaidInvoices: out.unpaidInvoices,
      mailHits: out.mailHits,
      slackHits: out.slackHits,
      contactProposal: out.contactProposal,
    };
  });

/** Apply a Fortell contact proposal (user confirmed). */
export const applyFortellContactProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: z.string().uuid(),
        email: z.string().email().nullable().optional(),
        role: z.string().max(120).nullable().optional(),
        phone: z.string().max(40).nullable().optional(),
        website: z.string().max(200).nullable().optional(),
        orgNr: z.string().max(20).nullable().optional(),
        address: z.string().max(200).nullable().optional(),
        industry: z.string().max(120).nullable().optional(),
        summary: z.string().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("entities")
      .select("id, name, type, metadata, summary")
      .eq("id", data.entityId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Kontakt ikke funnet");
    if (row.type !== "person" && row.type !== "company") {
      throw new Error("Bare person/selskap kan oppdateres");
    }

    const meta: Record<string, unknown> = {
      ...((row.metadata ?? {}) as Record<string, unknown>),
    };
    const setField = (key: string, value: string | null | undefined) => {
      if (value === undefined) return;
      const t = (value ?? "").trim();
      if (!t) return;
      meta[key] = t;
    };

    if (data.email?.trim()) {
      const email = data.email.trim().toLowerCase();
      meta.email = email;
      const domain = email.split("@")[1] ?? null;
      if (domain) meta.email_domain = domain;
    }
    setField("role", data.role);
    if (data.phone?.trim()) {
      meta.phone = data.phone.trim().replace(/\s+/g, " ").slice(0, 40);
    }
    if (data.website?.trim()) {
      let website = data.website.trim().slice(0, 200);
      if (!/^https?:\/\//i.test(website) && /^[\w.-]+\.[a-z]{2,}/i.test(website)) {
        website = `https://${website}`;
      }
      meta.website = website;
    }
    if (data.orgNr) {
      const digits = data.orgNr.replace(/\D/g, "").slice(0, 9);
      if (digits) meta.org_nr = digits;
    }
    setField("address", data.address);
    setField("industry", data.industry);

    const patch: Record<string, unknown> = {
      metadata: meta,
      updated_at: new Date().toISOString(),
    };
    if (data.summary?.trim()) {
      patch.summary = data.summary.trim().slice(0, 500);
    }

    const { error: upErr } = await supabase
      .from("entities")
      .update(patch as never)
      .eq("id", data.entityId)
      .eq("user_id", userId);
    if (upErr) throw upErr;

    if (data.email?.trim()) {
      const email = data.email.trim().toLowerCase();
      const now = new Date().toISOString();
      const { data: existing } = await supabase
        .from("known_identities")
        .select("id")
        .eq("user_id", userId)
        .eq("identity_type", "email_address")
        .eq("external_key", email)
        .maybeSingle();
      if (existing?.id) {
        await supabase
          .from("known_identities")
          .update({ entity_id: data.entityId, ignored_at: null, updated_at: now })
          .eq("id", existing.id);
      } else {
        await supabase.from("known_identities").insert({
          user_id: userId,
          identity_type: "email_address",
          external_key: email,
          entity_id: data.entityId,
          created_at: now,
          updated_at: now,
        } as never);
      }
    }

    return { ok: true as const, entityId: data.entityId, name: row.name as string };
  });
