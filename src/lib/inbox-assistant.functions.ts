// Nexus-assistent — agentic Gemini over the user's own inbox and contacts.
// Example: «Les trådene mellom meg og Marit om bryllupet 15. august, finn ut
// om hun ga meg en kjøreplan, og lag i så fall en mail til lydteknikeren.»
// Tools: findContact, searchGmail, readThread, createEmailDraft.
// The agent NEVER sends mail — it only creates Gmail drafts.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, stepCountIs, tool } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getGeminiApiKey, getGeminiModel } from "@/lib/ai-gateway.server";

export type AssistantStep = { label: string; detail: string | null };

export type AssistantResult = {
  answer: string;
  steps: AssistantStep[];
  draft: { to: string; subject: string; openUrl: string } | null;
};

const Input = z.object({ instruction: z.string().min(3).max(2000) });

function osloToday(): string {
  return new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "full",
    timeZone: "Europe/Oslo",
  }).format(new Date());
}

export const runInboxAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }): Promise<AssistantResult> => {
    const { supabase, userId } = context;
    if (!getGeminiApiKey()) {
      throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY)");
    }

    const gmail = await import("@/lib/inbox/gmail.server");
    const steps: AssistantStep[] = [];
    let draft: AssistantResult["draft"] = null;

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
          "Lag et Gmail-utkast til en mottaker. Sender ALDRI — brukeren sender selv fra Gmail. Bruk når oppgaven ber om å skrive/lage en mail og grunnlaget er bekreftet i trådene.",
        inputSchema: z.object({
          to: z.string().email(),
          subject: z.string().min(1).max(300),
          body: z.string().min(1).max(20000),
        }),
        execute: async ({ to, subject, body }) => {
          const saved = await gmail.createGmailComposeDraft({ to, subject, body });
          draft = { to, subject, openUrl: saved.openUrl };
          steps.push({ label: `Lagde utkast til ${to}`, detail: subject });
          return { ok: true, openUrl: saved.openUrl };
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
      "4. Skal det skrives en mail: bruk createEmailDraft. Skriv på norsk med mindre tråden tilsier noe annet, 2–10 setninger, vennlig avslutning uten navnesignatur. Ikke finn på fakta — bruk kun det som står i trådene eller i instruksen.",
      "5. Ligger etterspurt informasjon (f.eks. en kjøreplan) som vedlegg, si tydelig hvilken mail/dato vedlegget ligger i, og oppsummer det du kan fra teksten.",
      "Til slutt: svar kort på norsk. Si hva du fant (med datoer/emner), hva du gjorde, og hva du IKKE fant hvis noe mangler. Ingen markdown-overskrifter.",
    ].join("\n");

    const result = await generateText({
      model: getGeminiModel("flash"),
      system,
      prompt: data.instruction,
      tools,
      stopWhen: stepCountIs(10),
    });

    const answer = result.text.trim();
    return {
      answer:
        answer ||
        (draft
          ? "Utkastet er klart i Gmail."
          : "Jeg fant ikke noe entydig svar — prøv å presisere navn eller tidsrom."),
      steps,
      draft,
    };
  });
