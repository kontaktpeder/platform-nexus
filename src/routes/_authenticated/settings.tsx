import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Network, ChevronRight, Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  hasEmailPasswordProvider,
  hasGoogleProvider,
  listAuthProviders,
} from "@/lib/auth-helpers";
import { clearPasswordRecoveryPending } from "@/lib/auth-recovery";
import { TopBar } from "@/components/platform/TopBar";
import { PlatformBottomNav } from "@/components/platform/PlatformBottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Platform Core" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const providers = listAuthProviders(user);
  const storedBeforeId = typeof window !== "undefined"
    ? sessionStorage.getItem("platform:auth:userIdBefore")
    : null;

  async function signOut() {
    if (user?.id) {
      sessionStorage.setItem("platform:auth:userIdBefore", user.id);
    }
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function copyUserId() {
    if (!user?.id) return;
    await navigator.clipboard.writeText(user.id);
    toast.success("user.id kopiert");
  }

  async function setPasswordOnExistingAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (password.length < 8) {
      toast.error("Passord må være minst 8 tegn");
      return;
    }
    if (password !== confirm) {
      toast.error("Passordene er ikke like");
      return;
    }

    const beforeId = user.id;
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      const afterId = data.user?.id ?? beforeId;
      if (beforeId !== afterId) {
        toast.error(`Bruker-ID endret (${beforeId} → ${afterId})`);
        return;
      }
      toast.success("Passord lagret på eksisterende konto", {
        description: `user.id uendret: ${afterId}`,
        duration: 10000,
      });
      clearPasswordRecoveryPending();
      setPassword("");
      setConfirm("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Kunne ikke sette passord");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar title="Settings" subtitle="Account" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-24">
        <section className="surface-card p-5">
          <h2 className="font-heading text-base font-semibold">Konto</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Innlogget som{" "}
            <span className="font-medium text-foreground">{user?.email ?? "—"}</span>
          </p>

          <div className="mt-4 rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  user.id
                </p>
                <p className="mt-1 break-all font-mono text-xs">{user?.id ?? "—"}</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={copyUserId}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Providers: {providers.length ? providers.join(", ") : "—"}
            </p>
            {storedBeforeId && storedBeforeId !== user?.id && (
              <p className="mt-2 text-xs text-destructive">
                Advarsel: lagret user.id ({storedBeforeId}) matcher ikke nåværende.
              </p>
            )}
            {storedBeforeId && storedBeforeId === user?.id && (
              <p className="mt-2 text-xs text-emerald-700">
                ✓ user.id uendret siden forrige innlogging ({storedBeforeId})
              </p>
            )}
          </div>

          <Button variant="outline" className="mt-4 gap-2" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Logg ut
          </Button>
        </section>

        <section className="surface-card mt-4 p-5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-heading text-base font-semibold">Passordinnlogging</h2>
          </div>
          {hasEmailPasswordProvider(user) ? (
            <p className="mt-2 text-sm text-muted-foreground">
              E-post/passord er aktivert på denne kontoen. Du kan logge inn med passord på{" "}
              <Link to="/auth" className="underline">
                /auth
              </Link>
              .
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                {hasGoogleProvider(user)
                  ? "Du har Google-innlogging. Sett passord her for å beholde samme bruker-ID — eller bruk «Glemt passord» på innloggingssiden med samme e-post."
                  : "Sett et passord for lokal innlogging."}
              </p>
              <form onSubmit={setPasswordOnExistingAccount} className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">Nytt passord</Label>
                  <Input
                    id="new-password"
                    type="password"
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Bekreft passord</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    minLength={8}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    disabled={busy}
                  />
                </div>
                <Button type="submit" disabled={busy}>
                  Lagre passord på denne kontoen
                </Button>
              </form>
            </>
          )}
        </section>

        <Link
          to="/knowledge"
          className="surface-card mt-4 flex items-center justify-between gap-3 p-5 transition-colors hover:bg-muted/30"
        >
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Network className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-base font-semibold">Knowledge</h2>
              <p className="text-sm text-muted-foreground">
                People, companies, and projects — how Platform understands your world.
              </p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Link>
      </main>
      <PlatformBottomNav />
    </div>
  );
}
