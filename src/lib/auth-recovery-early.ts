/**
 * Runs synchronously on first import — BEFORE Supabase client parses the URL.
 *
 * Recovery e-mail links with explicit type=recovery (often in hash) must be
 * forced to /auth/update-password so detectSessionInUrl does not dump the user
 * onto Mission before they set a password.
 *
 * IMPORTANT: bare ?code= is used by Google OAuth (PKCE) and must NOT be treated
 * as password recovery. PKCE recovery codes land on /auth/update-password via
 * resetPasswordForEmail({ redirectTo }).
 */
const RECOVERY_PENDING_KEY = "platform:auth:passwordRecoveryPending";

function hashParams(url: URL): URLSearchParams {
  return new URLSearchParams(url.hash.replace(/^#/, ""));
}

/** Explicit recovery markers — never bare OAuth ?code=. */
export function urlHasExplicitRecoveryMarkers(url: URL): boolean {
  const hash = hashParams(url);
  return (
    url.searchParams.get("type") === "recovery" ||
    hash.get("type") === "recovery"
  );
}

/** On the update-password page, ?code= / hash tokens are recovery PKCE/legacy. */
export function urlHasUpdatePasswordRecoveryParams(url: URL): boolean {
  if (url.pathname !== "/auth/update-password") return false;
  const hash = hashParams(url);
  return (
    url.searchParams.has("code") ||
    urlHasExplicitRecoveryMarkers(url) ||
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
    if (urlHasUpdatePasswordRecoveryParams(url)) markPasswordRecoveryPending();
    return false;
  }

  // Only hijack clearly marked recovery links — never OAuth ?code= callbacks.
  if (!urlHasExplicitRecoveryMarkers(url)) return false;

  markPasswordRecoveryPending();
  window.location.replace(`/auth/update-password${url.search}${url.hash}`);
  return true;
}

// Side effect: redirect immediately when this module loads in the browser.
runEarlyRecoveryRedirect();
