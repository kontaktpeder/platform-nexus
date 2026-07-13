import { createFileRoute, Link } from "@tanstack/react-router";
import { getReviewCount } from "@/lib/review.functions";
import { Sparkles } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { TopBar } from "@/components/platform/TopBar";
import { PlatformBottomNav } from "@/components/platform/PlatformBottomNav";
import { GlobalMissionHeader } from "@/components/platform/mission/GlobalMissionHeader";
import { MorningMissionView } from "@/components/platform/mission/MorningMissionView";
import {
  getMorningMission,
  actOnMorningItem,
  undoMorningItem,
} from "@/lib/morning-mission.functions";
import type { MorningBriefItemAction } from "@/lib/morning-mission.types";
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
  const queryClient = useQueryClient();

  const fetchMorning = useServerFn(getMorningMission);
  const query = useQuery({
    queryKey: ["morning-mission"],
    queryFn: () => fetchMorning({ data: {} }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const runAct = useServerFn(actOnMorningItem);
  const runUndo = useServerFn(undoMorningItem);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const data = query.data;
  const payload = data?.payload;
  const todayCount = (payload?.today ?? []).filter((i) => !hiddenIds.has(i.id)).length;
  const weekCount = (payload?.this_week ?? []).filter((i) => !hiddenIds.has(i.id)).length;
  const waitingCount = (payload?.waiting ?? []).filter((i) => !hiddenIds.has(i.id)).length;
  const activeCount = todayCount + weekCount + waitingCount;

  const displayData = data
    ? {
        ...data,
        payload: {
          ...data.payload,
          today: data.payload.today.filter((i) => !hiddenIds.has(i.id)),
          this_week: data.payload.this_week.filter((i) => !hiddenIds.has(i.id)),
          waiting: data.payload.waiting.filter((i) => !hiddenIds.has(i.id)),
        },
      }
    : undefined;

  async function onRefresh() {
    setRefreshing(true);
    try {
      await fetchMorning({ data: { force: true } });
      await queryClient.invalidateQueries({ queryKey: ["morning-mission"] });
      toast("Brief oppdatert");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke oppdatere");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleAction(itemId: string, action: MorningBriefItemAction) {
    setHiddenIds((prev) => new Set(prev).add(itemId));
    setBusyItemId(itemId);
    try {
      await runAct({ data: { itemId, action } });
      const label =
        action === "done"
          ? "Ferdig"
          : action === "waiting"
            ? "Markert som venter"
            : action === "ignored"
              ? "Ignorert"
              : "Utsatt";
      toast(label, {
        duration: 7000,
        action: {
          label: "Angre",
          onClick: async () => {
            try {
              await runUndo({ data: { itemId } });
              setHiddenIds((prev) => {
                const next = new Set(prev);
                next.delete(itemId);
                return next;
              });
              void queryClient.invalidateQueries({ queryKey: ["morning-mission"] });
              toast("Gjenopprettet");
            } catch {
              toast.error("Kunne ikke angre");
            }
          },
        },
      });
      void queryClient.invalidateQueries({ queryKey: ["morning-mission"] });
    } catch (err) {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      toast.error(err instanceof Error ? err.message : "Handlingen feilet");
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar title="Mission" />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-4 pb-28 sm:px-8 sm:py-8">
        <GlobalMissionHeader
          firstName={firstName}
          count={activeCount}
          canStart={todayCount > 0}
          onStart={() => {
            document.getElementById("morning-today")?.scrollIntoView({ behavior: "smooth" });
          }}
        />

        <ReviewInboxTeaser />

        {query.error && (
          <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Kunne ikke laste morgenbrief.{" "}
            {query.error instanceof Error ? query.error.message : "Ukjent feil"}
          </div>
        )}

        <div id="morning-today">
          <MorningMissionView
            data={displayData}
            loading={query.isLoading}
            refreshing={refreshing}
            busyItemId={busyItemId}
            onRefresh={onRefresh}
            onAction={handleAction}
          />
        </div>
      </main>
      <PlatformBottomNav />
    </div>
  );
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
