/** Avatar URLs for relation faces — Gravatar (person) + domain logo (company). */

import { createHash } from "node:crypto";

/** Gravatar; `d=404` so our initials fallback shows when no photo exists. */
export function gravatarUrl(email: string, size = 128): string {
  const normalized = email.trim().toLowerCase();
  const hash = createHash("md5").update(normalized).digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404&r=g`;
}

/** Public company mark from domain (Clearbit). 404 → Avatar fallback. */
export function companyLogoUrl(domain: string, size = 128): string {
  const host = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
  if (!host || !host.includes(".")) return "";
  // Clearbit serves square logos; size hint unused but keeps URL stable for cache.
  return `https://logo.clearbit.com/${host}?size=${size}`;
}

export function relationImageUrl(input: {
  entityType: "person" | "company" | null | undefined;
  email?: string | null;
  domain?: string | null;
  explicitUrl?: string | null;
}): string | null {
  if (input.explicitUrl?.trim()) return input.explicitUrl.trim();
  if (input.entityType === "person" && input.email?.includes("@")) {
    return gravatarUrl(input.email);
  }
  if (input.entityType === "company" && input.domain) {
    const url = companyLogoUrl(input.domain);
    return url || null;
  }
  // Person without email but with domain — skip (no face).
  // Company without domain — skip.
  return null;
}
