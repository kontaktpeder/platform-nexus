// Knowledge v1 — deterministic entity matcher for Mission signals.
// Client-safe pure helpers. No AI, no fuzzy matching (exact normalized only).
// See docs/KNOWLEDGE.v1.md for the rule table (R1–R8).

import type { Entity } from "./types";

export type MatchRule = "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R8";

export type MatchCandidate = {
  entityId: string;
  entityName: string;
  entitySlug: string;
  confidence: number;
  rule: MatchRule;
};

export type MatchResult = {
  entity: MatchCandidate | null;
  ambiguous: boolean;
  rule?: MatchRule;
};

export type MatchInput = {
  source: "gmail" | "slack" | "workspace";
  externalRef: string;
  sender?: string | null;
  senderEmail?: string | null;
  channelName?: string | null;
  orgSlug?: string | null;
  orgName?: string | null;
  wsSlug?: string | null;
  wsName?: string | null;
};

// ─── Normalization helpers ──────────────────────────────────────────────────

export function normalizeName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractEmailAddress(from: string | null | undefined): string | null {
  if (!from) return null;
  const m = from.match(/<\s*([^>\s]+@[^>\s]+)\s*>/);
  if (m) return m[1].trim().toLowerCase();
  const plain = from.match(/([^\s"<>]+@[^\s"<>]+)/);
  return plain ? plain[1].trim().toLowerCase() : null;
}

export function extractEmailDomain(from: string | null | undefined): string | null {
  const email = extractEmailAddress(from);
  if (!email) return null;
  const at = email.indexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase();
}

export function domainRoot(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const parts = domain.toLowerCase().split(".");
  if (parts.length === 0) return null;
  // Strip leading "www"; take first label as root ("nordahl" from "nordahl.no").
  const filtered = parts[0] === "www" ? parts.slice(1) : parts;
  return filtered[0] ?? null;
}

export function normalizeChannelName(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/^#+/, "").trim().toLowerCase();
}

// ─── Core matcher ───────────────────────────────────────────────────────────

function pickSingle(
  matches: Array<Omit<MatchCandidate, "confidence">>,
  rule: MatchRule,
): MatchResult | null {
  if (matches.length === 0) return null;
  if (matches.length > 1) return { entity: null, ambiguous: true, rule };
  const m = matches[0];
  return {
    entity: { ...m, confidence: 1, rule },
    ambiguous: false,
    rule,
  };
}

function candidatesFrom(
  entities: Entity[],
  predicate: (e: Entity) => boolean,
  rule: MatchRule,
): Array<Omit<MatchCandidate, "confidence">> {
  const out: Array<Omit<MatchCandidate, "confidence">> = [];
  const seen = new Set<string>();
  for (const e of entities) {
    if (!predicate(e)) continue;
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push({ entityId: e.id, entityName: e.name, entitySlug: e.slug, rule });
  }
  return out;
}

function metaString(e: Entity, key: string): string | null {
  const v = e.metadata?.[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function matchEntityForSignal(
  input: MatchInput,
  entities: Entity[],
): MatchResult {
  const runRules = (): MatchResult => {
    if (input.source === "gmail") {
      const senderEmail =
        (input.senderEmail && input.senderEmail.toLowerCase()) || null;
      const senderDomain = senderEmail
        ? senderEmail.slice(senderEmail.indexOf("@") + 1)
        : null;

      // R1 — company by metadata.email_domain
      if (senderDomain) {
        const r = pickSingle(
          candidatesFrom(
            entities,
            (e) =>
              e.type === "company" &&
              metaString(e, "email_domain")?.toLowerCase() === senderDomain,
            "R1",
          ),
          "R1",
        );
        if (r) return r;
      }

      // R2 — company by domain root ↔ name/slug
      if (senderDomain) {
        const root = domainRoot(senderDomain);
        if (root) {
          const rootN = normalizeName(root);
          const r = pickSingle(
            candidatesFrom(
              entities,
              (e) =>
                e.type === "company" &&
                (normalizeName(e.name) === rootN || e.slug === root),
              "R2",
            ),
            "R2",
          );
          if (r) return r;
        }
      }

      // R3 — person by sender display name
      const senderN = normalizeName(input.sender);
      if (senderN) {
        const r = pickSingle(
          candidatesFrom(
            entities,
            (e) => e.type === "person" && normalizeName(e.name) === senderN,
            "R3",
          ),
          "R3",
        );
        if (r) return r;
      }

      // R4 — person by exact email
      if (senderEmail) {
        const r = pickSingle(
          candidatesFrom(
            entities,
            (e) =>
              e.type === "person" &&
              metaString(e, "email")?.toLowerCase() === senderEmail,
            "R4",
          ),
          "R4",
        );
        if (r) return r;
      }
    }

    if (input.source === "slack") {
      const senderN = normalizeName(input.sender);

      // R5 — person by sender display name (or metadata.slack_display_name)
      if (senderN) {
        const r = pickSingle(
          candidatesFrom(
            entities,
            (e) =>
              e.type === "person" &&
              (normalizeName(e.name) === senderN ||
                normalizeName(metaString(e, "slack_display_name")) === senderN),
            "R5",
          ),
          "R5",
        );
        if (r) return r;
      }

      // R6 — project/company by channel name (mentions only)
      const ch = normalizeChannelName(input.channelName);
      if (ch) {
        const r = pickSingle(
          candidatesFrom(
            entities,
            (e) =>
              (e.type === "project" || e.type === "company") &&
              (normalizeName(e.name) === ch || e.slug === ch),
            "R6",
          ),
          "R6",
        );
        if (r) return r;
      }
    }

    if (input.source === "workspace") {
      // R7 — project by platform_org_slug exact
      if (input.orgSlug) {
        const slug = input.orgSlug.toLowerCase();
        const r = pickSingle(
          candidatesFrom(
            entities,
            (e) =>
              e.type === "project" &&
              metaString(e, "platform_org_slug")?.toLowerCase() === slug,
            "R7",
          ),
          "R7",
        );
        if (r) return r;
      }

      // R8 — company/project by org name
      const orgN = normalizeName(input.orgName);
      if (orgN) {
        const r = pickSingle(
          candidatesFrom(
            entities,
            (e) =>
              (e.type === "company" || e.type === "project") &&
              normalizeName(e.name) === orgN,
            "R8",
          ),
          "R8",
        );
        if (r) return r;
      }
    }

    return { entity: null, ambiguous: false };
  };

  return runRules();
}
