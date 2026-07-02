import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Network, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TopBar } from "@/components/platform/TopBar";
import { PlatformBottomNav } from "@/components/platform/PlatformBottomNav";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Platform Core" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar title="Settings" subtitle="Account" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-24">
        <section className="surface-card p-5">
          <h2 className="font-heading text-base font-semibold">Account</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as{" "}
            <span className="font-medium text-foreground">{user?.email ?? "—"}</span>
          </p>
          <Button variant="outline" className="mt-4 gap-2" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
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
