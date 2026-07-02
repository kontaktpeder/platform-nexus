import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Blocks } from "lucide-react";
import { useWs } from "./o.$orgSlug.w.$wsSlug";
import { getWorkspaceWidgetData } from "@/lib/widget-data.functions";
import { buildNextActions } from "@/lib/mission-actions";
import { MissionHeader } from "@/components/platform/mission/MissionHeader";
import { WorkspaceContextBar } from "@/components/platform/mission/WorkspaceContextBar";
import { NextActions } from "@/components/platform/mission/NextActions";
import { MissionWidgetsGrid } from "@/components/platform/mission/MissionWidgetsGrid";

export const Route = createFileRoute("/_authenticated/o/$orgSlug/w/$wsSlug/")({
  head: () => ({ meta: [{ title: "Mission Control" }] }),
  component: MissionControl,
});

function MissionControl() {
  const { orgSlug, wsSlug } = Route.useParams();
  const { org, ws, modules, connections } = useWs();
  const activeModules = modules.filter((m) => m.enabled);
  const connectedCount = connections.filter((c) => c.status === "connected").length;

  const fetchWidgetData = useServerFn(getWorkspaceWidgetData);
  const widgetData = useQuery({
    queryKey: ["widget-data", org.id, ws.id],
    queryFn: () => fetchWidgetData({ data: { orgId: org.id, workspaceId: ws.id } }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const actions = buildNextActions({ widgetData: widgetData.data, modules });

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 pb-24">
      <MissionHeader orgName={org.name} wsName={ws.name} />
      <WorkspaceContextBar
        orgSlug={orgSlug}
        orgName={org.name}
        wsName={ws.name}
        connectedCount={connectedCount}
      />

      {activeModules.length === 0 ? (
        <div className="surface-card p-8 text-center">
          <Blocks className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h3 className="font-heading text-lg font-semibold">Ingen moduler aktivert</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Slå på det arbeidsflaten trenger for å se widgets her.
          </p>
          <Link to="/o/$orgSlug/w/$wsSlug/modules" params={{ orgSlug, wsSlug }}>
            <button className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Åpne modulvelger <ArrowRight className="h-4 w-4" />
            </button>
          </Link>
        </div>
      ) : (
        <>
          <NextActions actions={actions} />
          <MissionWidgetsGrid
            modules={modules}
            widgetData={widgetData.data}
            isLoading={widgetData.isLoading}
            error={widgetData.error}
          />
        </>
      )}
    </main>
  );
}
