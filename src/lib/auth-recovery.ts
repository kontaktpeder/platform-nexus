// Client-only: establish a Supabase session from password-recovery email links.
// Handles PKCE (?code= on /auth/update-password) and legacy hash (#type=recovery).

import {
  clearPasswordRecoveryPending,
  isPasswordRecoveryPending,
  markPasswordRecoveryPending,
  urlHasExplicitRecoveryMarkers,
  urlHasUpdatePasswordRecoveryParams,
} from "@/lib/auth-recovery-early";
import { supabase } from "@/integrations/supabase/client";

export type RecoveryBootstrapResult =
  | { ok: true; userId: string; via: "pkce" | "hash" | "session" }
  | { ok: false; reason: "no_link" | "exchange_failed" | "no_session"; message: string };

/**
 * True when the URL is a password-recovery landing — not a Google OAuth callback.
 * Bare ?code= on / or /auth is OAuth; ?code= on /auth/update-password is recovery.
 */
export function hasRecoveryLinkInUrl(href: string = window.location.href): boolean {
  try {
    const url = new URL(href);
    if (urlHasExplicitRecoveryMarkers(url)) return true;
    if (urlHasUpdatePasswordRecoveryParams(url)) return true;
    return false;
  } catch {
    return false;
  }
}

function cleanRecoveryParamsFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("type");
  const hash = url.hash.replace(/^#/, "");
  if (hash) {
    const hp = new URLSearchParams(hash);
    if (hp.has("access_token") || hp.get("type") === "recovery") {
      url.hash = "";
    }
  }
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}

/**
 * Call on /auth/update-password mount. Exchanges ?code= or parses hash tokens.
 */
export async function bootstrapPasswordRecoverySession(): Promise<RecoveryBootstrapResult> {
  if (typeof window === "undefined") {
    return { ok: false, reason: "no_session", message: "Kunne ikke lese lenken." };
  }

  const url = new URL(window.location.href);
  const onUpdatePassword = url.pathname === "/auth/update-password";
  const code = url.searchParams.get("code");

  const isRecoveryContext =
    onUpdatePassword ||
    urlHasExplicitRecoveryMarkers(url) ||
    isPasswordRecoveryPending();

  if (isRecoveryContext && (code || urlHasExplicitRecoveryMarkers(url) || urlHasUpdatePasswordRecoveryParams(url))) {
    markPasswordRecoveryPending();
  }

  // Exchange PKCE code only in recovery context (update-password page).
  if (code && onUpdatePassword) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    cleanRecoveryParamsFromUrl();
    if (error) {
      return {
        ok: false,
        reason: "exchange_failed",
        message: error.message,
      };
    }
    const userId = data.session?.user?.id;
    if (!userId) {
      return {
        ok: false,
        reason: "no_session",
        message: "Lenken virket, men ingen session ble opprettet. Be om ny lenke.",
      };
    }
    markPasswordRecoveryPending();
    return { ok: true, userId, via: "pkce" };
  }

  if (urlHasExplicitRecoveryMarkers(url) || (onUpdatePassword && hashHasAccessToken(url))) {
    await new Promise((r) => setTimeout(r, 150));
    const { data, error } = await supabase.auth.getSession();
    cleanRecoveryParamsFromUrl();
    if (error) {
      return { ok: false, reason: "exchange_failed", message: error.message };
    }
    const userId = data.session?.user?.id;
    if (userId) {
      markPasswordRecoveryPending();
      return { ok: true, userId, via: "hash" };
    }
    return {
      ok: false,
      reason: "no_session",
      message:
        "Kunne ikke lese gjenopprettingslenken. Sjekk at redirect-URL er /auth/update-password i Supabase.",
    };
  }

  const { data } = await supabase.auth.getSession();
  if (data.session?.user?.id) {
    if (isPasswordRecoveryPending()) {
      return { ok: true, userId: data.session.user.id, via: "session" };
    }
  }

  return {
    ok: false,
    reason: "no_link",
    message: "Åpne lenken fra e-posten («Glemt passord»), eller logg inn først.",
  };
}

function hashHasAccessToken(url: URL): boolean {
  return new URLSearchParams(url.hash.replace(/^#/, "")).has("access_token");
}

export function redirectRecoveryLinkToUpdatePassword(): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;
  if (path === "/auth/update-password") return false;
  // Never redirect bare OAuth codes — only explicit recovery markers.
  if (!urlHasExplicitRecoveryMarkers(new URL(window.location.href))) return false;

  markPasswordRecoveryPending();
  const url = new URL(window.location.href);
  window.location.replace(`/auth/update-password${url.search}${url.hash}`);
  return true;
}

export { clearPasswordRecoveryPending, isPasswordRecoveryPending };
