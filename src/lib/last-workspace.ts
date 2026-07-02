const ORG_KEY = "platform:lastOrgSlug";
const WS_KEY = "platform:lastWsSlug";

export function getLastWorkspace(): { orgSlug: string; wsSlug: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const orgSlug = window.localStorage.getItem(ORG_KEY);
    const wsSlug = window.localStorage.getItem(WS_KEY);
    if (!orgSlug || !wsSlug) return null;
    return { orgSlug, wsSlug };
  } catch {
    return null;
  }
}

export function setLastWorkspace(orgSlug: string, wsSlug: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ORG_KEY, orgSlug);
    window.localStorage.setItem(WS_KEY, wsSlug);
  } catch {
    /* ignore */
  }
}
