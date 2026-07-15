// Pure helpers: extract deterministic identities from normalized signals.
// No side effects. Client-safe.

import type { NormalizedSignal } from "@/lib/ingest/normalize";
import {
  extractEmailAddress,
  normalizeChannelName,
  normalizeName,
} from "@/lib/knowledge/entity-matcher";
import type { ExtractedIdentity } from "./types";

const DOMAIN_BLOCKLIST = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "icloud.com",
  "me.com",
  "live.com",
  "msn.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

function parseDisplayName(fromHeader: string, email: string): string | null {
  const withoutEmail = fromHeader
    .replace(new RegExp(`<?\\s*${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*>?`, "i"), "")
    .replace(/["<>]/g, "")
    .trim();
  return withoutEmail || null;
}

function parseEmailList(raw: string | null | undefined, role: ExtractedIdentity["role"]): ExtractedIdentity[] {
  if (!raw?.trim()) return [];
  const out: ExtractedIdentity[] = [];
  const parts = raw.split(",");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const email = extractEmailAddress(trimmed)?.toLowerCase() ?? null;
    if (!email || !email.includes("@")) continue;
    const domain = email.slice(email.indexOf("@") + 1);
    const displayName =
      parseDisplayName(trimmed, email) ?? (normalizeName(trimmed) || null);
    out.push({
      provider: "gmail",
      identityType: "email_address",
      externalKey: email,
      role,
      displayName,
      email,
      domain,
      confidence: 1,
    });
    if (domain && !DOMAIN_BLOCKLIST.has(domain)) {
      out.push({
        provider: "gmail",
        identityType: "email_domain",
        externalKey: domain,
        role: "domain",
        displayName: domain,
        domain,
        confidence: 0.9,
      });
    }
  }
  return out;
}

export function extractIdentitiesFromSignal(signal: NormalizedSignal): ExtractedIdentity[] {
  const meta = (signal.metadata ?? {}) as Record<string, unknown>;
  const out: ExtractedIdentity[] = [];
  const seen = new Set<string>();

  function add(item: ExtractedIdentity) {
    const key = `${item.provider}:${item.identityType}:${item.externalKey}:${item.role}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  }

  if (signal.source === "gmail") {
    for (const item of parseEmailList(meta.from as string | undefined, "sender")) add(item);
    for (const item of parseEmailList(meta.to as string | undefined, "recipient")) add(item);
    return out;
  }

  if (signal.source === "slack") {
    const userId = typeof meta.user_id === "string" ? meta.user_id : null;
    const displayName =
      typeof meta.user_display_name === "string" ? meta.user_display_name : null;
    const channelId = typeof meta.channel_id === "string" ? meta.channel_id : null;
    const channelName =
      typeof meta.channel_name === "string" ? meta.channel_name : null;
    const kind = typeof meta.kind === "string" ? meta.kind : null;

    if (userId) {
      add({
        provider: "slack",
        identityType: "slack_user",
        externalKey: userId,
        role: kind === "channel" ? "participant" : "sender",
        displayName,
        handle: userId,
        confidence: 1,
      });
    }

    if (channelId) {
      const normalized = normalizeChannelName(channelName ?? channelId);
      add({
        provider: "slack",
        identityType: "slack_channel",
        externalKey: channelId,
        role: "channel",
        displayName: channelName ?? (normalized || channelId),
        handle: normalized || channelId,
        confidence: 1,
      });
    }
    return out;
  }

  return out;
}

export function identityLookupKey(item: ExtractedIdentity): string {
  return `${item.provider}:${item.identityType}:${item.externalKey}`;
}

/** Map legacy Knowledge v2 cluster keys to identity lookup coordinates. */
export function legacySuggestionKeyToIdentity(
  suggestionKey: string,
): Pick<ExtractedIdentity, "provider" | "identityType" | "externalKey"> | null {
  if (suggestionKey.startsWith("gmail_domain:")) {
    const domain = suggestionKey.slice("gmail_domain:".length);
    if (!domain) return null;
    return { provider: "gmail", identityType: "email_domain", externalKey: domain };
  }
  if (suggestionKey.startsWith("slack_channel:")) {
    const ch = suggestionKey.slice("slack_channel:".length);
    if (!ch) return null;
    return { provider: "slack", identityType: "slack_channel", externalKey: ch };
  }
  if (suggestionKey.startsWith("workspace_org:")) {
    const slug = suggestionKey.slice("workspace_org:".length);
    if (!slug) return null;
    return { provider: "platform", identityType: "external_account", externalKey: slug };
  }
  return null;
}
