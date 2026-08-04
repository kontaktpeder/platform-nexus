import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  Clock3,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getDeskQueue } from "@/lib/desk-queue.functions";
import type { DeskQueueItem, DeskQueueSource } from "@/lib/desk-queue.types";
import {
  actOnMorningItem,
  undoMorningItem,
} from "@/lib/morning-mission.functions";
import { cn } from "@/lib/utils";

const VISIBLE = 3;

const SOURCE_TONE: Record<DeskQueueSource | "draft" | "appointment", string> = {
  gmail: "bg-sky-500/15 text-sky-900 dark:text-sky-100",
  finance: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100",
  work: "bg-violet-500/15 text-violet-900 dark:text-violet-100",
  slack: "bg-amber-500/15 text-amber-950 dark:text-amber-100",
  draft: "bg-rose-500/15 text-rose-900 dark:text-rose-100",
  appointment: "bg-teal-500/15 text-teal-950 dark:text-teal-100",
};

function QueueCard({
  item,
  busy,
  onPrimary,
  onSnooze,
  onRemove,
}: {
  item: DeskQueueItem;
  busy: boolean;
  onPrimary: () => void;
  onSnooze: () => void;
  onRemove: () => void;
}) {
  const isDraft = item.kind === "draft";
  const isAppointment = item.kind === "appointment";
  const tone = isDraft
    ? SOURCE_TONE.draft
    : isAppointment
      ? SOURCE_TONE.appointment
      : SOURCE_TONE[item.source];

  return (
    <li
      className={cn(
        "rounded-2xl border bg-card/95 p-3.5 shadow-sm",
        isDraft
          ? "border-rose-300/50"
          : isAppointment
            ? "border-teal-300/50"
            : "border-border/70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            tone,
          )}
        >
          {item.sourceLabel}
        </span>
        {item.href && !isDraft && (
          <a
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            Åpne
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <p className="mt-2 text-sm font-semibold leading-snug tracking-tight">{item.title}</p>
      {item.subtitle && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.subtitle}</p>
      )}
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <Button
          type="button"
          size="sm"
          className="h-9 gap-1 rounded-xl text-xs"
          disabled={busy}
          onClick={onPrimary}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isDraft ? (
            <Play className="h-3.5 w-3.5" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          {isDraft ? "Fortsett" : "Ferdig"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 gap-1 rounded-xl text-xs"
          disabled={busy}
          onClick={onSnooze}
        >
          <Clock3 className="h-3.5 w-3.5" />
          Utsett
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-9 gap-1 rounded-xl text-xs text-muted-foreground"
          disabled={busy}
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {isDraft ? "Slett" : "Fjern"}
        </Button>
      </div>
    </li>
  );
}

export function DeskQueuePanel({ className }: { className?: string }) {
  const qc = useQueryClient();
  const fetchQueue = useServerFn(getDeskQueue);
  const runAct = useServerFn(actOnMorningItem);
  const runUndo = useServerFn(undoMorningItem);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["desk-queue"],
    queryFn: () => fetchQueue(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const visible = useMemo(() => {
    const items = (query.data?.items ?? []).filter((i) => !hiddenIds.has(i.id));
    return items.slice(0, VISIBLE);
  }, [query.data?.items, hiddenIds]);

  const remaining =
    Math.max(0, (query.data?.totalOpen ?? 0) - hiddenIds.size) - visible.length;

  async function act(
    item: DeskQueueItem,
    action: "done" | "snoozed" | "ignored",
    gmailSideEffect?: "mark_read" | "trash",
  ) {
    setHiddenIds((prev) => new Set(prev).add(item.id));
    setBusyId(item.id);
    try {
      await runAct({
        data: {
          itemId: item.id,
          action,
          snoozePreset: action === "snoozed" ? "tomorrow" : undefined,
          sourceIds: item.sourceIds,
          gmailSideEffect,
        },
      });
      const label =
        action === "done"
          ? item.kind === "draft"
            ? "Åpnet utkast"
            : "Ferdig — markert lest"
          : action === "snoozed"
            ? "Utsatt til i morgen"
            : item.kind === "draft"
              ? "Utkast slettet"
              : "Fjernet";
      toast(label, {
        duration: 6000,
        action:
          action === "ignored" && item.kind === "draft"
            ? undefined
            : {
                label: "Angre",
                onClick: async () => {
                  try {
                    await runUndo({ data: { itemId: item.id } });
                    setHiddenIds((prev) => {
                      const next = new Set(prev);
                      next.delete(item.id);
                      return next;
                    });
                    void qc.invalidateQueries({ queryKey: ["desk-queue"] });
                    toast("Gjenopprettet");
                  } catch {
                    toast.error("Kunne ikke angre");
                  }
                },
              },
      });
      void qc.invalidateQueries({ queryKey: ["desk-queue"] });
      void qc.invalidateQueries({ queryKey: ["morning-mission"] });
    } catch (e) {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      toast.error(e instanceof Error ? e.message : "Handlingen feilet");
    } finally {
      setBusyId(null);
    }
  }

  function onPrimary(item: DeskQueueItem) {
    if (item.kind === "draft") {
      if (item.href) {
        window.open(item.href, "_blank", "noopener,noreferrer");
      }
      // Stay in queue until sent/deleted — just open. Soft-snooze locally? Keep visible.
      // User asked continue — open draft; don't dismiss from queue.
      return;
    }
    void act(item, "done", item.kind === "mail" ? "mark_read" : undefined);
  }

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full flex-col border-border/60 bg-background/40",
        className,
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border/50 px-4 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            I dag
          </p>
          <h2 className="mt-1 font-heading text-lg font-semibold tracking-tight">Kø</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Opptil {VISIBLE} synlige — signaler, ikke AI-anbefalinger
          </p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 rounded-xl"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
          aria-label="Oppdater kø"
        >
          <RefreshCw className={cn("h-4 w-4", query.isFetching && "animate-spin")} />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {query.isLoading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : query.isError ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {query.error instanceof Error ? query.error.message : "Kunne ikke hente kø"}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/80 bg-card/50 px-4 py-10 text-center">
            <p className="text-sm font-medium">Køen er tom</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Nye signaler dukker opp når mail, Slack eller Finance har noe.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {visible.map((item) => (
              <QueueCard
                key={item.id}
                item={item}
                busy={busyId === item.id}
                onPrimary={() => onPrimary(item)}
                onSnooze={() => void act(item, "snoozed")}
                onRemove={() =>
                  void act(
                    item,
                    "ignored",
                    item.kind === "draft" ? "trash" : undefined,
                  )
                }
              />
            ))}
          </ul>
        )}
      </div>

      <footer className="shrink-0 border-t border-border/50 px-4 py-3 text-xs text-muted-foreground">
        {query.data
          ? remaining > 0
            ? `${remaining} til i køen når du tar unna`
            : `${query.data.totalOpen} åpne signaler totalt`
          : "—"}
      </footer>
    </aside>
  );
}
