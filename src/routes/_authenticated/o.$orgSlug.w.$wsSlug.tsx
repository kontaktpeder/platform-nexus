import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useWorkspaceContext } from "@/lib/workspaceContext";
import { ThemeProvider } from "@/components/platform/ThemeProvider";
import { TopBar } from "@/components/platform/TopBar";
import { BottomNav } from "@/components/platform/BottomNav";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/o/$orgSlug/w/$wsSlug")({
  component: WorkspaceShell,
});

function WorkspaceShell() {
  const { orgSlug, wsSlug } = Route.useParams();
  const { data, isLoading, error } = useWorkspaceContext(orgSlug, wsSlug);

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4 text-center">
        <div>
          <h1 className="font-heading text-xl font-semibold">Kunne ikke åpne arbeidsflaten</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Ukjent feil"}</p>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceContextBridge value={data}>
      <ThemeProvider theme={data.theme}>
        <div className="flex min-h-screen flex-col bg-background">
          <TopBar
            title={data.ws.name}
            subtitle={data.org.name}
            back={{ to: "/o/$orgSlug", params: { orgSlug } }}
          />
          <div className="flex-1">
            <Outlet />
          </div>
          <BottomNav orgSlug={orgSlug} wsSlug={wsSlug} />
        </div>
      </ThemeProvider>
    </WorkspaceContextBridge>
  );
}

// Simple context bridge via React.createContext
import { createContext, useContext } from "react";
import type { WorkspaceContext } from "@/lib/workspaceContext";

const Ctx = createContext<WorkspaceContext | null>(null);
export function useWs() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWs must be used inside workspace shell");
  return v;
}
function WorkspaceContextBridge({ value, children }: { value: WorkspaceContext; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
