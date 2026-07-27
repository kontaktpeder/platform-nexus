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
