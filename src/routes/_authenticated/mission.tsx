import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { Loader2, Mail, MessageSquare } from "lucide-react";
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
import {
  buildGlobalActions,
  buildMorningBrief,
  type GlobalMissionAction,
} from "@/lib/mission-actions";
import { MorningBriefCard } from "@/components/platform/mission/MorningBriefCard";
import { generateMissionBriefing } from "@/lib/mission-briefing.functions";

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
  const [filter, setFilter] = useState<MissionFilter>("all");

  const data = query.data;
  const orgs = data?.orgs ?? [];
  const workspaces = data?.workspaces ?? [];
  const inbox = data?.inbox ?? [];
  const inboxSources = data?.inboxSources ?? { gmail: false, slack: false };
  const connectedCount = workspaces.reduce(
    (n, w) => n + w.modules.filter((m) => m.connection?.status === "connected").length,
    0,
  );

  const actions = useMemo(
    () => buildGlobalActions({ workspaces, inbox, max: 7 }),
    [workspaces, inbox],
  );

  const counts = useMemo(
    () => ({
      all: actions.length,
      gmail: actions.filter((a) => a.source === "gmail").length,
      slack: actions.filter((a) => a.source === "slack").length,
      workspace: actions.filter((a) => a.source === "workspace").length,
    }),
    [actions],
  );

  const filtered = applyMissionFilter(actions, filter);
  const brief = useMemo(() => buildMorningBrief(filtered), [filtered]);
  const gmailHasAny = inbox.some((i) => i.source === "gmail");
  const slackHasAny = inbox.some((i) => i.source === "slack");

  // AI briefing (opt-in). Server fn is called on demand; if it fails we fall
  // back to the deterministic Morning Brief. No prompts or briefings are
  // persisted server-side.
  const [aiEnabled, setAiEnabled] = useState(false);
  const runBriefing = useServerFn(generateMissionBriefing);
  const sanitized = useMemo(() => sanitizeActions(filtered), [filtered]);
  const aiQuery = useQuery({
    queryKey: ["mission-briefing", sanitized.map((s) => s.key).join("|")],
    queryFn: () => runBriefing({ data: { actions: sanitized } }),
    enabled: aiEnabled && sanitized.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const aiRecommended: GlobalMissionAction | null =
    aiEnabled && aiQuery.data?.recommendedKey
      ? filtered.find((a) => a.key === aiQuery.data!.recommendedKey) ?? null
      : null;

  const useAi = aiEnabled && !!aiQuery.data && !aiQuery.error;
  const recommended = useAi
    ? aiRecommended ?? brief.recommended
    : brief.recommended;

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
            <div className="mt-4 flex items-center justify-end gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={aiEnabled}
                  onChange={(e) => setAiEnabled(e.target.checked)}
                />
                Use AI brief
                {aiEnabled && aiQuery.isFetching ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : null}
              </label>
            </div>
            <MorningBriefCard
              brief={brief}
              mode={useAi ? "ai" : "rule"}
              aiSummary={useAi ? aiQuery.data?.briefing : null}
              aiReason={useAi ? aiQuery.data?.reason : null}
              recommended={recommended}
            />
            <MissionFilterChips value={filter} onChange={setFilter} counts={counts} />

            {filter === "gmail" && !gmailHasAny && (
              <EmptyInbox
                icon={<Mail className="h-5 w-5" />}
                title="No urgent Gmail items."
                hint={inboxSources.gmail ? "Inbox is clear right now." : "Gmail is not connected."}
              />
            )}
            {filter === "slack" && !slackHasAny && (
              <EmptyInbox
                icon={<MessageSquare className="h-5 w-5" />}
                title="No urgent Slack items."
                hint={inboxSources.slack ? "No unread mentions or DMs." : "Slack is not connected."}
              />
            )}

            {!(filter === "gmail" && !gmailHasAny) &&
              !(filter === "slack" && !slackHasAny) && (
                <GlobalActionList actions={filtered} />
              )}
          </>
        )}
      </main>
      <PlatformBottomNav />
    </div>
  );
}

function EmptyInbox({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="surface-card flex items-center gap-3 p-6 text-sm">
      <div className="grid h-9 w-9 flex-none place-items-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
    </div>
  );
}
