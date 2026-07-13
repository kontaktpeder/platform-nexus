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
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        {back ? (
          <Link
            to={back.to}
            params={back.params}
            className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        ) : (
          <div className="w-9" />
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
              className="mt-0.5 block truncate text-xs text-primary hover:underline"
            >
              {workspaceContext.orgName} · {workspaceContext.wsName}
            </Link>
          ) : (
            subtitle && (
              <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
            )
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={signOut} aria-label="Logg ut">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
