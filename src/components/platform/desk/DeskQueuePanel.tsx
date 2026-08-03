import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  Clock3,
  ExternalLink,
  Loader2,
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

const SOURCE_TONE: Record<DeskQueueSource, string> = {
  gmail: "bg-sky-500/15 text-sky-900 dark:text-sky-100",
  finance: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100",
  work: "bg-violet-500/15 text-violet-900 dark:text-violet-100",
  slack: "bg-amber-500/15 text-amber-950 dark:text-amber-100",
};

function QueueCard({
  item,
  busy,
  onDone,
  onSnooze,
  onRemove,
}: {
  item: DeskQueueItem;
  busy: boolean;
  onDone: () => void;
  onSnooze: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="rounded-2xl border border-border/70 bg-card/95 p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            SOURCE_TONE[item.source],
          )}
        >
          {item.sourceLabel}
        </span>
        {item.href && (
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
          onClick={onDone}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Ferdig
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
          Fjern
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
        },
      });
      const label =
        action === "done" ? "Ferdig" : action === "snoozed" ? "Utsatt til i morgen" : "Fjernet";
      toast(label, {
        duration: 6000,
        action: {
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
                onDone={() => void act(item, "done")}
                onSnooze={() => void act(item, "snoozed")}
                onRemove={() => void act(item, "ignored")}
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
