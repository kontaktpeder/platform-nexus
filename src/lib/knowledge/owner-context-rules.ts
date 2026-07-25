// Deterministic owner_context inference for Gmail (and similar) signals.
// Order: existing entity → recipient mailbox → sender domain → keywords → unknown.
// Never invent org — prefer unknown over wrong.

import type { OwnerContext } from "@/lib/knowledge/types";
import { extractEmailAddress } from "@/lib/knowledge/entity-matcher";

export type OwnerContextEvidence = {
  to?: string | null;
  from?: string | null;
  cc?: string | null;
  subject?: string | null;
  snippet?: string | null;
  /** Already linked company org — wins unless unknown. */
  existingOwnerContext?: OwnerContext | null;
};

/** Your mailbox aliases → org. Extend as needed. */
export const MAILBOX_ALIASES: Array<{ match: RegExp; owner: OwnerContext }> = [
  // Gold of Sicily
  { match: /@goldofsicily\./i, owner: "gold-of-sicily" },
  { match: /@gold-of-sicily\./i, owner: "gold-of-sicily" },
  { match: /goldofsicily@/i, owner: "gold-of-sicily" },
  // Peder ENK — Studio PAH only (kontaktpeder@gmail is mixed → manual org chip)
  { match: /^mail@studiopah\.no$/i, owner: "peder-enk" },
  { match: /@studiopah\.no$/i, owner: "peder-enk" },
];

/** External sender domains that strongly imply an org. */
export const SENDER_DOMAIN_OWNERS: Array<{ match: RegExp; owner: OwnerContext }> = [
  { match: /(^|\.)goldofsicily\./i, owner: "gold-of-sicily" },
  { match: /(^|\.)gold-of-sicily\./i, owner: "gold-of-sicily" },
  { match: /(^|\.)studiopah\.no$/i, owner: "peder-enk" },
];

const KEYWORD_RULES: Array<{ owner: OwnerContext; patterns: RegExp[] }> = [
  {
    owner: "gold-of-sicily",
    patterns: [
      /\barancini\b/i,
      /\bcatering\b/i,
      /\bgold of sicily\b/i,
      /\bsicily\b/i,
      /\brestaurant\b/i,
      /\blevering\b/i,
      /\bevent\b/i,
      /\bkjøkken\b/i,
    ],
  },
  {
    owner: "peder-enk",
    patterns: [
      /\bfaktura\b/i,
      /\binvoice\b/i,
      /\bstudio\b/i,
      /\butvikling\b/i,
      /\bdesign\b/i,
      /\bconsulting\b/i,
      /\benk\b/i,
    ],
  },
  {
    owner: "personal",
    patterns: [
      /\blege\b/i,
      /\btannlege\b/i,
      /\bfamilie\b/i,
      /\bferie\b/i,
      /\bprivat\b/i,
      /\bbankid\b/i,
    ],
  },
];

function emailsInHeader(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((p) => extractEmailAddress(p.trim())?.toLowerCase() ?? null)
    .filter((e): e is string => !!e);
}

function domainOf(email: string): string {
  const i = email.indexOf("@");
  return i >= 0 ? email.slice(i + 1).toLowerCase() : "";
}

function matchMailbox(email: string): OwnerContext | null {
  for (const rule of MAILBOX_ALIASES) {
    if (rule.match.test(email)) return rule.owner;
  }
  return null;
}

function matchSenderDomain(domain: string): OwnerContext | null {
  if (!domain || isConsumerEmailDomain(domain)) return null;
  for (const rule of SENDER_DOMAIN_OWNERS) {
    if (rule.match.test(domain)) return rule.owner;
  }
  return null;
}

function matchKeywords(text: string): OwnerContext | null {
  if (!text.trim()) return null;
  const hits: OwnerContext[] = [];
  for (const rule of KEYWORD_RULES) {
    if (rule.patterns.some((p) => p.test(text))) hits.push(rule.owner);
  }
  if (hits.length === 1) return hits[0]!;
  return null; // conflict or none → no keyword claim
}

/**
 * Infer owner_context. First non-null rule wins (see order in body).
 * Returns null when unsure — caller should use "unknown", not a default org.
 */
export function inferOwnerContext(ev: OwnerContextEvidence): OwnerContext | null {
  const existing = ev.existingOwnerContext;
  if (existing && existing !== "unknown") return existing;

  const recipients = [
    ...emailsInHeader(ev.to),
    ...emailsInHeader(ev.cc),
  ];
  for (const email of recipients) {
    const hit = matchMailbox(email);
    if (hit) return hit;
  }

  const fromEmails = emailsInHeader(ev.from);
  for (const email of fromEmails) {
    const box = matchMailbox(email);
    if (box) return box;
    const dom = matchSenderDomain(domainOf(email));
    if (dom) return dom;
  }

  const text = [ev.subject, ev.snippet].filter(Boolean).join("\n");
  const kw = matchKeywords(text);
  if (kw) return kw;

  // No soft "all consumer = personal" — kontaktpeder@gmail is ENK mailbox above.
  return null;
}

/** Majority vote across several signal evidences (for identity promotion). */
export function voteOwnerContext(
  evidences: OwnerContextEvidence[],
): OwnerContext | null {
  const counts = new Map<OwnerContext, number>();
  for (const ev of evidences) {
    const v = inferOwnerContext(ev);
    if (!v || v === "unknown") continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: OwnerContext | null = null;
  let bestN = 0;
  for (const [owner, n] of counts) {
    if (n > bestN) {
      best = owner;
      bestN = n;
    } else if (n === bestN) {
      best = null; // tie → unknown
    }
  }
  return best;
}
