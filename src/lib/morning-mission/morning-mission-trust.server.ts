// v1 trust rules — deterministic corrections after AI (and pre-filter helpers).
import type { MorningMissionPayload, MorningMissionItem } from "@/lib/morning-mission.types";
import type { MissionSignal } from "@/lib/morning-mission/signal-prefilter.server";

const TEST_SUBJECTS = new Set(["hei", "test", "testing", "demo"]);

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

/** Drop user's own test/noise mail before AI and from brief sections. */
export function isOwnNoiseMail(signal: MissionSignal, userEmail: string | null): boolean {
  const email = normalizeEmail(userEmail);
  const fromEmail = normalizeEmail(signal.meta?.from_email as string | undefined);
  const fromText = signal.from.toLowerCase();
  const subj = signal.subject.toLowerCase().trim();

  if (email) {
    if (fromEmail === email) return true;
    if (fromText.includes(email)) return true;
    const local = email.split("@")[0];
    if (local && fromText.includes(local) && subj.length <= 20) return true;
  }

  if (TEST_SUBJECTS.has(subj)) return true;
  if (/^test\b/i.test(subj)) return true;
  if (subj === "hei" && signal.snippet.toLowerCase().includes("test")) return true;

  return false;
}

function itemTouchesSignal(
  item: { source_ids: string[] },
  predicate: (s: MissionSignal) => boolean,
  signals: MissionSignal[],
): boolean {
  return item.source_ids.some((id) => {
    const s = signals.find((x) => x.id === id);
    return s ? predicate(s) : false;
  });
}

function stripItems(
  items: MorningMissionItem[],
  predicate: (item: MorningMissionItem) => boolean,
): MorningMissionItem[] {
  return items.filter((i) => !predicate(i));
}

function buildDeliveryFailureItem(signal: MissionSignal): MorningMissionItem {
  const recipientHint = signal.snippet.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0];
  return {
    id: `delivery-failure-${signal.id.replace(/[^a-z0-9]+/gi, "-")}`,
    title: recipientHint
      ? `E-post til ${recipientHint} kom aldri fram`
      : "E-post kom ikke fram",
    explanation:
      signal.snippet ||
      "Levering feilet. Mottakeren har sannsynligvis ikke fått meldingen din — du kan tro du venter på svar uten at de har sett den.",
    recommended_action: recipientHint
      ? `Bekreft riktig adresse for ${recipientHint} og send på nytt.`
      : "Finn riktig mottakeradresse og send på nytt.",
    priority: "high",
    source_ids: [signal.id],
    source_label: "Gmail",
    href: signal.href,
  };
}

function buildUnpaidInvoiceItem(signal: MissionSignal): MorningMissionItem {
  const invNr = signal.meta?.invoice_number as string | null;
  const customer = (signal.meta?.customer_name as string) || signal.from;
  const total = Number(signal.meta?.total ?? 0);
  const due = signal.meta?.due_date as string | null;
  const invoiceId = signal.meta?.invoice_id as string;
  return {
    id: `invoice-${invoiceId}`,
    title: invNr ? `Ubetalt faktura ${invNr}` : signal.subject,
    explanation: `${customer} skylder ${total > 0 ? `${Math.round(total).toLocaleString("nb-NO")} kr` : "ubetalt beløp"}${due ? ` (forfall ${new Date(due).toLocaleDateString("nb-NO")})` : ""}.`,
    recommended_action: "Åpne purring i Mission — forslag og PDF er klart.",
    priority: "high",
    source_ids: [signal.id],
    source_label: `Finance · ${signal.meta?.org_name ?? "Finance"}`,
    href: signal.href,
  };
}

function upsertTodayItem(
  today: MorningMissionItem[],
  item: MorningMissionItem,
): MorningMissionItem[] {
  const without = today.filter(
    (t) => !t.source_ids.some((id) => item.source_ids.includes(id)),
  );
  return [item, ...without];
}

/**
 * Apply deterministic trust rules on top of AI output.
 * AI still does narrative grouping; these rules fix known misclassifications.
 */
export function applyTrustRules(
  payload: MorningMissionPayload,
  signals: MissionSignal[],
  userEmail: string | null,
): MorningMissionPayload {
  const isNoise = (item: MorningMissionItem) =>
    itemTouchesSignal(item, (s) => isOwnNoiseMail(s, userEmail), signals);

  const isDelivery = (item: MorningMissionItem) =>
    itemTouchesSignal(item, (s) => s.tags.includes("delivery_failure"), signals);

  let today = stripItems(payload.today, isNoise);
  let this_week = stripItems(payload.this_week, isNoise);
  let waiting = stripItems(payload.waiting, isNoise);

  // Delivery failure must never sit in waiting/this_week only — promote to today.
  for (const section of [payload.waiting, payload.this_week]) {
    for (const item of section) {
      if (isDelivery(item)) {
        const sig = signals.find((s) => item.source_ids.includes(s.id));
        if (sig) today = upsertTodayItem(today, buildDeliveryFailureItem(sig));
      }
    }
  }
  waiting = stripItems(waiting, isDelivery);
  this_week = stripItems(this_week, isDelivery);

  for (const sig of signals) {
    if (!sig.tags.includes("delivery_failure")) continue;
    if (!today.some((t) => t.source_ids.includes(sig.id))) {
      today = upsertTodayItem(today, buildDeliveryFailureItem(sig));
    }
  }

  for (const sig of signals) {
    if (!sig.tags.includes("unpaid_invoice")) continue;
    if (sig.tags.includes("invoice_action")) {
      today = upsertTodayItem(today, buildUnpaidInvoiceItem(sig));
      continue;
    }
    const count = Number(sig.meta?.count ?? 0);
    if (count <= 0) continue;
    today = upsertTodayItem(today, buildUnpaidInvoiceItem(sig));
    this_week = stripItems(this_week, (i) => i.source_ids.includes(sig.id));
    waiting = stripItems(waiting, (i) => i.source_ids.includes(sig.id));
  }

  // Own test mail → noise (if it slipped through).
  const noise = [...payload.noise];
  for (const sig of signals) {
    if (isOwnNoiseMail(sig, userEmail)) {
      noise.push({ label: `${sig.from}: ${sig.subject} (egen test)`, source_ids: [sig.id] });
    }
  }

  return {
    ...payload,
    today: today.slice(0, 5),
    this_week,
    waiting,
    noise,
  };
}
