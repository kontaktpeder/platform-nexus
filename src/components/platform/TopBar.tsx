import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

export type TopBarWorkspaceContext = {
  orgSlug: string;
  wsSlug: string;
  orgName: string;
  wsName: string;
};

export function TopBar({
  title,
  subtitle,
  back,
  workspaceContext,
}: {
  title: string;
  subtitle?: string;
  back?: { to: string; params?: Record<string, string> };
  workspaceContext?: TopBarWorkspaceContext;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-3xl items-center gap-2 px-3 sm:gap-3 sm:px-4">
        {back ? (
          <Link
            to={back.to}
            params={back.params}
            aria-label="Gå tilbake"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted active:bg-muted"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        ) : (
          <div className="w-11 shrink-0" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-heading text-base font-semibold leading-tight">{title}</div>
          {workspaceContext ? (
            <Link
              to="/o/$orgSlug/w/$wsSlug"
              params={{
                orgSlug: workspaceContext.orgSlug,
                wsSlug: workspaceContext.wsSlug,
              }}
              className="mt-0.5 block min-h-5 truncate text-xs leading-5 text-primary hover:underline"
            >
              {workspaceContext.orgName} · {workspaceContext.wsName}
            </Link>
          ) : (
            subtitle && (
              <div className="truncate text-xs leading-5 text-muted-foreground">{subtitle}</div>
            )
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-xl"
          onClick={signOut}
          aria-label="Logg ut"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
