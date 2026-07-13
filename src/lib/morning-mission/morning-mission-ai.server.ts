// Morning Mission v0 — one AI call to prioritize all signals.
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import type { MorningMissionPayload } from "@/lib/morning-mission.types";
import type { MissionSignal } from "@/lib/morning-mission/signal-prefilter.server";

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
      source_label: item.source_label ?? null,
    }));

  return {
    today: enrich(raw.today).slice(0, 5),
    this_week: enrich(raw.this_week),
    waiting: enrich(raw.waiting),
    closed: enrich(raw.closed),
    noise: raw.noise,
    hygiene: raw.hygiene,
    weekly_summary: raw.weekly_summary?.trim() ?? null,
  };
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
}): Promise<MorningMissionPayload> {
  if (input.signals.length === 0) {
    return {
      today: [],
      this_week: [],
      waiting: [],
      closed: [],
      noise: [],
      hygiene: [],
      weekly_summary: "Ingen nye signaler de siste dagene.",
    };
  }

  const key = process.env.LOVABLE_API_KEY;
  if (!key) return fallbackPayload(input.signals);

  const gateway = createLovableAiGatewayProvider(key);
  const model = gateway("google/gemini-3-flash-preview");

  const system = [
    `Du er ${input.userName ?? "brukerens"} daglige arbeidsassistent på norsk.`,
    "Les signalene nedenfor og sorter dem i seksjoner.",
    "Slå sammen beslektede signaler (f.eks. delivery failure + opprinnelig utgående mail til samme person).",
    "Ikke vis hver e-post som eget kort — grupper etter hva som faktisk betyr noe.",
    "Autosvar og «takk, vi har mottatt» → waiting, ikke today.",
    "Avslag, fullførte saker, irrelevant historikk → closed.",
    "Reklame, nyhetsbrev, varsler uten handling → noise eller hygiene.",
    "Modul-alerts fra Finance/Work med mangler → today eller this_week etter alvor.",
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

  try {
    const { output } = await generateText({
      model,
      system,
      prompt: JSON.stringify({ signals: compact }),
      output: Output.object({ schema: PayloadSchema }),
    });
    return enrichPayload(output, input.signals);
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      console.warn("[morning-mission] AI malformed, using fallback", err);
      return fallbackPayload(input.signals);
    }
    throw err;
  }
}
