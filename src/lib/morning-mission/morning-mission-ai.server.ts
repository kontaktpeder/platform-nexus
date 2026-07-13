// Morning Mission v0 — one AI call to prioritize all signals.
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import type { MorningMissionPayload } from "@/lib/morning-mission.types";
import type { SlackMissionStatus } from "@/lib/morning-mission.types";
import type { MissionSignal } from "@/lib/morning-mission/signal-prefilter.server";
import { applyTrustRules } from "@/lib/morning-mission/morning-mission-trust.server";
import { stripHallucinatedSlackItems, ensureSlackWeeklyItems } from "@/lib/morning-mission/slack-mission.server";

const ItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  explanation: z.string(),
  recommended_action: z.string(),
  priority: z.enum(["high", "medium", "low"]),
  source_ids: z.array(z.string()),
  source_label: z.string().nullable().optional(),
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
    if (s.tags.includes("auto_reply")) {
      waiting.push({
        id: `fallback:${s.id}`,
        title: s.subject,
        explanation: "Automatisk svar — sannsynligvis venter på oppfølging.",
        recommended_action: "Ingen handling nå.",
        priority: "low",
        source_ids: [s.id],
        source_label: s.from,
        href: s.href,
      });
      continue;
    }
    if (s.tags.includes("has_unsubscribe") || s.tags.includes("bulk_mail")) {
      noise.push({ label: `${s.from}: ${s.subject}`, source_ids: [s.id] });
      continue;
    }
    if (s.tags.includes("delivery_failure")) {
      today.push({
        id: `fallback:${s.id}`,
        title: "E-post kom ikke fram",
        explanation: s.snippet || s.subject,
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
        title: s.subject,
        explanation: s.snippet,
        recommended_action: "Åpne og vurder.",
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

export async function generateMorningMissionAi(input: {
  signals: MissionSignal[];
  userName: string | null;
  userEmail?: string | null;
  hints?: import("@/lib/mission-hints.types").MissionHint[];
  slackStatus?: SlackMissionStatus;
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

  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    return applyTrustRules(
      finalizePayload(fallbackPayload(input.signals), input.signals),
      input.signals,
      input.userEmail ?? null,
    );
  }

  const gateway = createLovableAiGatewayProvider(key);
  const model = gateway("google/gemini-3-flash-preview");

  const hintLines =
    input.hints?.map(
      (h) =>
        `- ${h.match_kind}="${h.match_value}": ${h.hint_text}`,
    ) ?? [];

  const system = [
    `Du er ${input.userName ?? "brukerens"} daglige arbeidsassistent på norsk.`,
    "Les signalene nedenfor og sorter dem i seksjoner.",
    "Slå sammen beslektede signaler (f.eks. delivery failure + opprinnelig utgående mail til samme person).",
    "Ikke vis hver e-post som eget kort — grupper etter hva som faktisk betyr noe.",
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
    "",
    "MYKE REGLER:",
    "Avslag, fullførte saker, irrelevant historikk → closed.",
    "Reklame, nyhetsbrev, varsler uten handling → noise eller hygiene.",
    "Modul-alerts fra Finance/Work med mangler → today eller this_week etter alvor.",
    "Slack-signaler (source=slack, tags slack_week): planlegging og koordinering → this_week.",
    "  Kun Slack med tydelig hast (ASAP, i dag, haster) → today.",
    "  Ikke finn på Slack-meldinger — bruk KUN signaler med source slack i input.",
    input.slackStatus?.activity_this_week === 0
      ? "Det finnes INGEN Slack-signaler denne uken — ikke lag this_week-elementer om Slack eller #drift."
      : "",
    "For viktige elementer: skriv hva som skjedde, hvorfor det betyr noe, og én konkret neste handling.",
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

  try {
    const { output } = await generateText({
      model,
      system,
      prompt: JSON.stringify({ signals: compact, ...slackContext }),
      output: Output.object({ schema: PayloadSchema }),
    });
    return applyTrustRules(
      finalizePayload(enrichPayload(output, input.signals), input.signals),
      input.signals,
      input.userEmail ?? null,
    );
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      console.warn("[morning-mission] AI malformed, using fallback", err);
      return applyTrustRules(
        finalizePayload(fallbackPayload(input.signals), input.signals),
        input.signals,
        input.userEmail ?? null,
      );
    }
    throw err;
  }
}
