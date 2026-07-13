/**
 * Runs synchronously on first import — BEFORE Supabase client parses the URL.
 * Recovery e-mail links often land on / or /auth with ?code=; without this,
 * detectSessionInUrl logs the user in and the app sends them to forside/mission.
 */
const RECOVERY_PENDING_KEY = "platform:auth:passwordRecoveryPending";

function urlHasRecoveryParams(url: URL): boolean {
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  return (
    url.searchParams.has("code") ||
    url.searchParams.get("type") === "recovery" ||
    hash.get("type") === "recovery" ||
    hash.has("access_token")
  );
}

export function isPasswordRecoveryPending(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(RECOVERY_PENDING_KEY) === "1";
}

export function markPasswordRecoveryPending(): void {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(RECOVERY_PENDING_KEY, "1");
  }
}

export function clearPasswordRecoveryPending(): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(RECOVERY_PENDING_KEY);
  }
}

export function runEarlyRecoveryRedirect(): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  if (url.pathname === "/auth/update-password") {
    if (urlHasRecoveryParams(url)) markPasswordRecoveryPending();
    return false;
  }
  if (!urlHasRecoveryParams(url)) return false;

  markPasswordRecoveryPending();
  window.location.replace(`/auth/update-password${url.search}${url.hash}`);
  return true;
}

// Side effect: redirect immediately when this module loads in the browser.
runEarlyRecoveryRedirect();
