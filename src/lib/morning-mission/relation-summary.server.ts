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

/** Weak template we used to dump — not trust-worthy. */
export function looksLikeWeakTemplate(explanation: string): boolean {
  const exp = normalizeForCompare(explanation);
  if (/om «.+» — trenger sannsynligvis et svar/.test(exp)) return true;
  if (/om «.+» — vurder om/.test(exp)) return true;
  if (/oppfølging knyttet til «/.test(exp)) return true;
  if (/situasjon knyttet til «/.test(exp)) return true;
  if (/slack-tr[aå]d med .+ som kan trenge din input/.test(exp)) return true;
  if (/venter på meg/.test(exp) && exp.length < 40) return true;
  return false;
}

/** True when card text is (or is mostly) a raw signal excerpt. */
export function looksLikeRawSnippet(explanation: string, signals: MissionSignal[]): boolean {
  const exp = normalizeForCompare(explanation);
  if (!exp || exp.length < 12) return false;

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
    // Explanation is basically just the subject wrapped
    const subj = normalizeForCompare(s.subject ?? "");
    if (subj.length > 20 && exp.includes(subj) && exp.length < subj.length + 60) return true;
  }
  return false;
}

function cleanSlackMarkup(text: string): string {
  return text
    .replace(/<@[A-Z0-9]+>/gi, "")
    .replace(/<#[A-Z0-9]+\|([^>]+)>/gi, "#$1")
    .replace(/<([^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<([^>]+)>/g, "$1")
    .replace(/:[\w+-]+:/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slackChannelLabel(signal: MissionSignal): string {
  const fromMeta = signal.meta?.channel_name;
  if (typeof fromMeta === "string" && fromMeta.trim()) {
    return fromMeta.startsWith("#") ? fromMeta : `#${fromMeta}`;
  }
  const from = signal.from.replace(/^Slack\s*[·•-]\s*/i, "").trim();
  if (from) return from.startsWith("#") ? from : from;
  return "#slack";
}

/** Short human draft from Slack body — enough to act without opening Slack. */
function slackInterpretedDraft(signal: MissionSignal): {
  title: string;
  explanation: string;
  action: string;
} {
  const channel = slackChannelLabel(signal);
  const raw = cleanSlackMarkup(signal.snippet || signal.subject || "");
  const lower = raw.toLowerCase();

  if (/timeliste|timesheet|timef[øo]ring/.test(lower)) {
    const email = raw.match(/[\w.+-]+@[\w.-]+\.\w+/i)?.[0] ?? null;
    const period =
      raw.match(/\b(?:fra\s+)?(januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|aug|sep|okt|nov|des)\b/i)?.[1] ??
      raw.match(/\b(20\d{2}-\d{2}|uke\s*\d{1,2})\b/i)?.[1] ??
      null;
    const deadlineMatch =
      raw.match(/innen\s+([^.,;\n]+?(?:\d{1,2}[:.]\d{2}|\d{1,2}\s*(?:\.|:)\s*\d{2}|kl(?:okken)?\s*\d{1,2}))/i) ||
      raw.match(/innen\s+(fredag|mandag|tirsdag|onsdag|torsdag|l[øo]rdag|s[øo]ndag)[^.,;\n]{0,40}/i) ||
      raw.match(/frist[:\s]+([^.,;\n]{3,40})/i);
    const deadline = deadlineMatch?.[0]?.replace(/^innen\s+/i, "").trim() ?? null;
    const viaMail = /mail|e-?post/i.test(raw);

    const bits: string[] = [];
    bits.push(
      period
        ? `Fyll inn timer for ${period.charAt(0).toUpperCase()}${period.slice(1).toLowerCase()}`
        : "Fyll inn prosjekt-timelisten",
    );
    if (viaMail && email) bits.push(`send på e-post til ${email}`);
    else if (viaMail) bits.push("send på e-post");
    else if (email) bits.push(`lever til ${email}`);
    if (deadline) bits.push(`frist ${deadline}`);

    const explanation = `I ${channel}: ${bits.join(" — ")}.`;
    const action =
      viaMail && email
        ? `Fyll timene${period ? ` for ${period}` : ""}, send e-post til ${email}${deadline ? ` innen ${deadline}` : ""}, og marker ferdig her.`
        : `Fyll og lever timelisten${deadline ? ` innen ${deadline}` : ""}, og marker ferdig her.`;

    return {
      title: deadline ? `Timeliste innen ${deadline}` : `Lever timeliste (${channel})`,
      explanation,
      action,
    };
  }
  if (/faktura|invoice|purring/.test(lower)) {
    return {
      title: `Følg opp faktura (${channel})`,
      explanation: `I ${channel} nevnes faktura/purring: «${shortSubject(raw, 100)}».`,
      action: "Sjekk Finance og svar i tråden om nødvendig.",
    };
  }
  if (/møte|meeting|standup|avklar/.test(lower)) {
    return {
      title: `Avklar møte/plan (${channel})`,
      explanation: `I ${channel}: «${shortSubject(raw, 110)}».`,
      action: "Bekreft eller svar i Slack-tråden.",
    };
  }
  if (raw.length > 6) {
    return {
      title: shortSubject(`${channel}: ${raw}`, 64),
      explanation: `Utkast fra ${channel}: «${shortSubject(raw, 160)}». Avgjør om du må svare eller gjøre noe.`,
      action: "Les utkastet og gjør neste steg — åpne Slack bare om du trenger mer kontekst.",
    };
  }
  return {
    title: `Ny melding i ${channel}`,
    explanation: `Det er aktivitet i ${channel} som kan kreve handling.`,
    action: "Åpne tråden og vurder neste steg.",
  };
}

/**
 * Intent summary when AI is unavailable — never paste subject as the story.
 */
export function summarizeSignalForCard(signal: MissionSignal): string {
  const who = displayNameFromFrom(signal.from);
  const subj = signal.subject.toLowerCase();

  if (signal.tags.includes("delivery_failure")) {
    const recipient = signal.snippet.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0];
    return recipient
      ? `Levering til ${recipient} feilet — de har sannsynligvis ikke sett meldingen din.`
      : "Levering feilet — mottakeren har sannsynligvis ikke sett meldingen din.";
  }

  if (signal.tags.includes("auto_reply")) {
    return `${who} sendte automatisk svar — ikke et personlig svar ennå.`;
  }

  if (signal.tags.includes("unpaid_invoice") || signal.source === "finance") {
    const customer = (signal.meta?.customer_name as string) || who;
    return `${customer} har ubetalt faktura som trenger oppfølging.`;
  }

  if (signal.source === "slack") {
    return slackInterpretedDraft(signal).explanation;
  }

  if (signal.source === "work") {
    return "Work-varsel som kan kreve handling.";
  }

  if (/sign-?in|login|sikkerhetsvarsel|security alert/.test(subj)) {
    return `Sikkerhetsvarsel fra ${who} — bekreft om det var deg.`;
  }
  if (/invoice|faktura|payment|betaling/.test(subj)) {
    return `Betaling/faktura knyttet til ${who}.`;
  }
  if (/offer|tilbud|quote|pris/.test(subj)) {
    return `${who} har noe om tilbud/pris som venter på deg.`;
  }
  if (/meeting|møte|demo|call/.test(subj)) {
    return `${who} om møte/demo — avklar tid eller svar.`;
  }
  if (/leveranse|delivery|order|ordre/.test(subj)) {
    return `${who} om leveranse/ordre — trenger oppfølging.`;
  }

  if (signal.meta?.is_sent === true) {
    return `Du har skrevet til ${who} — avklar om du venter på svar.`;
  }

  return `${who} har tatt kontakt — les og avgjør neste steg.`;
}

/** Title/action draft for Slack Mission cards (deterministic, no AI). */
export function slackCardDraft(signal: MissionSignal): {
  title: string;
  explanation: string;
  action: string;
} {
  return slackInterpretedDraft(signal);
}

export function summarizeItemFromSignals(
  item: MorningMissionItem,
  signals: MissionSignal[],
): string {
  const linked = item.source_ids
    .map((id) => signals.find((s) => s.id === id))
    .filter(Boolean) as MissionSignal[];
  if (linked[0]) return summarizeSignalForCard(linked[0]);
  const name = item.relation_name?.trim() || item.title.trim();
  if (name) return `${name} trenger din oppmerksomhet — åpne for detaljer.`;
  return "Noe trenger din oppmerksomhet — åpne for detaljer.";
}

/** Rewrite explanations that dump raw snippets or weak subject-templates onto the card. */
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
      const bad =
        !exp ||
        looksLikeWeakTemplate(exp) ||
        looksLikeRawSnippet(exp, linked.length ? linked : signals);
      if (bad) {
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
