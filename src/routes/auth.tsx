import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { redirectAfterLogin } from "@/lib/auth-redirect";
import { isPasswordRecoveryPending, clearPasswordRecoveryPending } from "@/lib/auth-recovery-early";
import { hasRecoveryLinkInUrl, redirectRecoveryLinkToUpdatePassword } from "@/lib/auth-recovery";
import { listAuthProviders } from "@/lib/auth-helpers";
import { mintSsoHandoff } from "@/lib/sso.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AuthMode = "signin" | "signup" | "forgot";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    return_to: typeof search.return_to === "string" ? search.return_to : undefined,
  }),
  head: () => ({ meta: [{ title: "Logg inn — Platform Core" }] }),
  component: AuthPage,
});

function authRedirectUrl(path: string): string {
  return `${window.location.origin}${path}`;
}

function AuthPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { return_to: returnTo } = Route.useSearch();
  const mintSso = useServerFn(mintSsoHandoff);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [redirectStuck, setRedirectStuck] = useState(false);
  const redirectedRef = useRef(false);

  const goHome = useCallback(
    async (signedInUser?: { id: string; email?: string | null }) => {
      if (redirectedRef.current) return;
      redirectedRef.current = true;
      setRedirecting(true);
      setRedirectStuck(false);
      if (signedInUser?.id) {
        sessionStorage.setItem("platform:auth:userIdBefore", signedInUser.id);
      }

      // Identity Core: hand off session to Finance/Work when return_to is set.
      if (returnTo) {
        try {
          const { data: sess } = await supabase.auth.getSession();
          const accessToken = sess.session?.access_token;
          const refreshToken = sess.session?.refresh_token;
          if (!accessToken || !refreshToken) {
            throw new Error("Mangler sesjon for SSO-handoff");
          }
          const res = await mintSso({
            data: { returnTo, accessToken, refreshToken },
          });
          window.location.assign(res.redirectUrl);
          return;
        } catch (err) {
          redirectedRef.current = false;
          setRedirecting(false);
          toast.error(err instanceof Error ? err.message : "SSO-handoff feilet");
          return;
        }
      }

      try {
        await redirectAfterLogin((opts) => navigate(opts as never));
      } catch {
        redirectedRef.current = false;
        setRedirectStuck(true);
      }
      // If soft navigate left us on /auth, surface a manual escape hatch.
      window.setTimeout(() => {
        if (window.location.pathname.startsWith("/auth")) {
          setRedirectStuck(true);
          redirectedRef.current = false;
        }
      }, 1500);
    },
    [navigate, returnTo, mintSso],
  );

  useEffect(() => {
    if (hasRecoveryLinkInUrl()) {
      redirectRecoveryLinkToUpdatePassword();
      return;
    }
    if (!authLoading && user) {
      if (isPasswordRecoveryPending()) {
        clearPasswordRecoveryPending();
      }
      void goHome(user);
    }
  }, [authLoading, user, goHome]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: authRedirectUrl("/auth/update-password"),
        });
        if (error) throw error;
        toast.success("Sjekk e-posten din", {
          description:
            "Åpne lenken i e-posten for å sette nytt passord. Bruk samme adresse som Google-kontoen din.",
          duration: 12000,
        });
        setMode("signin");
        return;
      }

      if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          if (error.message.toLowerCase().includes("invalid login credentials")) {
            throw new Error(
              "Feil e-post eller passord. Har du logget inn med Google før? Bruk «Glemt passord» med samme e-post for å aktivere passordinnlogging.",
            );
          }
          throw error;
        }
        clearPasswordRecoveryPending();
        const providers = listAuthProviders(data.user).join(", ");
        toast.success("Velkommen tilbake", {
          description: `user.id: ${data.user?.id ?? "—"} · ${providers}`,
          duration: 8000,
        });
        await goHome(data.user ?? undefined);
        return;
      }

      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: authRedirectUrl("/auth"),
          data: { display_name: displayName || email.split("@")[0] },
        },
      });
      if (error) throw error;
      toast.success("Konto opprettet — sjekk e-posten for bekreftelse");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Innlogging feilet");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    clearPasswordRecoveryPending();
    if (user?.id) {
      sessionStorage.setItem("platform:auth:userIdBefore", user.id);
    }
    // Land back on /auth so session + redirect run in one place (not bare /).
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: authRedirectUrl("/auth"),
    });
    if (result.error) {
      toast.error(result.error instanceof Error ? result.error.message : "Google-innlogging feilet");
      setBusy(false);
      return;
    }
    if (result.redirected) return;

    const { data } = await supabase.auth.getUser();
    clearPasswordRecoveryPending();
    if (data.user?.id) {
      sessionStorage.setItem("platform:auth:userIdBefore", data.user.id);
      toast.success("Logget inn med Google", {
        description: `user.id: ${data.user.id}`,
        duration: 8000,
      });
    }
    await goHome(data.user ?? undefined);
  }

  const title =
    mode === "forgot" ? "Glemt passord" : mode === "signin" ? "Logg inn" : "Opprett konto";
  const subtitle =
    mode === "forgot"
      ? "Vi sender en lenke til e-posten din. Bruk samme adresse som Google-kontoen for å beholde eksisterende bruker-ID."
      : returnTo
        ? "Logg inn for å fortsette til modulen."
        : mode === "signin"
          ? "Fortsett til dine arbeidsflater."
          : "Har du allerede Google-konto? Bruk «Glemt passord» i stedet — ikke opprett ny konto.";

  if (redirectStuck) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
        <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">Redirect tok for lang tid.</p>
          <Button
            className="w-full"
            onClick={() => {
              redirectedRef.current = true;
              void navigate({ to: "/app", replace: true });
            }}
          >
            Gå til Hjem
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              window.location.assign("/app");
            }}
          >
            Åpne Hjem (hard refresh)
          </Button>
        </div>
      </main>
    );
  }

  if (authLoading || redirecting || user) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p>{user || redirecting ? "Sender deg videre…" : "Sjekker innlogging…"}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl gradient-primary text-primary-foreground">
            <Layers className="h-5 w-5" />
          </div>
          <span className="font-heading text-lg font-semibold">Platform Core</span>
        </Link>

        <div className="surface-card p-6 md:p-8">
          <h1 className="font-heading text-2xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>

          {mode !== "forgot" && (
            <>
              <Button
                type="button"
                variant="outline"
                className="mt-6 w-full"
                onClick={handleGoogle}
                disabled={busy}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
                  />
                </svg>
                Fortsett med Google
              </Button>

              <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" /> ELLER <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Navn</Label>
                <Input
                  id="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Fornavn Etternavn"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">E-post</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="deg@firma.no"
              />
            </div>
            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Passord</Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      className="text-xs font-medium text-primary hover:underline"
                      onClick={() => setMode("forgot")}
                    >
                      Glemt passord?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "forgot"
                ? "Send tilbakestillingslenke"
                : mode === "signin"
                  ? "Logg inn med passord"
                  : "Opprett konto"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "forgot" ? (
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setMode("signin")}
              >
                Tilbake til innlogging
              </button>
            ) : (
              <>
                {mode === "signin" ? "Ny her?" : "Har du konto?"}{" "}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                >
                  {mode === "signin" ? "Opprett konto" : "Logg inn"}
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </main>
  );
}
