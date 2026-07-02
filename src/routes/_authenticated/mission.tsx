import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { TopBar } from "@/components/platform/TopBar";
import { PlatformBottomNav } from "@/components/platform/PlatformBottomNav";
import { GlobalMissionHeader } from "@/components/platform/mission/GlobalMissionHeader";
import { FeaturedActionCard } from "@/components/platform/mission/FeaturedActionCard";
import { QueueList } from "@/components/platform/mission/QueueList";
import {
  getGlobalMissionData,
  type GlobalMissionData,
} from "@/lib/global-mission.functions";
import {
  buildGlobalActions,
  buildCommitmentActions,
  buildMorningBrief,
  type GlobalMissionAction,
} from "@/lib/mission-actions";
import { generateMissionBriefing } from "@/lib/mission-briefing.functions";
import {
  executeMissionAction,
  undoMissionAction,
} from "@/lib/mission-actions.functions";
import { filterVisibleActions } from "@/lib/mission-action-state";
import type { MissionActionType } from "@/components/platform/mission/MissionActionBar";
import type { SnoozePreset } from "@/lib/mission-snooze";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/mission")({
  head: () => ({ meta: [{ title: "Mission Control — Platform Core" }] }),
  component: GlobalMission,
});

function firstNameFrom(user: ReturnType<typeof useAuth>["user"]): string | null {
  if (!user) return null;
  const md = (user.user_metadata ?? {}) as Record<string, unknown>;
  const cand =
    (md.first_name as string) ||
    (md.given_name as string) ||
    (md.name as string) ||
    (md.full_name as string) ||
    "";
  const trimmed = cand.trim();
  if (trimmed) return trimmed.split(/\s+/)[0];
  if (user.email) {
    const local = user.email.split("@")[0];
    const parts = local.split(/[._-]/).filter(Boolean);
    const p = (parts[0] ?? local).toLowerCase();
    return p.charAt(0).toUpperCase() + p.slice(1);
  }
  return null;
}

function GlobalMission() {
  const { user } = useAuth();
  const firstName = firstNameFrom(user);

  const fetchGlobal = useServerFn(getGlobalMissionData);
  const query = useQuery({
    queryKey: ["global-mission"],
    queryFn: () => fetchGlobal() as Promise<GlobalMissionData>,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const data = query.data;
  const workspaces = data?.workspaces ?? [];
  const inbox = data?.inbox ?? [];
  const actionStates = data?.actionStates ?? [];

  const entityLinks = data?.entityLinks ?? {};

  const openCommitments = data?.openCommitments ?? [];

  const rawActions = useMemo(() => {
    // Build entity map keyed by entity_id for commitment enrichment.
    const entityMap: Record<
      string,
      { name: string; slug: string; linkSource?: "manual" | "auto" }
    > = {};
    for (const link of Object.values(entityLinks)) {
      if (link?.entityId) {
        entityMap[link.entityId] = {
          name: link.entityName,
          slug: link.entitySlug,
          linkSource: link.linkSource ?? "manual",
        };
      }
    }
    return [
      ...buildGlobalActions({ workspaces, inbox, max: 20 }),
      ...buildCommitmentActions(openCommitments, entityMap),
    ];
  }, [workspaces, inbox, openCommitments, entityLinks]);

  // Optimistic: hide keys the user just acted on until refetch confirms.
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  const visible = useMemo(
    () =>
      filterVisibleActions(rawActions, actionStates)
        .filter((a) => !hiddenKeys.has(a.key))
        .slice(0, 7)
        .map((a) => {
          // Knowledge v1: direct hit first, else workspace fallback by orgSlug.
          const link =
            entityLinks[a.key] ??
            (a.source === "workspace" && a.orgSlug
              ? entityLinks[`ws:${a.orgSlug}`]
              : undefined);
          return link
            ? {
                ...a,
                entityId: link.entityId,
                entityName: link.entityName,
                entitySlug: link.entitySlug,
                entityLinkSource: link.linkSource ?? "manual",
              }
            : a;
        }),
    [rawActions, actionStates, hiddenKeys, entityLinks],
  );

  // Deterministic brief always available. AI runs silently in the background
  // and, if it returns a valid recommended key, replaces the featured action.
  const brief = useMemo(() => buildMorningBrief(visible), [visible]);
  const sanitized = useMemo(() => sanitizeActions(visible), [visible]);
  const runBriefing = useServerFn(generateMissionBriefing);
  const aiQuery = useQuery({
    queryKey: ["mission-briefing", sanitized.map((s) => s.key).join("|")],
    queryFn: () => runBriefing({ data: { actions: sanitized } }),
    enabled: sanitized.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const aiRecommended = aiQuery.data?.recommendedKey
    ? visible.find((a) => a.key === aiQuery.data!.recommendedKey) ?? null
    : null;
  const featured: GlobalMissionAction | null = aiRecommended ?? brief.recommended;
  const queue = useMemo(
    () => visible.filter((a) => a.key !== featured?.key),
    [visible, featured],
  );

  // Triage mutations
  const queryClient = useQueryClient();
  const runExecute = useServerFn(executeMissionAction);
  const runUndo = useServerFn(undoMissionAction);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const handleAction = async (
    action: GlobalMissionAction,
    type: MissionActionType,
    snoozePreset?: SnoozePreset,
  ) => {
    if (type === "open_only") return;
    // Optimistically hide the card immediately.
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      next.add(action.key);
      return next;
    });
    setBusyKey(action.key);
    try {
      await runExecute({
        data: { actionKey: action.key, action: type, snoozePreset },
      });
      // Refetch in background — do NOT await before UI update.
      void queryClient.invalidateQueries({ queryKey: ["global-mission"] });
      const label =
        type === "mark_read"
          ? "Merket som lest"
          : type === "archive"
            ? "Arkivert"
            : type === "handled_locally"
              ? "Ferdig"
              : type === "snooze"
                ? "Utsatt"
                : "Skjult";
      toast(label, {
        duration: 7000,
        action: {
          label: "Angre",
          onClick: async () => {
            try {
              await runUndo({ data: { actionKey: action.key } });
              setHiddenKeys((prev) => {
                const next = new Set(prev);
                next.delete(action.key);
                return next;
              });
              void queryClient.invalidateQueries({ queryKey: ["global-mission"] });
              toast("Gjenopprettet");
            } catch {
              toast.error("Kunne ikke angre");
            }
          },
        },
      });
    } catch (err) {
      // Roll back optimistic hide on error.
      setHiddenKeys((prev) => {
        const next = new Set(prev);
        next.delete(action.key);
        return next;
      });
      const msg = err instanceof Error ? err.message : "Handlingen feilet";
      toast.error(msg);
    } finally {
      setBusyKey((k) => (k === action.key ? null : k));
    }
  };

  function onStart() {
    if (!featured) return;
    const el = document.getElementById("featured-action");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }


  const loading = query.isLoading;
  const hasError = !!query.error;
  const empty = !loading && !hasError && visible.length === 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar title="Mission" />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-4 pb-28 sm:px-8 sm:py-8">
        <GlobalMissionHeader
          firstName={firstName}
          count={visible.length}
          canStart={!!featured}
          onStart={onStart}
        />

        {loading && (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {hasError && (
          <div className="rounded-2xl border border-border/60 bg-card p-6 text-sm text-muted-foreground">
            Kunne ikke laste mission-data.
          </div>
        )}

        {empty && <EmptyState />}

        {!loading && !hasError && featured && (
          <div id="featured-action">
            <FeaturedActionCard
              action={featured}
              busy={busyKey === featured.key}
              onAction={handleAction}
            />
          </div>
        )}


        {!loading && !hasError && queue.length > 0 && (
          <QueueList actions={queue} busyKey={busyKey} onAction={handleAction} />
        )}

        {!loading && !hasError && visible.length > 0 && (
          <p className="mt-10 text-center text-xs text-muted-foreground">
            Du er oppdatert. Nye ting dukker opp her.
          </p>
        )}
      </main>
      <PlatformBottomNav />
    </div>
  );
}

function EmptyState() {
  return (
    <section className="mt-6 rounded-2xl border border-border/60 bg-card p-10 text-center">
      <div className="mx-auto max-w-sm">
        <h2 className="font-heading text-lg font-semibold">Ingenting krever deg nå.</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Jeg holder øye med Gmail, Slack og arbeidsflatene dine.
          Nye ting dukker opp her.
        </p>
      </div>
    </section>
  );
}

function sanitizeActions(actions: GlobalMissionAction[]) {
  return actions.slice(0, 15).map((a) => ({
    key: a.key,
    title: a.title.slice(0, 200),
    source: a.source,
    tier: a.tier,
    workspaceLabel:
      a.source === "workspace" && a.wsName
        ? [a.orgName, a.wsName].filter(Boolean).join(" · ").slice(0, 120)
        : null,
    snippet: (a.snippet ?? a.description ?? "").slice(0, 240) || null,
    hasDeepLink: !!a.href,
  }));
}

