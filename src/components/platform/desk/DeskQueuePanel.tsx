import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  Clock3,
  ExternalLink,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  createDeskManualSignal,
  getDeskQueue,
} from "@/lib/desk-queue.functions";
import type { DeskQueueItem, DeskQueueSource } from "@/lib/desk-queue.types";
import {
  actOnMorningItem,
  undoMorningItem,
} from "@/lib/morning-mission.functions";
import {
  formatElapsed,
  readWorkSession,
  stopWorkSession,
  type WorkSession,
} from "@/lib/work-session";
import { cn } from "@/lib/utils";

const VISIBLE = 3;

const SOURCE_TONE: Record<
  DeskQueueSource | "draft" | "appointment" | "follow_up" | "manual" | "work_session",
  string
> = {
  gmail: "bg-sky-500/15 text-sky-900 dark:text-sky-100",
  finance: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100",
  work: "bg-violet-500/15 text-violet-900 dark:text-violet-100",
  slack: "bg-amber-500/15 text-amber-950 dark:text-amber-100",
  field: "bg-orange-500/15 text-orange-950 dark:text-orange-100",
  manual: "bg-stone-500/15 text-stone-900 dark:text-stone-100",
  calendar: "bg-teal-500/15 text-teal-950 dark:text-teal-100",
  draft: "bg-rose-500/15 text-rose-900 dark:text-rose-100",
  appointment: "bg-teal-500/15 text-teal-950 dark:text-teal-100",
  follow_up: "bg-orange-500/15 text-orange-950 dark:text-orange-100",
  work_session: "bg-violet-500/15 text-violet-900 dark:text-violet-100",
};

function toneFor(item: DeskQueueItem): string {
  if (item.kind === "draft") return SOURCE_TONE.draft;
  if (item.kind === "appointment") return SOURCE_TONE.appointment;
  if (item.kind === "follow_up" || item.kind === "no_plan") return SOURCE_TONE.follow_up;
  if (item.kind === "manual") return SOURCE_TONE.manual;
  if (item.kind === "work_session") return SOURCE_TONE.work_session;
  return SOURCE_TONE[item.source];
}

function QueueCard({
  item,
  busy,
  onPrimary,
  onSnooze,
  onRemove,
  primaryLabel,
}: {
  item: DeskQueueItem;
  busy: boolean;
  onPrimary: () => void;
  onSnooze: () => void;
  onRemove: () => void;
  primaryLabel?: string;
}) {
  const isDraft = item.kind === "draft";
  const isWork = item.kind === "work_session";
  const tone = toneFor(item);
  const label = primaryLabel ?? (isDraft ? "Fortsett" : isWork ? "Stopp" : "Ferdig");

  return (
    <li
      className={cn(
        "rounded-2xl border bg-card/95 p-3.5 shadow-sm",
        isDraft
          ? "border-rose-300/50"
          : item.kind === "appointment"
            ? "border-teal-300/50"
            : isWork
              ? "border-violet-300/50"
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
        {item.href && !isDraft && !isWork && (
          <a
            href={item.href}
            target={item.href.startsWith("http") ? "_blank" : undefined}
            rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
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
          ) : isWork ? (
            <Square className="h-3.5 w-3.5" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          {label}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 gap-1 rounded-xl text-xs"
          disabled={busy || isWork}
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

function workSessionItem(session: WorkSession, nowMs: number): DeskQueueItem {
  return {
    id: `work:session:${session.startedAt}`,
    kind: "work_session",
    title: `Økt pågår · ${formatElapsed(session.startedAt, nowMs)}`,
    subtitle: `${session.projectName} · ${session.organizationName}`,
    source: "work",
    sourceLabel: "Work",
    href: "/hjem/okt",
    sourceIds: [`work:session:${session.startedAt}`],
    occurredAt: session.startedAt,
  };
}

export function DeskQueuePanel({ className }: { className?: string }) {
  const qc = useQueryClient();
  const fetchQueue = useServerFn(getDeskQueue);
  const createManual = useServerFn(createDeskManualSignal);
  const runAct = useServerFn(actOnMorningItem);
  const runUndo = useServerFn(undoMorningItem);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [manualText, setManualText] = useState("");
  const [adding, setAdding] = useState(false);
  const [showIntake, setShowIntake] = useState(false);
  const [session, setSession] = useState<WorkSession | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const sync = () => setSession(readWorkSession());
    sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "nexus:work-session") sync();
    };
    window.addEventListener("storage", onStorage);
    const tick = window.setInterval(() => {
      sync();
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(tick);
    };
  }, []);

  const query = useQuery({
    queryKey: ["desk-queue"],
    queryFn: () => fetchQueue(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const visible = useMemo(() => {
    const serverItems = (query.data?.items ?? []).filter((i) => !hiddenIds.has(i.id));
    const local: DeskQueueItem[] = [];
    if (session && !hiddenIds.has(`work:session:${session.startedAt}`)) {
      local.push(workSessionItem(session, nowMs));
    }
    return [...local, ...serverItems].slice(0, VISIBLE);
  }, [query.data?.items, hiddenIds, session, nowMs]);

  const remaining =
    Math.max(0, (query.data?.totalOpen ?? 0) + (session ? 1 : 0) - hiddenIds.size) -
    visible.length;

  async function act(
    item: DeskQueueItem,
    action: "done" | "snoozed" | "ignored",
    gmailSideEffect?: "mark_read" | "trash",
  ) {
    if (item.kind === "work_session") {
      if (action === "ignored") {
        setHiddenIds((prev) => new Set(prev).add(item.id));
        return;
      }
      if (action === "done") {
        stopWorkSession(0);
        setSession(null);
        setHiddenIds((prev) => new Set(prev).add(item.id));
        toast("Økt stoppet");
        return;
      }
      return;
    }

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
            : item.kind === "mail"
              ? "Ferdig — markert lest"
              : "Ferdig"
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
      return;
    }
    if (item.kind === "work_session") {
      void act(item, "done");
      return;
    }
    if (item.href && (item.kind === "follow_up" || item.kind === "no_plan")) {
      window.location.href = item.href;
    }
    void act(item, "done", item.kind === "mail" ? "mark_read" : undefined);
  }

  async function submitManual() {
    const text = manualText.trim();
    if (!text) return;
    setAdding(true);
    try {
      await createManual({ data: { text, channel: "manual" } });
      setManualText("");
      setShowIntake(false);
      toast("Signal lagt i køen");
      void qc.invalidateQueries({ queryKey: ["desk-queue"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke lagre");
    } finally {
      setAdding(false);
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
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-9 w-9 rounded-xl"
            onClick={() => setShowIntake((v) => !v)}
            aria-label="Legg til manuelt signal"
          >
            <Plus className="h-4 w-4" />
          </Button>
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
        </div>
      </header>

      {showIntake && (
        <div className="shrink-0 border-b border-border/50 px-3 py-3">
          <Textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="Hva hørte du? (WhatsApp, muntlig, …)"
            className="min-h-[72px] rounded-xl text-sm"
            maxLength={4000}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-xl"
              onClick={() => setShowIntake(false)}
            >
              Avbryt
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-xl"
              disabled={adding || !manualText.trim()}
              onClick={() => void submitManual()}
            >
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Legg i kø"}
            </Button>
          </div>
        </div>
      )}

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
              Mail, kalender, oppfølginger — eller legg inn manuelt.
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
            : `${query.data.totalOpen + (session ? 1 : 0)} åpne signaler totalt`
          : "—"}
      </footer>
    </aside>
  );
}
