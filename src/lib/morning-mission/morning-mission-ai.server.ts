// Morning Mission v0 — one AI call to prioritize all signals.
import { generateText, Output } from "ai";
import { z } from "zod";
import { getGeminiApiKey, getGeminiModel } from "@/lib/ai-gateway.server";
import type { MorningMissionPayload } from "@/lib/morning-mission.types";
import type { SlackMissionStatus } from "@/lib/morning-mission.types";
import type { MissionSignal } from "@/lib/morning-mission/signal-prefilter.server";
import { applyTrustRules } from "@/lib/morning-mission/morning-mission-trust.server";
import { stripHallucinatedSlackItems, ensureSlackWeeklyItems } from "@/lib/morning-mission/slack-mission.server";
import { summarizeSignalForCard } from "@/lib/morning-mission/relation-summary.server";

const ItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  explanation: z.string(),
  recommended_action: z.string(),
  priority: z.enum(["high", "medium", "low"]),
  source_ids: z.array(z.string()),
  source_label: z.string().nullable().optional(),
  /** Prefer known contact id from contacts catalog when sure. */
  entity_id: z.string().nullable().optional(),
  /** Person or company name when known — owns the card. */
  relation_name: z.string().nullable().optional(),
  relation_status: z
    .enum([
      "waiting_on_me",
      "waiting_on_them",
      "upcoming",
      "quiet",
      "new_unconfirmed",
      "confirmed",
    ])
    .nullable()
    .optional(),
});

const NoiseSchema = z.object({
  label: z.string(),
  source_ids: z.array(z.string()),
});

const HygieneSchema = z.object({
  label: z.string(),
  senders: z.array(z.string()).optional(),
  count: z.number().optional(),
  source_ids: z.array(z.string()),
});

const PayloadSchema = z.object({
  today: z.array(ItemSchema),
  this_week: z.array(ItemSchema),
  waiting: z.array(ItemSchema),
  closed: z.array(ItemSchema),
  noise: z.array(NoiseSchema),
  hygiene: z.array(HygieneSchema),
  weekly_summary: z.string().nullable().optional(),
});

function labelForSignalIds(ids: string[], signals: MissionSignal[]): string | null {
  for (const id of ids) {
    const s = signals.find((x) => x.id === id);
    if (!s) continue;
    if (s.source === "slack") return s.from;
    if (s.source === "gmail") return "Gmail";
    if (s.source === "finance") return "Finance";
    if (s.source === "work") return "Work";
    if (s.source === "field") return "Field";
    if (s.source === "manual") return "Manuelt";
    if (s.source === "calendar") return "Kalender";
  }
  return null;
}

function hrefForSignalIds(ids: string[], signals: MissionSignal[]): string | null {
  for (const id of ids) {
    const s = signals.find((x) => x.id === id);
    if (s?.href) return s.href;
  }
  return null;
}

function enrichPayload(
  raw: z.infer<typeof PayloadSchema>,
  signals: MissionSignal[],
): MorningMissionPayload {
  const enrich = (items: z.infer<typeof ItemSchema>[]) =>
    items.map((item) => ({
      ...item,
      href: hrefForSignalIds(item.source_ids, signals),
      source_label: item.source_label ?? labelForSignalIds(item.source_ids, signals),
      entity_id: item.entity_id ?? null,
      relation_name: item.relation_name ?? null,
      relation_status: item.relation_status ?? null,
    }));

  const cleaned = {
    today: stripHallucinatedSlackItems(enrich(raw.today), signals),
    this_week: stripHallucinatedSlackItems(enrich(raw.this_week), signals),
    waiting: stripHallucinatedSlackItems(enrich(raw.waiting), signals),
    closed: enrich(raw.closed),
    noise: raw.noise,
    hygiene: raw.hygiene,
    weekly_summary: raw.weekly_summary?.trim() ?? null,
  };

  return {
    today: cleaned.today.slice(0, 5),
    this_week: cleaned.this_week,
    waiting: cleaned.waiting,
    closed: cleaned.closed,
    noise: cleaned.noise,
    hygiene: cleaned.hygiene,
    weekly_summary: cleaned.weekly_summary,
  };
}

function finalizePayload(
  payload: MorningMissionPayload,
  signals: MissionSignal[],
): MorningMissionPayload {
  const stripped = {
    ...payload,
    today: stripHallucinatedSlackItems(payload.today, signals),
    this_week: stripHallucinatedSlackItems(payload.this_week, signals),
    waiting: stripHallucinatedSlackItems(payload.waiting, signals),
  };
  return ensureSlackWeeklyItems(stripped, signals);
}

function fallbackPayload(signals: MissionSignal[]): MorningMissionPayload {
  const today: MorningMissionPayload["today"] = [];
  const waiting: MorningMissionPayload["waiting"] = [];
  const noise: MorningMissionPayload["noise"] = [];

  for (const s of signals) {
    if (s.tags.includes("system_noise") || s.tags.includes("bulk_mail") || s.tags.includes("has_unsubscribe")) {
      noise.push({ label: `${s.from}: ${s.subject}`, source_ids: [s.id] });
      continue;
    }
    if (s.tags.includes("auto_reply")) {
      waiting.push({
        id: `fallback:${s.id}`,
        title: displayNameOrSubject(s),
        explanation: summarizeSignalForCard(s),
        recommended_action: "Ingen handling nå.",
        priority: "low",
        source_ids: [s.id],
        source_label: s.from,
        href: s.href,
      });
      continue;
    }
    if (s.tags.includes("delivery_failure")) {
      today.push({
        id: `fallback:${s.id}`,
        title: "E-post kom ikke fram",
        explanation: summarizeSignalForCard(s),
        recommended_action: "Sjekk mottakeradresse og send på nytt.",
        priority: "high",
        source_ids: [s.id],
        source_label: "Gmail",
        href: s.href,
      });
      continue;
    }
    if (s.source !== "gmail" || s.tags.includes("unread")) {
      today.push({
        id: `fallback:${s.id}`,
        title: displayNameOrSubject(s),
        explanation: summarizeSignalForCard(s),
        recommended_action:
          s.source === "finance"
            ? "Send purring"
            : s.source === "slack"
              ? "Les tråden"
              : "Åpne og avgjør",
        priority: s.source === "finance" ? "high" : "medium",
        source_ids: [s.id],
        source_label: s.source,
        href: s.href,
      });
    }
  }

  return {
    today: today.slice(0, 5),
    this_week: [],
    waiting,
    closed: [],
    noise,
    hygiene: [],
    weekly_summary: null,
  };
}

function displayNameOrSubject(s: MissionSignal): string {
  const before = s.from.split("<")[0]?.trim().replace(/^"|"$/g, "");
  if (before && !before.includes("@") && before.length > 1) return before;
  return s.subject.slice(0, 80) || s.from;
}

export async function generateMorningMissionAi(input: {
  signals: MissionSignal[];
  userName: string | null;
  userEmail?: string | null;
  hints?: import("@/lib/mission-hints.types").MissionHint[];
  personalContextBlock?: string | null;
  slackStatus?: SlackMissionStatus;
  contacts?: Array<{
    id: string;
    name: string;
    type: "person" | "company";
    owner_context: string;
  }>;
}): Promise<MorningMissionPayload> {
  if (input.signals.length === 0) {
    return {
      today: [],
      this_week: [],
      waiting: [],
      closed: [],
      noise: [],
      hygiene: [],
      weekly_summary: null,
    };
  }

  if (!getGeminiApiKey()) {
    return applyTrustRules(
      finalizePayload(fallbackPayload(input.signals), input.signals),
      input.signals,
      input.userEmail ?? null,
    );
  }

  const model = getGeminiModel("flash");

  const hintLines =
    input.hints?.map(
      (h) =>
        `- ${h.match_kind}="${h.match_value}": ${h.hint_text}`,
    ) ?? [];

  const system = [
    `Du er ${input.userName ?? "brukerens"} daglige arbeidsassistent på norsk.`,
    input.personalContextBlock?.trim() || "",
    "RELASJONSDREVET BRIEF (viktigst):",
    "Hvert kort eies av en person eller et selskap — ikke av Gmail/Slack/Finance.",
    "Spørsmål du svarer på: Hvem trenger noe nå, hvorfor, og hva er neste handling?",
    "title / relation_name: bruk person- eller selskapsnavn når du kjenner det (f.eks. «Maria Rossi»).",
    "explanation (TRUST): 1–2 setninger som OPPSUMMERER situasjonen for relasjonen.",
    "  ALDRI lim inn mail-snippet, Slack-tekst, sitater eller rå signaltekst.",
    "  ALDRI skriv «X om «emnelinje» — trenger sannsynligvis et svar» — det er ikke et sammendrag.",
    "  GODT: «Spurte om leveranse og pris på 500L ekstra virgin olivenolje.»",
    "  GODT: «Venter på bekreftelse av pristilbud før de bestiller.»",
    "  DÅRLIG: «Hi Peder, following up on the olive oil quote…»",
    "  DÅRLIG: «Vercel om «New sign-in detected» — trenger sannsynligvis et svar.»",
    "  Brukeren skal stole på kortet uten å lese innboksen først.",
    "recommended_action: én konkret handling (Svar på e-post, Bekreft kontakt, Send purring …).",
    "  Ikke anbefal «Svar på e-post» for sikkerhetsvarsel, noreply eller produktvarsler.",
    "entity_id: sett KUN hvis kontakten finnes i contacts-katalogen under — ellers null.",
    "relation_status: waiting_on_me | waiting_on_them | upcoming | quiet | new_unconfirmed.",
    "source_label: diskret metadata (fra Gmail) — aldri hovedoverskrift.",
    "Ukjent avsender / ingen kontakt → relation_status new_unconfirmed, ikke finn på entity_id.",
    "",
    "Les signalene nedenfor og sorter dem i seksjoner.",
    "Slå sammen beslektede signaler (f.eks. delivery failure + opprinnelig utgående mail til samme person).",
    "Ikke vis hver e-post som eget kort — grupper etter hvem det gjelder.",
    "",
    hintLines.length > 0
      ? ["BRUKERENS LÆRTE REGLER (må følges — ikke vis som handling):", ...hintLines, ""].join("\n")
      : "",
    "HARDE REGLER (må følges):",
    "- tag delivery_failure → ALLTID today, priority high. Aldri waiting eller this_week.",
    "  Forklar at mottaker sannsynligvis ikke har fått e-posten — brukeren kan tro de venter på svar uten grunn.",
    "- tag auto_reply eller «takk, vi har mottatt» → waiting, priority low. Aldri today.",
    "- tag unpaid_invoice eller finance_invoice → today, priority high. Anbefal «Send purring» i Mission.",
    "- Brukerens egne test-e-poster (korte «hei»/«test») → noise, aldri today.",
    "- tag system_noise / bulk_mail / noreply / sikkerhetsvarsel / sign-in / nyhetsbrev → ALLTID noise.",
    "  Aldri today/waiting. Aldri «Svar på e-post».",
    "- Kun ekte mennesker/selskaper du har en relasjon til hører hjemme i today/waiting.",
    "- Egen utgående oppfølging til kunder (Gold of Sicily, Felt-besøk, osv.) → waiting, IKKE noise.",
    "  Brukeren venter på svar — det er en relasjon.",
    "",
    "MYKE REGLER:",
    "Avslag, fullførte saker, irrelevant historikk → closed.",
    "Reklame, nyhetsbrev, varsler uten handling → noise eller hygiene.",
    "Modul-alerts fra Finance/Work med mangler → today eller this_week etter alvor.",
    "Slack-signaler (source=slack):",
    "  - title: hva de ber om (f.eks. «Lever timeliste (#drift)»), ikke bare kanalnavn.",
    "  - explanation: 1–2 setninger som tolker innholdet slik at brukeren slipper å åpne Slack.",
    "    GODT: «I #drift blir du bedt om å levere timeliste.»",
    "    DÅRLIG: «Slack-tråd med Slack · #drift som kan trenge din input.»",
    "  - tag slack_action / timeliste / frist → today, priority high.",
    "  - Øvrig Slack-planlegging → this_week.",
    "  Ikke finn på Slack-meldinger — bruk KUN signaler med source slack i input.",
    "  Bruk snippet/subject til å tolke — lim ikke inn hele råteksten.",
    input.slackStatus?.activity_this_week === 0
      ? "Det finnes INGEN Slack-signaler denne uken — ikke lag this_week-elementer om Slack, mentions eller DM-er."
      : "",
    "Bruk source_ids fra input — ikke finn på nye ID-er.",
    "Item id: bruk kort slug basert på tema, f.eks. 'marco-email-failure'.",
    "Maks 5 elementer i today.",
    "weekly_summary: 2–4 setninger om ukens viktigste (kan være null).",
  ].join("\n");

  const compact = input.signals.map((s) => ({
    id: s.id,
    source: s.source,
    subject: s.subject,
    from: s.from,
    snippet: s.snippet,
    occurred_at: s.occurred_at,
    tags: s.tags,
    meta: s.meta ?? {},
  }));

  const slackContext = input.slackStatus
    ? { slack_status: input.slackStatus }
    : {};

  const contactsContext =
    input.contacts && input.contacts.length > 0
      ? { contacts: input.contacts }
      : {};

  try {
    const { output } = await generateText({
      model,
      system,
      prompt: JSON.stringify({ signals: compact, ...slackContext, ...contactsContext }),
      output: Output.object({ schema: PayloadSchema }),
    });
    return applyTrustRules(
      finalizePayload(enrichPayload(output, input.signals), input.signals),
      input.signals,
      input.userEmail ?? null,
    );
  } catch (err) {
    // Never fail the whole Mission UI on gateway/auth/rate-limit (e.g. "Forbidden").
    console.warn("[morning-mission] AI failed, using fallback", err);
    return applyTrustRules(
      finalizePayload(fallbackPayload(input.signals), input.signals),
      input.signals,
      input.userEmail ?? null,
    );
  }
}
