/** Avatar URLs for relation faces — Gravatar (person) + same-origin Logo.dev proxy (company). */

import { createHash } from "node:crypto";

/** Gravatar; `d=404` so our initials fallback shows when no photo exists. */
export function gravatarUrl(email: string, size = 128): string {
  const normalized = email.trim().toLowerCase();
  const hash = createHash("md5").update(normalized).digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404&r=g`;
}

/**
 * Company logo via our `/api/logo` proxy (server reads LOGO_DEV_PUBLISHABLE_KEY).
 * No VITE_ env needed — Lovable Secrets stay server-side; browser only hits same-origin.
 */
export function companyLogoUrl(domain: string, size = 128): string | null {
  const host = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
  if (!host || !host.includes(".")) return null;

  const params = new URLSearchParams({
    domain: host,
    size: String(size),
  });
  return `/api/logo?${params.toString()}`;
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
    return companyLogoUrl(input.domain);
  }
  return null;
}
