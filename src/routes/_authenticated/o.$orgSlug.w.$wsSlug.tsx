import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { createContext, useContext, useEffect } from "react";
import { setLastWorkspace } from "@/lib/last-workspace";
import { useWorkspaceContext } from "@/lib/workspaceContext";
import type { WorkspaceContext } from "@/lib/workspaceContext";
import { ThemeProvider } from "@/components/platform/ThemeProvider";
import { TopBar } from "@/components/platform/TopBar";
import { BottomNav } from "@/components/platform/BottomNav";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/o/$orgSlug/w/$wsSlug")({
  ssr: false,
  component: WorkspaceShell,
});

const Ctx = createContext<WorkspaceContext | null>(null);

export function useWs(): WorkspaceContext {
  const ctx = useContext(Ctx);
  const params = useParams({ from: "/_authenticated/o/$orgSlug/w/$wsSlug" });
  const query = useWorkspaceContext(params.orgSlug, params.wsSlug);
  if (ctx) return ctx;
  if (query.data) return query.data;
  // React Query dedupes — this triggers the same in-flight request the shell started.
  throw query.error ?? new Promise<void>(() => {});
}

function WorkspaceShell() {
  const { orgSlug, wsSlug } = Route.useParams();
  const { data, isLoading, error } = useWorkspaceContext(orgSlug, wsSlug);

  useEffect(() => {
    setLastWorkspace(orgSlug, wsSlug);
  }, [orgSlug, wsSlug]);

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
    <Ctx.Provider value={data}>
      <ThemeProvider theme={data.theme}>
        <div className="flex min-h-screen flex-col bg-background">
          <TopBar
            title={data.ws.name}
            subtitle={`${data.org.name} · arbeidsflate`}
            back={{ to: "/o/$orgSlug", params: { orgSlug } }}
          />
          <div className="flex-1">
            <Outlet />
          </div>
          <BottomNav orgSlug={orgSlug} wsSlug={wsSlug} />
        </div>
      </ThemeProvider>
    </Ctx.Provider>
  );
}

