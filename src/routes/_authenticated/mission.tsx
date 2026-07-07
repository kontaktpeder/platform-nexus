import { createFileRoute, Link } from "@tanstack/react-router";
import { getReviewCount } from "@/lib/review.functions";
import { Sparkles } from "lucide-react";
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
import {
  getLatestGlobalSummary,
  getContextForEntity,
  runContextScan,
} from "@/lib/context-scan.functions";
import type { ContextSummary } from "@/lib/context/context.types";
import { ContextPanel } from "@/components/platform/mission/ContextPanel";
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

  // Aggregate module-alert fetch errors across all workspaces so the user
  // sees when a module (e.g. Finance) failed to report its status instead of
  // silently missing from the queue.
  const moduleFetchErrors = useMemo(() => {
    const out: Array<{
      moduleSlug: string;
      orgName: string;
      wsName: string;
      error: string;
    }> = [];
    for (const ws of workspaces) {
      const errs = ws.moduleAlertErrors ?? {};
      for (const [slug, err] of Object.entries(errs)) {
        if (!err) continue;
        out.push({
          moduleSlug: slug,
          orgName: ws.orgName,
          wsName: ws.wsName,
          error: String(err),
        });
      }
    }
    return out;
  }, [workspaces]);


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

  // ── Context Scan v0: latest global + latest entity summary (read-only). ──
  const fetchGlobalCtx = useServerFn(getLatestGlobalSummary);
  const fetchEntityCtx = useServerFn(getContextForEntity);
  const runScan = useServerFn(runContextScan);
  const globalCtxQ = useQuery({
    queryKey: ["context", "global"],
    queryFn: () => fetchGlobalCtx() as Promise<ContextSummary | null>,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Pre-derive the tentative featured entityId for context prefetch.
  const briefEntityId = brief.recommended?.entityId ?? null;
  const entityCtxQ = useQuery({
    queryKey: ["context", "entity", briefEntityId],
    queryFn: () =>
      fetchEntityCtx({ data: { entityId: briefEntityId! } }) as Promise<ContextSummary | null>,
    enabled: !!briefEntityId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const briefingContext = useMemo(() => {
    const g = globalCtxQ.data;
    const e = entityCtxQ.data;
    if (!g && !e) return undefined;
    return {
      globalSummary: g?.summary ?? null,
      entitySummary: e?.summary ?? null,
      keyFacts: [...(e?.key_facts ?? []), ...(g?.key_facts ?? [])].slice(0, 8),
    };
  }, [globalCtxQ.data, entityCtxQ.data]);

  const runBriefing = useServerFn(generateMissionBriefing);
  const aiQuery = useQuery({
    queryKey: [
      "mission-briefing",
      sanitized.map((s) => s.key).join("|"),
      briefingContext?.globalSummary ?? "",
      briefingContext?.entitySummary ?? "",
    ],
    queryFn: () =>
      runBriefing({ data: { actions: sanitized, context: briefingContext } }),
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

  // If featured (post-AI) differs from brief.recommended, refetch its entity context.
  const featuredEntityId = featured?.entityId ?? null;
  const featuredEntityCtxQ = useQuery({
    queryKey: ["context", "entity", featuredEntityId],
    queryFn: () =>
      fetchEntityCtx({ data: { entityId: featuredEntityId! } }) as Promise<ContextSummary | null>,
    enabled: !!featuredEntityId && featuredEntityId !== briefEntityId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const activeEntityCtx =
    featuredEntityId && featuredEntityId !== briefEntityId
      ? featuredEntityCtxQ.data ?? null
      : entityCtxQ.data ?? null;


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

  const [scanning, setScanning] = useState(false);
  async function onRefreshContext() {
    setScanning(true);
    try {
      await runScan();
      toast("Kontekst oppdatert");
      void queryClient.invalidateQueries({ queryKey: ["context"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke oppdatere kontekst");
    } finally {
      setScanning(false);
    }
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

        {(globalCtxQ.data || activeEntityCtx) && (
          <ContextPanel
            global={globalCtxQ.data ?? null}
            entity={activeEntityCtx}
            onRefresh={onRefreshContext}
            refreshing={scanning}
          />
        )}

        <ReviewInboxTeaser />

        {moduleFetchErrors.length > 0 && (
          <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800">
            <p className="font-medium">
              Kunne ikke hente {moduleFetchErrors.length === 1 ? "status" : "status for noen moduler"}
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-amber-800/80">
              {moduleFetchErrors.map((e, i) => {
                const modLabel =
                  e.moduleSlug.charAt(0).toUpperCase() + e.moduleSlug.slice(1);
                return (
                  <li key={`${e.moduleSlug}-${e.orgName}-${e.wsName}-${i}`}>
                    Kunne ikke hente {modLabel}-status
                    {(e.orgName || e.wsName) && (
                      <span className="opacity-70">
                        {" "}· {[e.orgName, e.wsName].filter(Boolean).join(" / ")}
                      </span>
                    )}
                    <span className="ml-1 opacity-60">— {e.error}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}






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


function ReviewInboxTeaser() {
  const fetchCount = useServerFn(getReviewCount);
  const q = useQuery({
    queryKey: ["review-count"],
    queryFn: () => fetchCount() as Promise<{ total: number }>,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const total = q.data?.total ?? 0;
  if (total === 0) return null;
  return (
    <Link
      to="/review"
      className="mt-3 flex items-center justify-between rounded-2xl border border-border/60 bg-card p-4 text-sm shadow-sm transition hover:border-border"
    >
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-amber-500/10 text-amber-700">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <p className="font-medium">AI trenger gjennomgang</p>
          <p className="text-xs text-muted-foreground">{total} forslag venter i /review</p>
        </div>
      </div>
      <span className="text-xs text-muted-foreground">Åpne →</span>
    </Link>
  );
}
