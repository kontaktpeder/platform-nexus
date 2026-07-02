import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { TopBar } from "@/components/platform/TopBar";
import { PlatformBottomNav } from "@/components/platform/PlatformBottomNav";
import { GlobalMissionHeader } from "@/components/platform/mission/GlobalMissionHeader";
import { GlobalContextBar } from "@/components/platform/mission/GlobalContextBar";
import {
  MissionFilterChips,
  applyMissionFilter,
  type MissionFilter,
} from "@/components/platform/mission/MissionFilterChips";
import { GlobalActionList } from "@/components/platform/mission/GlobalActionList";
import {
  getGlobalMissionData,
  type GlobalMissionData,
} from "@/lib/global-mission.functions";
import { buildGlobalActions } from "@/lib/mission-actions";

export const Route = createFileRoute("/_authenticated/mission")({
  head: () => ({ meta: [{ title: "Mission Control — Platform Core" }] }),
  component: GlobalMission,
});

function GlobalMission() {
  const fetchGlobal = useServerFn(getGlobalMissionData);
  const query = useQuery({
    queryKey: ["global-mission"],
    queryFn: () => fetchGlobal() as Promise<GlobalMissionData>,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const [filter, setFilter] = useState<MissionFilter>({ kind: "all" });

  const data = query.data;
  const orgs = data?.orgs ?? [];
  const workspaces = data?.workspaces ?? [];
  const connectedCount = workspaces.reduce(
    (n, w) => n + w.modules.filter((m) => m.connection?.status === "connected").length,
    0,
  );

  const actions = buildGlobalActions(workspaces, 7);
  const filtered = applyMissionFilter(actions, filter);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar title="Mission Control" subtitle="All your workspaces" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-24">
        <GlobalMissionHeader workspaceCount={workspaces.length} />
        <GlobalContextBar
          orgCount={orgs.length}
          workspaceCount={workspaces.length}
          connectedCount={connectedCount}
        />

        {query.isLoading ? (
          <div className="grid place-items-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : query.error ? (
          <div className="surface-card p-6 text-sm text-muted-foreground">
            Could not load mission data.
          </div>
        ) : (
          <>
            <MissionFilterChips orgs={orgs} value={filter} onChange={setFilter} />
            <GlobalActionList actions={filtered} />
          </>
        )}
      </main>
      <PlatformBottomNav />
    </div>
  );
}
