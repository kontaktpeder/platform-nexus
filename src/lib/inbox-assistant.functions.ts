// Nexus-assistent — agentic Gemini over the user's own inbox and contacts.
// Tools: findContact, searchGmail, readThread, createEmailDraft, suggestContact.
// Drafts are returned to the UI for preview/edit/send in Nexus — never auto-sent.
// Contact suggestions are opt-in (suggestContact + draft recipient), never harvested
// from every Gmail hit (that was pulling in bank noreply noise).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, stepCountIs, tool } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getGeminiApiKey, getGeminiModel } from "@/lib/ai-gateway.server";
import { extractEmailDomain } from "@/lib/knowledge/entity-matcher";
import { ANCHOR_SLUG_SET } from "@/lib/knowledge/types";

export type AssistantStep = { label: string; detail: string | null };

export type SuggestedContact = {
  name: string;
  email: string;
  entityType: "person" | "company";
  reason: string;
};

export type AssistantDraft = {
  to: string;
  subject: string;
  body: string;
};

export type AssistantResult = {
  answer: string;
  steps: AssistantStep[];
  draft: AssistantDraft | null;
  suggestedContacts: SuggestedContact[];
};

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

    async function addSuggestion(input: {
      name: string;
      email: string;
      entityType?: "person" | "company";
      reason: string;
    }) {
      const email = input.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
      if (selfEmail && email === selfEmail) return;
      if (isNoisyEmail(email)) return;
      const name = (input.name.trim() || nameFromEmailLocal(email)).slice(0, 120);
      const existing = suggestions.get(email);
      if (existing) {
        if (name.length > existing.name.length && !name.includes("@")) {
          suggestions.set(email, { ...existing, name });
        }
        return;
      }
      if (await emailExistsInNexus(supabase, userId, email)) return;
      suggestions.set(email, {
        name,
        email,
        entityType: input.entityType ?? "person",
        reason: input.reason.slice(0, 200),
      });
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

      searchGmail: tool({
        description:
          'Søk i Gmail med Gmail-søkesyntaks, f.eks. from:navn@x.no, to:navn@x.no, subject:bryllup, "kjøreplan", after:2026/06/01. Kombiner gjerne: (from:a@x.no OR to:a@x.no) kjøreplan. Returnerer én treff-rad per tråd.',
        inputSchema: z.object({
          query: z.string().min(2).max(400),
          max: z.number().int().min(1).max(15).optional(),
        }),
        execute: async ({ query, max }) => {
          steps.push({ label: "Søkte i Gmail", detail: query });
          const hits = await gmail.searchGmailMessages(query, max ?? 8);
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

      createEmailDraft: tool({
        description:
          "Lag et e-postutkast som brukeren kan forhåndsvise, redigere og sende i Nexus. Sender ALDRI automatisk. Bruk når oppgaven ber om å skrive/lage en mail og grunnlaget er bekreftet.",
        inputSchema: z.object({
          to: z.string().email(),
          subject: z.string().min(1).max(300),
          body: z.string().min(1).max(20000),
        }),
        execute: async ({ to, subject, body }) => {
          draft = { to, subject, body };
          steps.push({ label: `Lagde utkast til ${to}`, detail: subject });
          await addSuggestion({
            name: nameFromEmailLocal(to),
            email: to,
            reason: "Mottaker av e-postutkast",
          });
          return {
            ok: true,
            note: "Utkastet vises i Nexus for gjennomgang. Brukeren sender selv.",
          };
        },
      }),

      suggestContact: tool({
        description:
          "Foreslå en ny Nexus-kontakt KUN når personen/selskapet er relevant for brukerens oppgave (f.eks. Marit i bryllupstråden, eller Brygg som pitch-mottaker) og mangler i Nexus. Kall ALDRI for noreply, banker, systemmail eller tilfeldige avsendere i søkeresultater. Oppretter IKKE kontakten — brukeren godkjenner i UI.",
        inputSchema: z.object({
          name: z.string().min(1).max(120),
          email: z.string().email(),
          entityType: z.enum(["person", "company"]).optional(),
          reason: z.string().max(200).optional(),
        }),
        execute: async ({ name, email, entityType, reason }) => {
          await addSuggestion({
            name,
            email,
            entityType: entityType ?? "person",
            reason: reason ?? "Foreslått av assistenten",
          });
          if (!isNoisyEmail(email.trim().toLowerCase())) {
            steps.push({ label: "Foreslo kontakt", detail: `${name} <${email}>` });
          }
          return { ok: true };
        },
      }),
    };

    const system = [
      "Du er Nexus-assistenten til Peder. Du hjelper ham med innboksen og nettverket hans.",
      `I dag er ${osloToday()} (Europe/Oslo).`,
      "Arbeidsmåte:",
      "1. Nevnes en person/selskap ved navn: kall findContact først for å få e-postadresser. Finner du ingen, søk i Gmail på navnet i stedet.",
      "2. Bruk searchGmail med presise queries. Prøv flere varianter hvis første søk er tomt (norske og engelske nøkkelord, med/uten anførselstegn).",
      "3. Les relevante tråder med readThread FØR du konkluderer. Aldri gjett på innhold du ikke har lest.",
      "4. Skal det skrives en mail: bruk createEmailDraft. Skriv på norsk med mindre tråden tilsier noe annet, 2–10 setninger, vennlig avslutning uten navnesignatur. Ikke finn på fakta — bruk kun det som står i trådene eller i instruksen. Utkastet vises i Nexus; brukeren sender selv.",
      "5. Ligger etterspurt informasjon (f.eks. en kjøreplan) som vedlegg, si tydelig hvilken mail/dato vedlegget ligger i, og oppsummer det du kan fra teksten.",
      "6. suggestContact KUN for personer/selskaper som er sentrale i oppgaven og mangler i Nexus. ALDRI for noreply, banker, systemmail, nyhetsbrev eller tilfeldige treff i søk. Mottaker av createEmailDraft foreslås automatisk hvis den mangler.",
      "Til slutt: svar kort på norsk. Si hva du fant (med datoer/emner), hva du gjorde, og hva du IKKE fant hvis noe mangler. Ingen markdown-overskrifter.",
    ].join("\n");

    const result = await generateText({
      model: getGeminiModel("flash"),
      system,
      prompt: data.instruction,
      tools,
      stopWhen: stepCountIs(12),
    });

    const answer = result.text.trim();
    return {
      answer:
        answer ||
        (draft
          ? "Utkastet er klart under — les gjennom og send når du er klar."
          : "Jeg fant ikke noe entydig svar — prøv å presisere navn eller tidsrom."),
      steps,
      draft,
      suggestedContacts: [...suggestions.values()].slice(0, 8),
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
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const gmail = await import("@/lib/inbox/gmail.server");
    if (data.mode === "draft") {
      const saved = await gmail.createGmailComposeDraft({
        to: data.to,
        subject: data.subject,
        body: data.body,
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
      body: data.body,
    });
    return {
      ok: true,
      mode: "send" as const,
      messageId: sent.messageId,
      openUrl: null as string | null,
    };
  });

/**
 * Create a Nexus contact from an assistant suggestion (name + email).
 * Writes entity + known_identities so future mail and assistant runs link automatically.
 */
export const createContactFromSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().min(1).max(120),
        email: z.string().email(),
        entityType: z.enum(["person", "company"]).default("person"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const email = data.email.trim().toLowerCase();
    const name = data.name.trim().slice(0, 120);
    const entityType = data.entityType === "company" ? "company" : "person";
    const domain = extractEmailDomain(email);

    if (isNoisyEmail(email)) {
      throw new Error("Kan ikke opprette kontakt for system-/noreply-adresse");
    }

    if (await emailExistsInNexus(supabase, userId, email)) {
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

    const { slugifyEntityName } = await import("@/lib/knowledge/entity.server");
    const slug = await slugifyEntityName(supabase, userId, name);
    if (ANCHOR_SLUG_SET.has(slug)) {
      throw new Error("Navnet er reservert");
    }

    const now = new Date().toISOString();
    const metadata: Record<string, unknown> = {
      email,
      created_via: "assistant_suggestion",
    };
    if (domain) metadata.email_domain = domain;

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

    return {
      ok: true,
      entityId: row.id as string,
      name: row.name as string,
      email,
      created: true,
    };
  });
