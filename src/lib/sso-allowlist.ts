/** Production CORE modules — used when Lovable Secrets are not yet injected into process.env. */
export const DEFAULT_SSO_RETURN_ORIGINS = [
  "https://financecore.lovable.app",
  "https://work-heart-engine.lovable.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
] as const;

/** Parse SSO_RETURN_ALLOWLIST (comma-separated origins) into a Set. */
export function parseSsoReturnAllowlist(raw: string | undefined | null): Set<string> {
  const set = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const trimmed = part.trim().replace(/\/$/, "");
    if (!trimmed) continue;
    try {
      const u = new URL(trimmed);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      set.add(`${u.protocol}//${u.host}`);
    } catch {
      /* skip invalid */
    }
  }
  return set;
}

/** Env allowlist, or built-in CORE production/localhost defaults. */
export function resolveSsoReturnAllowlist(
  raw: string | undefined | null = process.env.SSO_RETURN_ALLOWLIST,
): Set<string> {
  const fromEnv = parseSsoReturnAllowlist(raw);
  if (fromEnv.size > 0) return fromEnv;
  return new Set(DEFAULT_SSO_RETURN_ORIGINS);
}

/**
 * Validate return_to: must be http(s) origin (+ optional path) on the allowlist.
 * Returns normalized origin (no trailing slash) or null.
 */
export function resolveAllowedReturnOrigin(
  returnTo: string,
  allowlist: Set<string>,
): string | null {
  let url: URL;
  try {
    url = new URL(returnTo);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // Reject credentials / unexpected ports tricks — host must match allowlist entry.
  const origin = `${url.protocol}//${url.host}`;
  if (!allowlist.has(origin)) return null;
  return origin;
}
