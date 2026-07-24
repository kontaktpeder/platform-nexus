import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { listAuthProviders } from "@/lib/auth-helpers";
import { redirectAfterLogin } from "@/lib/auth-redirect";
import {
  bootstrapPasswordRecoverySession,
  clearPasswordRecoveryPending,
  redirectRecoveryLinkToUpdatePassword,
} from "@/lib/auth-recovery";
import { markPasswordRecoveryPending } from "@/lib/auth-recovery-early";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth/update-password")({
  head: () => ({ meta: [{ title: "Nytt passord — Platform Core" }] }),
  component: UpdatePasswordPage,
});

type BootState = "loading" | "ready" | "error";

function goToLoginCleared(navigate: ReturnType<typeof useNavigate>) {
  clearPasswordRecoveryPending();
  navigate({ to: "/auth", replace: true });
}

function UpdatePasswordPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [bootState, setBootState] = useState<BootState>("loading");
  const [bootError, setBootError] = useState<string | null>(null);
  const [userIdBefore, setUserIdBefore] = useState<string | null>(null);

  useEffect(() => {
    if (redirectRecoveryLinkToUpdatePassword()) return;

    markPasswordRecoveryPending();

    const stored = sessionStorage.getItem("platform:auth:userIdBefore");
    if (stored) setUserIdBefore(stored);

    let cancelled = false;

    async function boot() {
      const result = await bootstrapPasswordRecoverySession();
      if (cancelled) return;

      if (result.ok) {
        sessionStorage.setItem("platform:auth:userIdBefore", result.userId);
        setUserIdBefore(result.userId);
        setBootState("ready");
        setBootError(null);
        return;
      }

      if (result.reason === "no_link") {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user?.id) {
          sessionStorage.setItem("platform:auth:userIdBefore", data.session.user.id);
          setUserIdBefore(data.session.user.id);
          setBootState("ready");
          return;
        }
      }

      setBootState("error");
      setBootError(result.message);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session?.user?.id) {
        sessionStorage.setItem("platform:auth:userIdBefore", session.user.id);
        setUserIdBefore(session.user.id);
        setBootState("ready");
        setBootError(null);
      }
    });

    void boot();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authLoading && user?.id) {
      sessionStorage.setItem("platform:auth:userIdBefore", user.id);
      setUserIdBefore(user.id);
      setBootState("ready");
    }
  }, [authLoading, user?.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Passord må være minst 8 tegn");
      return;
    }
    if (password !== confirm) {
      toast.error("Passordene er ikke like");
      return;
    }

    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        const retry = await bootstrapPasswordRecoverySession();
        if (!retry.ok) {
          throw new Error(
            "Ingen aktiv session. Åpne lenken fra e-posten på nytt, eller logg inn med Google først.",
          );
        }
      }

      const beforeId = user?.id ?? userIdBefore ?? sessionData.session?.user?.id ?? null;
      const { data, error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      const afterId = data.user?.id ?? beforeId;
      const providers = listAuthProviders(data.user).join(", ") || "—";

      if (beforeId && afterId && beforeId !== afterId) {
        toast.error(`Bruker-ID endret (${beforeId} → ${afterId}). Kontakt support.`);
        return;
      }

      toast.success("Passord er satt", {
        description: `Du kan nå logge inn med e-post og passord. user.id: ${afterId ?? "ukjent"} · ${providers}`,
        duration: 10000,
      });

      clearPasswordRecoveryPending();
      await redirectAfterLogin((opts) => navigate(opts as never));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Kunne ikke oppdatere passord");
    } finally {
      setBusy(false);
    }
  }

  const isLoading = bootState === "loading" || authLoading;
  const canSubmit = bootState === "ready" || !!user;

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <button
          type="button"
          onClick={() => goToLoginCleared(navigate)}
          className="mb-8 flex w-full items-center justify-center gap-2"
        >
          <div className="grid h-9 w-9 place-items-center rounded-xl gradient-primary text-primary-foreground">
            <Layers className="h-5 w-5" />
          </div>
          <span className="font-heading text-lg font-semibold">Platform Core</span>
        </button>

        <div className="surface-card p-6 md:p-8">
          <h1 className="font-heading text-2xl font-semibold">Sett nytt passord</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Fra «Glemt passord»-e-posten, eller for å legge passord på Google-kontoen din.
          </p>

          {userIdBefore && (
            <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground">
              user.id: {userIdBefore}
            </p>
          )}

          {isLoading && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifiserer lenken…
            </div>
          )}

          {!isLoading && bootState === "error" && (
            <div className="mt-4 space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900">
              <p>{bootError}</p>
              <p className="text-xs">
                Be om ny lenke via Glemt passord, eller logg inn med Google og sett passord under
                Innstillinger.
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => goToLoginCleared(navigate)}
              >
                Tilbake til innlogging
              </Button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">Nytt passord</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                placeholder={canSubmit ? "Minst 8 tegn" : "Venter på gyldig lenke…"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Bekreft passord</Label>
              <Input
                id="confirm"
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={busy}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy || isLoading}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lagre passord
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => goToLoginCleared(navigate)}
            >
              Tilbake til innlogging
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}
