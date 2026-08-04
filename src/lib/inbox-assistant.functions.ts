// Nexus-assistent — agentic Gemini over inbox, contacts, Brreg and web search.
// Drafts are returned to the UI for preview/edit/send in Nexus — never auto-sent.
// Contact suggestions are opt-in (suggestContact + draft recipient), never harvested
// from every Gmail hit (that was pulling in bank noreply noise).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, stepCountIs, tool } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createGeminiProvider, getGeminiApiKey, getGeminiModel } from "@/lib/ai-gateway.server";
import { extractEmailDomain } from "@/lib/knowledge/entity-matcher";
import { ANCHOR_SLUG_SET } from "@/lib/knowledge/types";
import { getBrregRoles, searchBrregCompanies } from "@/lib/brreg.server";

export type AssistantStep = { label: string; detail: string | null };

export type SuggestedContact = {
  name: string;
  email: string | null;
  entityType: "person" | "company";
  reason: string;
  role?: string | null;
  phone?: string | null;
  website?: string | null;
  orgNr?: string | null;
  address?: string | null;
  /** Link person → this company name when creating */
  relateToCompanyName?: string | null;
};

export type SuggestedRelation = {
  fromName: string;
  toName: string;
  kind: "works_on" | "customer_of" | "member_of" | "owns" | "blocked_by" | "related_to";
  role: string | null;
  reason: string;
  fromEntityId: string | null;
  toEntityId: string | null;
};

export type SuggestedMerge = {
  keepName: string;
  absorbName: string;
  reason: string;
  keepEntityId: string | null;
  absorbEntityId: string | null;
};

export type AssistantDraft = {
  to: string;
  subject: string;
  body: string;
  /** Suggested signature tone — user confirms in UI. */
  suggestedTone: "casual" | "professional" | null;
  /** Suggested Gmail sendAs address — user confirms in UI. */
  suggestedFromEmail: string | null;
};

export type AssistantResult = {
  answer: string;
  steps: AssistantStep[];
  draft: AssistantDraft | null;
  suggestedContacts: SuggestedContact[];
  suggestedRelations: SuggestedRelation[];
  suggestedMerges: SuggestedMerge[];
};

const RELATION_KINDS = [
  "works_on",
  "customer_of",
  "member_of",
  "owns",
  "blocked_by",
  "related_to",
] as const;

const Input = z.object({ instruction: z.string().min(3).max(2000) });

function osloToday(): string {
  return new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "full",
    timeZone: "Europe/Oslo",
  }).format(new Date());
}

function nameFromEmailLocal(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._+-]+/).filter(Boolean);
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ")
    .slice(0, 120);
}

/** Same spirit as identity.server isNoisyEmail — catches __no-reply@dnb.no etc. */
function isNoisyEmail(email: string): boolean {
  const local = (email.split("@")[0] ?? "").toLowerCase();
  if (!local) return true;
  if (
    /^(noreply|no-reply|donotreply|do-not-reply|mailer-daemon|mailerdaemon|notifications?|newsletter|news|updates?|bounce|postmaster|daemon)$/i.test(
      local,
    )
  ) {
    return true;
  }
  if (
    local.includes("noreply") ||
    local.includes("no-reply") ||
    local.includes("donotreply") ||
    local.includes("do-not-reply") ||
    local.includes("mailer-daemon")
  ) {
    return true;
  }
  return false;
}

async function emailExistsInNexus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  email: string,
): Promise<boolean> {
  const key = email.toLowerCase();
  const { data: idRow } = await supabase
    .from("known_identities")
    .select("id")
    .eq("user_id", userId)
    .eq("identity_type", "email_address")
    .eq("external_key", key)
    .not("entity_id", "is", null)
    .is("ignored_at", null)
    .limit(1)
    .maybeSingle();
  if (idRow?.id) return true;
  const { data: entRow } = await supabase
    .from("entities")
    .select("id")
    .eq("user_id", userId)
    .contains("metadata", { email: key } as never)
    .limit(1)
    .maybeSingle();
  return !!entRow?.id;
}

async function resolveEntityByName(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  name: string,
  preferType?: "person" | "company" | null,
): Promise<{ id: string; name: string; type: string } | null> {
  const q = name.trim();
  if (!q) return null;
  let query = supabase
    .from("entities")
    .select("id, name, type")
    .eq("user_id", userId)
    .in("type", ["person", "company"])
    .ilike("name", q)
    .limit(3);
  if (preferType) query = query.eq("type", preferType);
  const { data: exact } = await query;
  if (exact?.[0]) return exact[0] as { id: string; name: string; type: string };

  const { data: fuzzy } = await supabase
    .from("entities")
    .select("id, name, type")
    .eq("user_id", userId)
    .in("type", ["person", "company"])
    .ilike("name", `%${q}%`)
    .limit(5);
  const rows = (fuzzy ?? []) as Array<{ id: string; name: string; type: string }>;
  if (preferType) {
    const typed = rows.find((r) => r.type === preferType);
    if (typed) return typed;
  }
  return rows[0] ?? null;
}

export const runInboxAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }): Promise<AssistantResult> => {
    const { supabase, userId, claims } = context;
    if (!getGeminiApiKey()) {
      throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY)");
    }

    const selfEmail = typeof claims?.email === "string" ? claims.email.toLowerCase() : null;

    const gmail = await import("@/lib/inbox/gmail.server");
    const steps: AssistantStep[] = [];
    let draft: AssistantDraft | null = null;
    const suggestions = new Map<string, SuggestedContact>();
    const relationSuggestions = new Map<string, SuggestedRelation>();
    const mergeSuggestions = new Map<string, SuggestedMerge>();

    async function addRelationSuggestion(input: {
      fromName: string;
      toName: string;
      kind: SuggestedRelation["kind"];
      role?: string | null;
      reason: string;
      fromEntityId?: string | null;
      toEntityId?: string | null;
    }) {
      const fromName = input.fromName.trim().slice(0, 120);
      const toName = input.toName.trim().slice(0, 120);
      if (!fromName || !toName || fromName.toLowerCase() === toName.toLowerCase()) return;
      const key = `${fromName.toLowerCase()}|${input.kind}|${toName.toLowerCase()}`;
      if (relationSuggestions.has(key)) return;

      let fromEntityId = input.fromEntityId ?? null;
      let toEntityId = input.toEntityId ?? null;
      if (!fromEntityId) {
        fromEntityId = (await resolveEntityByName(supabase, userId, fromName))?.id ?? null;
      }
      if (!toEntityId) {
        toEntityId = (await resolveEntityByName(supabase, userId, toName))?.id ?? null;
      }

      relationSuggestions.set(key, {
        fromName,
        toName,
        kind: input.kind,
        role: input.role?.trim().slice(0, 120) || null,
        reason: input.reason.slice(0, 200),
        fromEntityId,
        toEntityId,
      });
    }

    async function addMergeSuggestion(input: {
      keepName: string;
      absorbName: string;
      reason: string;
      keepEntityId?: string | null;
      absorbEntityId?: string | null;
    }) {
      const keepName = input.keepName.trim().slice(0, 120);
      const absorbName = input.absorbName.trim().slice(0, 120);
      if (!keepName || !absorbName || keepName.toLowerCase() === absorbName.toLowerCase()) return;
      const key = [keepName, absorbName]
        .map((n) => n.toLowerCase())
        .sort()
        .join("|");
      if (mergeSuggestions.has(key)) return;

      let keepEntityId = input.keepEntityId ?? null;
      let absorbEntityId = input.absorbEntityId ?? null;
      if (!keepEntityId) {
        keepEntityId =
          (await resolveEntityByName(supabase, userId, keepName, "company"))?.id ?? null;
      }
      if (!absorbEntityId) {
        absorbEntityId =
          (await resolveEntityByName(supabase, userId, absorbName, "company"))?.id ?? null;
      }

      mergeSuggestions.set(key, {
        keepName,
        absorbName,
        reason: input.reason.slice(0, 200),
        keepEntityId,
        absorbEntityId,
      });
    }

    async function addSuggestion(input: {
      name: string;
      email?: string | null;
      entityType?: "person" | "company";
      reason: string;
      role?: string | null;
      phone?: string | null;
      website?: string | null;
      orgNr?: string | null;
      address?: string | null;
      relateToCompanyName?: string | null;
    }) {
      const emailRaw = (input.email ?? "").trim().toLowerCase();
      const email = emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : null;
      if (email) {
        if (selfEmail && email === selfEmail) return;
        if (isNoisyEmail(email)) return;
        if (await emailExistsInNexus(supabase, userId, email)) return;
      }
      const name = (input.name.trim() || (email ? nameFromEmailLocal(email) : "")).slice(0, 120);
      if (!name) return;

      const key =
        email ?? `name:${input.entityType ?? "person"}:${name.toLowerCase()}:${input.orgNr ?? ""}`;
      const existing = suggestions.get(key);
      if (existing) {
        suggestions.set(key, {
          ...existing,
          name: name.length > existing.name.length ? name : existing.name,
          role: input.role ?? existing.role,
          phone: input.phone ?? existing.phone,
          website: input.website ?? existing.website,
          orgNr: input.orgNr ?? existing.orgNr,
          address: input.address ?? existing.address,
          relateToCompanyName: input.relateToCompanyName ?? existing.relateToCompanyName,
        });
        return;
      }
      const entityType = input.entityType ?? "person";
      suggestions.set(key, {
        name,
        email,
        entityType,
        reason: input.reason.slice(0, 200),
        role: input.role ?? null,
        phone: input.phone ?? null,
        website: input.website ?? null,
        orgNr: input.orgNr ?? null,
        address: input.address ?? null,
        relateToCompanyName: input.relateToCompanyName ?? null,
      });

      if (entityType === "person" && input.relateToCompanyName?.trim()) {
        await addRelationSuggestion({
          fromName: name,
          toName: input.relateToCompanyName.trim(),
          kind: "member_of",
          role: input.role,
          reason: "Person knyttet til selskap",
        });
      }
    }

    const tools = {
      findContact: tool({
        description:
          "Slå opp en kontakt i Nexus etter navn (delvis match). Returnerer navn, type og kjente e-postadresser. Bruk denne FØRST når brukeren nevner en person eller et selskap ved navn.",
        inputSchema: z.object({
          name: z.string().min(1).max(120).describe("Navn eller del av navn"),
        }),
        execute: async ({ name }) => {
          steps.push({ label: "Slo opp kontakt", detail: name });
          const { data: ents } = await supabase
            .from("entities")
            .select("id, name, type, metadata")
            .eq("user_id", userId)
            .ilike("name", `%${name.trim()}%`)
            .limit(5);
          const contacts = [];
          for (const ent of ents ?? []) {
            const { data: ids } = await supabase
              .from("known_identities")
              .select("email")
              .eq("user_id", userId)
              .eq("entity_id", ent.id)
              .not("email", "is", null)
              .limit(5);
            const meta = (ent.metadata ?? {}) as Record<string, unknown>;
            const emails = new Set<string>();
            if (typeof meta.email === "string") emails.add(meta.email.toLowerCase());
            for (const row of ids ?? []) {
              if (row.email) emails.add(row.email.toLowerCase());
            }
            contacts.push({
              name: ent.name,
              type: ent.type,
              emails: [...emails],
            });
          }
          return { contacts };
        },
      }),

      searchNexusKnowledge: tool({
        description:
          "Søk i Nexus-kunnskap (kontakter, fakta fra samtalenotater, åpne oppfølginger, relasjoner, telefonnotater). Bruk FØR eller SAMMEN med Gmail når brukeren nevner noen Nexus allerede kjenner — f.eks. HMS Kontoret etter et telefonnotat.",
        inputSchema: z.object({
          query: z.string().min(1).max(120),
        }),
        execute: async ({ query }) => {
          steps.push({ label: "Søkte i Nexus", detail: query });
          const q = query.trim();
          const { data: ents } = await supabase
            .from("entities")
            .select("id, name, type, summary, metadata")
            .eq("user_id", userId)
            .in("type", ["person", "company"])
            .or(`name.ilike.%${q}%,summary.ilike.%${q}%`)
            .limit(6);
          const contacts = [];
          for (const e of ents ?? []) {
            const meta = (e.metadata ?? {}) as Record<string, unknown>;
            const facts = Array.isArray(meta.notes_facts)
              ? meta.notes_facts.filter((x): x is string => typeof x === "string").slice(0, 6)
              : [];
            const { data: fus } = await supabase
              .from("field_follow_ups")
              .select("action, due_at")
              .eq("user_id", userId)
              .eq("entity_id", e.id)
              .eq("status", "open")
              .limit(3);
            const { data: sigs } = await supabase
              .from("entity_signals")
              .select("source, signal_type, snippet, occurred_at")
              .eq("user_id", userId)
              .eq("entity_id", e.id)
              .order("occurred_at", { ascending: false, nullsFirst: false })
              .limit(4);
            contacts.push({
              name: e.name,
              type: e.type,
              summary: e.summary,
              email: typeof meta.email === "string" ? meta.email : null,
              role: typeof meta.role === "string" ? meta.role : null,
              phone: typeof meta.phone === "string" ? meta.phone : null,
              website: typeof meta.website === "string" ? meta.website : null,
              orgNr: typeof meta.org_nr === "string" ? meta.org_nr : null,
              address: typeof meta.address === "string" ? meta.address : null,
              industry: typeof meta.industry === "string" ? meta.industry : null,
              facts,
              openFollowUps: fus ?? [],
              recentSignals: sigs ?? [],
            });
          }
          const { data: notes } = await supabase
            .from("raw_signals")
            .select("summary, raw_text, occurred_at")
            .eq("user_id", userId)
            .eq("source", "manual")
            .contains("metadata", { kind: "phone_note" } as never)
            .or(`summary.ilike.%${q}%,raw_text.ilike.%${q}%`)
            .order("occurred_at", { ascending: false, nullsFirst: false })
            .limit(4);
          const { data: ideas } = await supabase
            .from("entities")
            .select("name, summary")
            .eq("user_id", userId)
            .eq("type", "goal")
            .contains("metadata", { kind: "idea" } as never)
            .or(`name.ilike.%${q}%,summary.ilike.%${q}%`)
            .limit(8);
          return {
            contacts,
            ideas: (ideas ?? []).map((i) => ({
              title: i.name,
              text: i.summary ?? i.name,
            })),
            phoneNotes: (notes ?? []).map((n) => ({
              summary: n.summary,
              excerpt: (n.raw_text ?? "").slice(0, 600),
              at: n.occurred_at,
            })),
          };
        },
      }),

      searchGmail: tool({
        description:
          'Søk i Gmail med Gmail-søkesyntaks. Viktig: mailer brukeren har SENDT ligger i Sendt — bruk in:sent eller from:me. Eksempler: in:sent (nettside OR hjemmeside OR website), in:sent "Gold of Sicily", (from:a@x.no OR to:a@x.no) kjøreplan, after:2026/01/01. Returnerer én treff-rad per tråd.',
        inputSchema: z.object({
          query: z.string().min(2).max(400),
          max: z.number().int().min(1).max(15).optional(),
        }),
        execute: async ({ query, max }) => {
          steps.push({ label: "Søkte i Gmail", detail: query });
          const hits = await gmail.searchGmailMessages(query, max ?? 10);
          // Do NOT auto-suggest contacts from every hit — that pulls in bank/noreply noise.
          return { hits };
        },
      }),

      readThread: tool({
        description:
          "Les alle meldingene i en Gmail-tråd (threadId fra searchGmail). Returnerer avsender, mottaker, dato, tekst og vedleggsnavn per melding. Les relevante tråder FØR du konkluderer.",
        inputSchema: z.object({ threadId: z.string().min(1).max(64) }),
        execute: async ({ threadId }) => {
          const messages = await gmail.readGmailThread(threadId);
          steps.push({
            label: "Leste tråd",
            detail: messages[0]?.subject || threadId,
          });
          return { messages };
        },
      }),

      lookupBrregCompany: tool({
        description:
          "Søk i Brønnøysundregistrene (Enhetsregisteret) etter norsk selskap/underenhet. Bruk når brukeren ber om org.nr, adresse, eller å finne et selskap. Valgfri city (f.eks. Oslo) og addressHint (f.eks. Storgata).",
        inputSchema: z.object({
          name: z.string().min(2).max(120),
          city: z.string().max(80).nullable().optional(),
          addressHint: z.string().max(120).nullable().optional(),
        }),
        execute: async ({ name, city, addressHint }) => {
          const detail = [name, city, addressHint].filter(Boolean).join(" · ");
          steps.push({ label: "Søkte i Brreg", detail });
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
          "Hent roller (daglig leder, styre, …) for et org.nr fra Brønnøysund. Bruk etter lookupBrregCompany når brukeren vil finne daglig leder eller styre.",
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

      searchWeb: tool({
        description:
          "Søk på internett (Google) etter bedrift, adresse, nettside, handelsnavn. Bruk når brukeren sier «på nett», eller når Brreg ikke treffer (f.eks. restaurantnavn vs juridisk navn). Deretter: bruk org.nr fra treff mot getBrregRoles.",
        inputSchema: z.object({
          query: z.string().min(3).max(300),
        }),
        execute: async ({ query }) => {
          steps.push({ label: "Søkte på nett", detail: query });
          try {
            const google = createGeminiProvider();
            const grounded = await generateText({
              model: google("gemini-3.5-flash-lite"),
              // Provider-executed Google Search — types don't mix cleanly with function tools.
              tools: {
                google_search: google.tools.googleSearch({}) as never,
              },
              prompt: [
                "Du hjelper med oppslag for et norsk CRM.",
                "Svar kort på norsk. Trekk ut konkrete fakta: juridisk selskapsnavn, org.nr (9 siffer), adresse, nettside, daglig leder hvis nevnt.",
                "Ikke finn på org.nr. Hvis usikkert, si det.",
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

      createEmailDraft: tool({
        description:
          "Lag et e-postutkast som brukeren kan forhåndsvise, redigere og sende i Nexus. Sender ALDRI automatisk. Ikke inkluder signatur/«Vennlig hilsen» — Nexus legger på. Foreslå tone (casual/professional) og evt. avsender-e-post hvis kjent.",
        inputSchema: z.object({
          to: z.string().email(),
          subject: z.string().min(1).max(300),
          body: z.string().min(1).max(20000),
          suggestedTone: z.enum(["casual", "professional"]).nullable().optional(),
          suggestedFromEmail: z.string().email().nullable().optional(),
        }),
        execute: async ({ to, subject, body, suggestedTone, suggestedFromEmail }) => {
          const { stripTrailingSignOff } = await import("@/lib/mail-compose");
          draft = {
            to,
            subject,
            body: stripTrailingSignOff(body),
            suggestedTone: suggestedTone ?? null,
            suggestedFromEmail: suggestedFromEmail?.toLowerCase() ?? null,
          };
          steps.push({
            label: `Lagde utkast til ${to}`,
            detail: [subject, suggestedTone].filter(Boolean).join(" · "),
          });
          await addSuggestion({
            name: nameFromEmailLocal(to),
            email: to,
            reason: "Mottaker av e-postutkast",
          });
          return {
            ok: true,
            note: "Utkastet vises i Nexus. Brukeren velger avsender/signatur og sender selv.",
          };
        },
      }),

      suggestContact: tool({
        description:
          "Foreslå en ny Nexus-kontakt. E-post er valgfri. Bruk for daglig leder fra Brreg (uten e-post), eller selskap med org.nr/adresse. Sett relateToCompanyName for å koble person til selskap. Oppretter IKKE — brukeren godkjenner i UI. ALDRI noreply/bank.",
        inputSchema: z.object({
          name: z.string().min(1).max(120),
          email: z.string().email().nullable().optional(),
          entityType: z.enum(["person", "company"]).optional(),
          reason: z.string().max(200).optional(),
          role: z.string().max(120).nullable().optional(),
          phone: z.string().max(40).nullable().optional(),
          website: z.string().max(200).nullable().optional(),
          orgNr: z.string().max(20).nullable().optional(),
          address: z.string().max(200).nullable().optional(),
          relateToCompanyName: z.string().max(120).nullable().optional(),
        }),
        execute: async (input) => {
          await addSuggestion({
            name: input.name,
            email: input.email,
            entityType: input.entityType ?? "person",
            reason: input.reason ?? "Foreslått av assistenten",
            role: input.role,
            phone: input.phone,
            website: input.website,
            orgNr: input.orgNr,
            address: input.address,
            relateToCompanyName: input.relateToCompanyName,
          });
          const email = input.email?.trim().toLowerCase();
          if (!email || !isNoisyEmail(email)) {
            steps.push({
              label: "Foreslo kontakt",
              detail: email ? `${input.name} <${email}>` : input.name,
            });
          }
          return { ok: true };
        },
      }),

      suggestRelation: tool({
        description:
          "Foreslå en relasjon mellom to kontakter (finnes eller foreslått). Eks: daglig leder member_of selskap, handelsnavn related_to juridisk selskap. Brukeren godkjenner i UI.",
        inputSchema: z.object({
          fromName: z.string().min(1).max(120),
          toName: z.string().min(1).max(120),
          kind: z.enum(RELATION_KINDS),
          role: z.string().max(120).nullable().optional(),
          reason: z.string().max(200).optional(),
          fromEntityId: z.string().uuid().nullable().optional(),
          toEntityId: z.string().uuid().nullable().optional(),
        }),
        execute: async (input) => {
          await addRelationSuggestion({
            fromName: input.fromName,
            toName: input.toName,
            kind: input.kind,
            role: input.role,
            reason: input.reason ?? "Foreslått relasjon",
            fromEntityId: input.fromEntityId,
            toEntityId: input.toEntityId,
          });
          steps.push({
            label: "Foreslo relasjon",
            detail: `${input.fromName} → ${input.kind} → ${input.toName}`,
          });
          return { ok: true };
        },
      }),

      suggestMerge: tool({
        description:
          "Foreslå sammenslåing av to selskaper som er samme aktør (f.eks. handelsnavn «Brygg Storgata» + juridisk «ØSLO AS»). keepName = den som beholdes (helst den med org.nr/e-post). Brukeren godkjenner i UI.",
        inputSchema: z.object({
          keepName: z.string().min(1).max(120),
          absorbName: z.string().min(1).max(120),
          reason: z.string().max(200).optional(),
          keepEntityId: z.string().uuid().nullable().optional(),
          absorbEntityId: z.string().uuid().nullable().optional(),
        }),
        execute: async (input) => {
          await addMergeSuggestion({
            keepName: input.keepName,
            absorbName: input.absorbName,
            reason: input.reason ?? "Trolig samme selskap",
            keepEntityId: input.keepEntityId,
            absorbEntityId: input.absorbEntityId,
          });
          steps.push({
            label: "Foreslo sammenslåing",
            detail: `Behold «${input.keepName}», absorber «${input.absorbName}»`,
          });
          return { ok: true };
        },
      }),
    };

    const { loadPersonalContextPromptBlock } = await import(
      "@/lib/personal-context.server"
    );
    const personalBlock = await loadPersonalContextPromptBlock(supabase, userId);

    const system = [
      "Du er Nexus-assistenten til Peder. Du hjelper ham med innboks, nettverk, Brreg-oppslag og konkrete neste steg i arbeid/salg.",
      `I dag er ${osloToday()} (Europe/Oslo).`,
      personalBlock ?? "",
      "Moduser:",
      "A) Innboks/oppgave: søk Gmail → les → konkluder → evt. createEmailDraft.",
      "B) Analyse/råd om sendte mailer: in:sent / from:me.",
      "C) Bedriftsoppslag («søk X på nett», «finn daglig leder», «opprett kontakt»):",
      "   1) findContact + searchNexusKnowledge først.",
      "   2) searchWeb for handelsnavn/adresse (f.eks. Brygg Storgata Oslo).",
      "   3) lookupBrregCompany med juridisk navn eller kjente nøkkelord + city/addressHint.",
      "   4) getBrregRoles for org.nr → daglig leder.",
      "   5) suggestContact for selskap (orgNr/adresse) og person (rolle Daglig leder, relateToCompanyName).",
      "   6) suggestRelation: person member_of selskap; handelsnavn related_to juridisk selskap.",
      "   7) suggestMerge når Nexus allerede har handelsnavn og Brreg viser annet juridisk navn (behold den med org.nr/e-post).",
      "Arbeidsmåte:",
      "1. Nevnes person/selskap/idé: findContact + searchNexusKnowledge først, deretter Gmail/Brreg/web.",
      "2. searchGmail: in:sent/from:me for sendte mailer. Utvid query hvis tomt.",
      "3. Les tråder med readThread før du konkluderer.",
      "4. Råd: (a) funn (b) hvem som ikke svarte (c) 2–4 neste steg. createEmailDraft når det hjelper.",
      "5. createEmailDraft: norsk, 2–10 setninger, ingen oppdiktede fakta, ingen signatur. Foreslå suggestedTone (casual vs professional) og evt. suggestedFromEmail.",
      "6. suggestContact / suggestRelation / suggestMerge — brukeren godkjenner i UI. ALDRI noreply/bank.",
      "7. Oppfinn ALDRI org.nr eller daglig leder — kun fra Brreg/web-verktøy.",
      "KRITISK: Du MÅ alltid skrive et tekstlig sluttsvar på norsk. Si hva du søkte og fant. Ingen markdown-overskrifter.",
    ].join("\n");

    const result = await generateText({
      model: getGeminiModel("flash"),
      system,
      prompt: data.instruction,
      tools,
      stopWhen: stepCountIs(10),
    });

    const answer = result.text.trim();
    const searchSteps = steps
      .filter((s) => s.label === "Søkte i Gmail" && s.detail)
      .map((s) => s.detail);
    const readSteps = steps.filter((s) => s.label === "Leste tråd").length;

    let fallback = "Jeg fant ikke noe entydig svar — prøv å nevne tema, mottaker eller tidsrom.";
    if (draft) {
      fallback = "Utkastet er klart under — les gjennom og send når du er klar.";
    } else if (searchSteps.length > 0) {
      fallback = [
        readSteps > 0
          ? `Jeg søkte og leste ${readSteps} tråd(er), men rakk ikke å formulere et klart råd.`
          : "Jeg søkte i Gmail, men fant for lite å bygge et klart råd på.",
        `Søk som ble kjørt: ${searchSteps.slice(0, 4).join(" · ")}.`,
        "Prøv mer konkrete nøkkelord (f.eks. «in:sent nettside») eller nevne en mottaker.",
      ].join(" ");
    }

    return {
      answer: answer || fallback,
      steps,
      draft,
      suggestedContacts: [...suggestions.values()].slice(0, 8),
      suggestedRelations: [...relationSuggestions.values()].slice(0, 8),
      suggestedMerges: [...mergeSuggestions.values()].slice(0, 4),
    };
  });

/** Send or save-as-Gmail-draft an assistant email from Nexus UI. */
export const sendAssistantDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        to: z.string().email(),
        subject: z.string().min(1).max(300),
        body: z.string().min(1).max(20000),
        mode: z.enum(["send", "draft"]),
        fromEmail: z.string().email().nullable().optional(),
        fromDisplayName: z.string().max(80).nullable().optional(),
        signatureBody: z.string().max(4000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const gmail = await import("@/lib/inbox/gmail.server");
    const { appendMailSignature } = await import("@/lib/mail-compose");
    const body = appendMailSignature(data.body, data.signatureBody);
    const from = data.fromEmail
      ? { email: data.fromEmail, displayName: data.fromDisplayName ?? null }
      : null;
    if (data.mode === "draft") {
      const saved = await gmail.createGmailComposeDraft({
        to: data.to,
        subject: data.subject,
        body,
        from,
      });
      return {
        ok: true,
        mode: "draft" as const,
        messageId: saved.messageId,
        openUrl: saved.openUrl,
      };
    }
    const sent = await gmail.sendGmailMessage({
      to: data.to,
      subject: data.subject,
      body,
      from,
    });
    return {
      ok: true,
      mode: "send" as const,
      messageId: sent.messageId,
      openUrl: null as string | null,
    };
  });

/**
 * Create a Nexus contact from an assistant suggestion.
 * Email optional — Brreg/person lookups often only have name + role.
 */
export const createContactFromSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().min(1).max(120),
        email: z.string().email().nullable().optional(),
        entityType: z.enum(["person", "company"]).default("person"),
        role: z.string().max(120).nullable().optional(),
        phone: z.string().max(40).nullable().optional(),
        website: z.string().max(200).nullable().optional(),
        orgNr: z.string().max(20).nullable().optional(),
        address: z.string().max(200).nullable().optional(),
        relateToCompanyName: z.string().max(120).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const emailRaw = (data.email ?? "").trim().toLowerCase();
    const email = emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : null;
    const name = data.name.trim().slice(0, 120);
    const entityType = data.entityType === "company" ? "company" : "person";
    const domain = email ? extractEmailDomain(email) : null;
    const orgNr = (data.orgNr ?? "").replace(/\D/g, "").slice(0, 9) || null;

    if (email && isNoisyEmail(email)) {
      throw new Error("Kan ikke opprette kontakt for system-/noreply-adresse");
    }

    if (email && (await emailExistsInNexus(supabase, userId, email))) {
      const { data: existingId } = await supabase
        .from("known_identities")
        .select("entity_id")
        .eq("user_id", userId)
        .eq("identity_type", "email_address")
        .eq("external_key", email)
        .not("entity_id", "is", null)
        .limit(1)
        .maybeSingle();
      if (existingId?.entity_id) {
        return {
          ok: true,
          entityId: existingId.entity_id as string,
          name,
          email,
          created: false,
        };
      }
    }

    // Match existing company by org.nr or exact name
    if (orgNr) {
      const { data: byOrg } = await supabase
        .from("entities")
        .select("id, name")
        .eq("user_id", userId)
        .eq("type", "company")
        .contains("metadata", { org_nr: orgNr } as never)
        .limit(1)
        .maybeSingle();
      if (byOrg?.id) {
        return {
          ok: true,
          entityId: byOrg.id as string,
          name: byOrg.name as string,
          email,
          created: false,
        };
      }
    }

    const { slugifyEntityName } = await import("@/lib/knowledge/entity.server");
    const slug = await slugifyEntityName(supabase, userId, name);
    if (ANCHOR_SLUG_SET.has(slug)) {
      throw new Error("Navnet er reservert");
    }

    const now = new Date().toISOString();
    const metadata: Record<string, unknown> = {
      created_via: "assistant_suggestion",
    };
    if (email) {
      metadata.email = email;
      if (domain) metadata.email_domain = domain;
    }
    if (data.role) metadata.role = data.role.trim().slice(0, 120);
    if (data.phone) metadata.phone = data.phone.trim().slice(0, 40);
    if (data.website) {
      let website = data.website.trim().slice(0, 200);
      if (!/^https?:\/\//i.test(website) && /^[\w.-]+\.[a-z]{2,}/i.test(website)) {
        website = `https://${website}`;
      }
      metadata.website = website;
    }
    if (orgNr) metadata.org_nr = orgNr;
    if (data.address) metadata.address = data.address.trim().slice(0, 200);

    const { data: row, error } = await supabase
      .from("entities")
      .insert({
        user_id: userId,
        type: entityType,
        name,
        slug,
        importance: 55,
        owner_context: "unknown" as never,
        metadata: metadata as never,
        last_seen_at: now,
      })
      .select("id, name")
      .single();
    if (error) throw error;

    if (email) {
      const { data: existingKi } = await supabase
        .from("known_identities")
        .select("id")
        .eq("user_id", userId)
        .eq("identity_type", "email_address")
        .eq("external_key", email)
        .limit(1)
        .maybeSingle();

      if (existingKi?.id) {
        await supabase
          .from("known_identities")
          .update({
            entity_id: row.id,
            ignored_at: null,
            last_seen_at: now,
            display_name: name,
          })
          .eq("id", existingKi.id)
          .eq("user_id", userId);
      } else {
        await supabase.from("known_identities").insert({
          user_id: userId,
          provider: "manual",
          identity_type: "email_address",
          external_key: email,
          email,
          domain: domain ?? null,
          display_name: name,
          entity_id: row.id,
          first_seen_at: now,
          last_seen_at: now,
        });
      }
    }

    const relateName = data.relateToCompanyName?.trim();
    if (relateName && entityType === "person") {
      const { data: company } = await supabase
        .from("entities")
        .select("id")
        .eq("user_id", userId)
        .eq("type", "company")
        .ilike("name", relateName)
        .limit(1)
        .maybeSingle();
      if (company?.id) {
        await supabase.from("entity_relationships").upsert(
          {
            user_id: userId,
            from_entity_id: row.id,
            to_entity_id: company.id,
            kind: "member_of" as never,
            source: "assistant",
            metadata: (data.role ? { role: data.role } : {}) as never,
          },
          { onConflict: "user_id,from_entity_id,to_entity_id,kind" },
        );
      }
    }

    return {
      ok: true,
      entityId: row.id as string,
      name: row.name as string,
      email,
      created: true,
    };
  });

export const applySuggestedRelation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        fromName: z.string().min(1).max(120),
        toName: z.string().min(1).max(120),
        kind: z.enum(RELATION_KINDS),
        role: z.string().max(120).nullable().optional(),
        fromEntityId: z.string().uuid().nullable().optional(),
        toEntityId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const from =
      (data.fromEntityId
        ? { id: data.fromEntityId, name: data.fromName, type: "person" }
        : null) ?? (await resolveEntityByName(supabase, userId, data.fromName));
    const to =
      (data.toEntityId
        ? { id: data.toEntityId, name: data.toName, type: "company" }
        : null) ?? (await resolveEntityByName(supabase, userId, data.toName));

    if (!from?.id || !to?.id) {
      throw new Error(
        "Fant ikke begge kontakter ennå — opprett dem først, deretter lagre relasjonen",
      );
    }
    if (from.id === to.id) throw new Error("Kan ikke koble en kontakt til seg selv");

    const role = data.role?.trim().slice(0, 120) || "";
    const { data: row, error } = await supabase
      .from("entity_relationships")
      .upsert(
        {
          user_id: userId,
          from_entity_id: from.id,
          to_entity_id: to.id,
          kind: data.kind as never,
          source: "assistant",
          metadata: (role ? { role } : {}) as never,
        },
        { onConflict: "user_id,from_entity_id,to_entity_id,kind" },
      )
      .select("id")
      .single();
    if (error) throw error;
    return {
      ok: true,
      relationshipId: row.id as string,
      fromName: from.name,
      toName: to.name,
    };
  });

export const applySuggestedMerge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        keepName: z.string().min(1).max(120),
        absorbName: z.string().min(1).max(120),
        keepEntityId: z.string().uuid().nullable().optional(),
        absorbEntityId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const keep =
      (data.keepEntityId
        ? await supabase
            .from("entities")
            .select("id, name, type")
            .eq("id", data.keepEntityId)
            .eq("user_id", userId)
            .maybeSingle()
            .then((r) => r.data)
        : null) ?? (await resolveEntityByName(supabase, userId, data.keepName, "company"));
    const absorb =
      (data.absorbEntityId
        ? await supabase
            .from("entities")
            .select("id, name, type")
            .eq("id", data.absorbEntityId)
            .eq("user_id", userId)
            .maybeSingle()
            .then((r) => r.data)
        : null) ?? (await resolveEntityByName(supabase, userId, data.absorbName, "company"));

    if (!keep?.id || !absorb?.id) {
      throw new Error(
        "Fant ikke begge selskaper ennå — opprett dem først, deretter slå sammen",
      );
    }

    const { performCompanyMerge } = await import("@/lib/customers.functions");
    return performCompanyMerge(supabase, userId, keep.id as string, absorb.id as string);
  });
