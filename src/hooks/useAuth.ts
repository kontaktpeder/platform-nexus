import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

function urlHasOAuthCode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    if (url.pathname === "/auth/update-password") return false;
    if (url.searchParams.get("type") === "recovery") return false;
    return url.searchParams.has("code");
  } catch {
    return false;
  }
}

function stripOAuthParamsFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("code") && !url.searchParams.has("state")) return;
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const waitingForOAuth = urlHasOAuthCode();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (cancelled) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        stripOAuthParamsFromUrl();
        setLoading(false);
      }
    });

    async function boot() {
      // Give detectSessionInUrl a moment when returning from Google with ?code=
      if (waitingForOAuth) {
        for (let i = 0; i < 20 && !cancelled; i++) {
          const { data } = await supabase.auth.getSession();
          if (data.session?.user) {
            setSession(data.session);
            setUser(data.session.user);
            stripOAuthParamsFromUrl();
            setLoading(false);
            return;
          }
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    }

    void boot();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user, loading };
}
