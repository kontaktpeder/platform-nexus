import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
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
      </main>
      <PlatformBottomNav />
    </div>
  );
}
