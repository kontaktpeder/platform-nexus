// Client-only: establish a Supabase session from password-recovery email links.
// Handles PKCE (?code=) and legacy hash (#access_token=&type=recovery).

import {
  clearPasswordRecoveryPending,
  isPasswordRecoveryPending,
  markPasswordRecoveryPending,
} from "@/lib/auth-recovery-early";
import { supabase } from "@/integrations/supabase/client";

export type RecoveryBootstrapResult =
  | { ok: true; userId: string; via: "pkce" | "hash" | "session" }
  | { ok: false; reason: "no_link" | "exchange_failed" | "no_session"; message: string };

function hasRecoveryParams(url: URL): boolean {
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  return (
    url.searchParams.has("code") ||
    url.searchParams.get("type") === "recovery" ||
    hash.get("type") === "recovery" ||
    hash.has("access_token")
  );
}

export function hasRecoveryLinkInUrl(href: string = window.location.href): boolean {
  try {
    return hasRecoveryParams(new URL(href));
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
  const code = url.searchParams.get("code");

  if (code || hasRecoveryParams(url)) {
    markPasswordRecoveryPending();
  }

  if (code) {
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
    return { ok: true, userId, via: "pkce" };
  }

  if (hasRecoveryParams(url)) {
    await new Promise((r) => setTimeout(r, 150));
    const { data, error } = await supabase.auth.getSession();
    cleanRecoveryParamsFromUrl();
    if (error) {
      return { ok: false, reason: "exchange_failed", message: error.message };
    }
    const userId = data.session?.user?.id;
    if (userId) {
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

export function redirectRecoveryLinkToUpdatePassword(): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;
  if (path === "/auth/update-password") return false;
  if (!hasRecoveryLinkInUrl()) return false;

  markPasswordRecoveryPending();
  const url = new URL(window.location.href);
  window.location.replace(`/auth/update-password${url.search}${url.hash}`);
  return true;
}

export { clearPasswordRecoveryPending, isPasswordRecoveryPending };
