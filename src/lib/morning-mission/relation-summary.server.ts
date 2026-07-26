/** Mission card copy — relational summary, never raw mail/Slack snippets. */

import type { MorningMissionItem, MorningMissionPayload } from "@/lib/morning-mission.types";
import type { MissionSignal } from "@/lib/morning-mission/signal-prefilter.server";

function displayNameFromFrom(from: string): string {
  const before = from.split("<")[0]?.trim().replace(/^"|"$/g, "");
  if (before && !before.includes("@")) return before;
  const email = from.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0];
  if (email) {
    const local = email.split("@")[0] ?? email;
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return from.slice(0, 40) || "Kontakt";
}

function shortSubject(subject: string, max = 72): string {
  const cleaned = subject.replace(/\s+/g, " ").trim();
  if (!cleaned) return "uten emne";
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[«»""']/g, "")
    .trim();
}

/** True when card text is (or is mostly) a raw signal excerpt. */
export function looksLikeRawSnippet(explanation: string, signals: MissionSignal[]): boolean {
  const exp = normalizeForCompare(explanation);
  if (!exp || exp.length < 12) return false;

  // Mail-body heuristics even without linked signals (stale cache).
  if (/^(hi|hei|hello|hallo|dear|hej)\b/.test(exp) && exp.length > 90) return true;
  if (/\bwrote:\s/.test(exp) && exp.length > 80) return true;
  if (exp.includes("-----original message-----")) return true;
  if (exp.includes("begin forwarded message")) return true;

  for (const s of signals) {
    const snip = normalizeForCompare(s.snippet ?? "");
    if (!snip || snip.length < 12) continue;
    if (exp === snip) return true;
    if (snip.includes(exp) && exp.length >= snip.length * 0.7) return true;
    if (exp.includes(snip) && snip.length >= 40 && exp.length <= snip.length * 1.35) return true;
    if (
      /^(hi|hei|hello|hallo|dear)\b/.test(exp) &&
      exp.length > 80 &&
      snip.length > 40 &&
      (exp.includes(snip.slice(0, 40)) || snip.includes(exp.slice(0, 40)))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Deterministic relation summary for a signal — safe for Mission cards when AI is down.
 * Never returns the raw snippet.
 */
export function summarizeSignalForCard(signal: MissionSignal): string {
  const who = displayNameFromFrom(signal.from);
  const topic = shortSubject(signal.subject);

  if (signal.tags.includes("delivery_failure")) {
    const recipient = signal.snippet.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0];
    return recipient
      ? `Levering til ${recipient} feilet — de har sannsynligvis ikke sett meldingen din.`
      : "Levering feilet — mottakeren har sannsynligvis ikke sett meldingen din.";
  }

  if (signal.tags.includes("auto_reply")) {
    return `${who} sendte automatisk svar — de har registrert henvendelsen, men det er ikke et personlig svar.`;
  }

  if (signal.tags.includes("unpaid_invoice") || signal.source === "finance") {
    const customer = (signal.meta?.customer_name as string) || who;
    return `${customer} har ubetalt faktura som trenger oppfølging.`;
  }

  if (signal.source === "slack") {
    return `${who} i Slack om «${topic}» — vurder om det hører til ukeplanen eller krever svar.`;
  }

  if (signal.source === "work") {
    return `Work-signal om «${topic}» — sjekk om noe mangler eller haster.`;
  }

  if (signal.meta?.is_sent === true) {
    return `Du skrev til ${who} om «${topic}» — avklar om du venter på svar.`;
  }

  if (signal.tags.includes("unread") || signal.source === "gmail") {
    return `${who} om «${topic}» — trenger sannsynligvis et svar eller en avgjørelse.`;
  }

  return `${who}: situasjon knyttet til «${topic}».`;
}

export function summarizeItemFromSignals(
  item: MorningMissionItem,
  signals: MissionSignal[],
): string {
  const linked = item.source_ids
    .map((id) => signals.find((s) => s.id === id))
    .filter(Boolean) as MissionSignal[];
  if (linked[0]) return summarizeSignalForCard(linked[0]);
  if (item.title.trim()) {
    return `Oppfølging knyttet til «${shortSubject(item.title)}».`;
  }
  return "Noe trenger din oppmerksomhet — åpne for detaljer.";
}

/** Rewrite explanations that dump raw snippets onto the relation card. */
export function sanitizePayloadExplanations(
  payload: MorningMissionPayload,
  signals: MissionSignal[],
): MorningMissionPayload {
  const fix = (items: MorningMissionItem[]) =>
    items.map((item) => {
      const linked = item.source_ids
        .map((id) => signals.find((s) => s.id === id))
        .filter(Boolean) as MissionSignal[];
      const exp = (item.explanation ?? "").trim();
      if (!exp || looksLikeRawSnippet(exp, linked.length ? linked : signals)) {
        return { ...item, explanation: summarizeItemFromSignals(item, signals) };
      }
      return item;
    });

  return {
    ...payload,
    today: fix(payload.today),
    this_week: fix(payload.this_week),
    waiting: fix(payload.waiting),
    closed: fix(payload.closed),
  };
}
