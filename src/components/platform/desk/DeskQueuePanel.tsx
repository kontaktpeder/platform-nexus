import {
  Archive,
  Check,
  Clock3,
  ExternalLink,
  Loader2,
  Mail,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  Unlink,
  UserPlus,
  CalendarPlus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { GmailReplyDrawer } from "@/components/platform/mission/GmailReplyDrawer";
import { InvoiceComposeSheet } from "@/components/platform/mission/InvoiceComposeSheet";
import { PlanFollowUpPanel } from "@/components/platform/relation/PlanFollowUpPanel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  DESK_QUEUE_STALE_MS,
  readDeskQueueCache,
  writeDeskQueueCache,
} from "@/lib/desk-queue-cache";
import {
  createDeskManualSignal,
  getDeskQueue,
} from "@/lib/desk-queue.functions";
import type { DeskQueueItem, DeskQueueSource } from "@/lib/desk-queue.types";
import { scheduleEntityFollowUp } from "@/lib/field.functions";
import type { FollowUpPreset } from "@/lib/field/field.types";
import { createContactFromSuggestion } from "@/lib/inbox-assistant.functions";
import {
  isFinanceInvoiceDeskItem,
  parseInvoiceFromDeskItem,
} from "@/lib/mission-invoice-action";
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
import { useWeeklyPlan } from "@/hooks/useWeeklyPlan";
import { osloWeekKey } from "@/lib/oslo-week";
import { isWeeklyPlanQueueId, openWeekPlanSheet } from "@/lib/os/week-plan-ui";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

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

function initials(name: string | null | undefined, email: string | null | undefined): string {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function gmailMessageIdOf(item: DeskQueueItem): string | null {
  if (item.gmailMessageId) return item.gmailMessageId;
  if (item.id.startsWith("gmail:")) return item.id.slice("gmail:".length) || null;
  return null;
}

function isGmailMail(item: DeskQueueItem): boolean {
  return item.source === "gmail" && item.kind === "mail" && !!gmailMessageIdOf(item);
}

type GmailSideEffect = "mark_read" | "archive" | "trash";

function QueueCard({
  item,
  busy,
  compact = false,
  onPrimary,
  onSnooze,
  onRemove,
  onOpenContact,
  onFollowUp,
  onReply,
  onArchive,
  onTrash,
  onCreateContact,
  onOpenModule,
  onOpenCta,
  onUnsubscribe,
  primaryLabel,
}: {
  item: DeskQueueItem;
  busy: boolean;
  /** Fixed-height dashboard row: primary + ⋯ menu for the rest. */
  compact?: boolean;
  onPrimary: () => void;
  onSnooze: () => void;
  onRemove: () => void;
  onOpenContact?: () => void;
  onFollowUp?: () => void;
  onReply?: () => void;
  onArchive?: () => void;
  onTrash?: () => void;
  onCreateContact?: () => void;
  onOpenModule?: () => void;
  onOpenCta?: () => void;
  onUnsubscribe?: () => void;
  primaryLabel?: string;
}) {
  const isDraft = item.kind === "draft";
  const isWork = item.kind === "work_session";
  const gmailMail = isGmailMail(item);
  const financeInv = isFinanceInvoiceDeskItem(item);
  const richCard = gmailMail || financeInv;
  const tone = toneFor(item);
  const label = primaryLabel ?? (isDraft ? "Fortsett" : isWork ? "Stopp" : "Ferdig");
  const displayName = item.fromName || item.fromEmail || null;
  const hasUnsub = !!(
    item.unsubscribeUrl ||
    item.unsubscribeOneClickUrl ||
    item.unsubscribeMailto
  );
  const ctaPurring = item.ctaKind === "purring";
  const ctaOpenLink = item.ctaKind === "open_link";
  const ctaDistinct =
    ctaPurring ||
    ctaOpenLink ||
    (!!item.ctaUrl &&
      item.ctaUrl !== item.unsubscribeUrl &&
      item.ctaUrl !== item.unsubscribeOneClickUrl);
  const openSlots =
    (item.href ? 1 : 0) + (ctaDistinct ? 1 : 0) + (gmailMail && hasUnsub ? 1 : 0);
  const avatarTone = financeInv
    ? "bg-emerald-500/15 text-emerald-950 dark:text-emerald-100"
    : "bg-sky-500/15 text-sky-950 dark:text-sky-100";

  if (compact) {
    return (
      <li
        className={cn(
          "flex h-[5.75rem] flex-col justify-between rounded-xl border bg-card/95 px-3 py-2.5 shadow-sm",
          isDraft
            ? "border-rose-300/50"
            : item.kind === "appointment"
              ? "border-teal-300/50"
              : isWork
                ? "border-violet-300/50"
                : financeInv
                  ? "border-emerald-300/40"
                  : "border-border/70",
        )}
      >
        <div className="flex min-h-0 items-start gap-2">
          <span
            className={cn(
              "mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
              tone,
            )}
          >
            {item.sourceLabel}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-snug">
              {item.intent || item.title}
            </p>
            <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
              {item.nextStep || item.subtitle || displayName || "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-8 flex-1 gap-1 rounded-lg text-xs"
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8 shrink-0 rounded-lg"
                disabled={busy}
                aria-label="Flere handlinger"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {ctaDistinct && (
                <DropdownMenuItem onClick={onOpenCta}>
                  {item.ctaLabel || "Neste steg"}
                </DropdownMenuItem>
              )}
              {item.href && (
                <DropdownMenuItem onClick={onOpenModule}>
                  {gmailMail ? "Åpne i Gmail" : "Åpne"}
                </DropdownMenuItem>
              )}
              {gmailMail && (
                <DropdownMenuItem onClick={onReply}>Svar</DropdownMenuItem>
              )}
              {(gmailMail || financeInv) && (
                <DropdownMenuItem onClick={onFollowUp}>Oppfølging</DropdownMenuItem>
              )}
              {(gmailMail || financeInv) && (
                <DropdownMenuItem onClick={onOpenContact}>Kontakt</DropdownMenuItem>
              )}
              {(gmailMail || financeInv) && !item.entityId && (
                <DropdownMenuItem onClick={onCreateContact}>
                  Opprett kontakt
                </DropdownMenuItem>
              )}
              {gmailMail && hasUnsub && (
                <DropdownMenuItem onClick={onUnsubscribe}>Meld av</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {!gmailMail && (
                <DropdownMenuItem onClick={onSnooze} disabled={isWork}>
                  Utsett
                </DropdownMenuItem>
              )}
              {gmailMail && (
                <DropdownMenuItem onClick={onArchive}>Arkiver</DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={gmailMail ? onTrash : onRemove}
                className="text-destructive focus:text-destructive"
              >
                {isDraft || gmailMail ? "Slett" : "Fjern"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </li>
    );
  }

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
              : financeInv
                ? "border-emerald-300/40"
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
        {item.href && !isDraft && !isWork && !richCard && (
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

      {richCard && displayName && (
        <button
          type="button"
          className="mt-2 flex w-full items-center gap-2 rounded-xl text-left hover:bg-muted/40"
          onClick={onOpenContact}
        >
          <span
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
              avatarTone,
            )}
          >
            {initials(item.fromName, item.fromEmail)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{displayName}</span>
            {item.fromEmail && item.fromName && (
              <span className="block truncate text-[11px] text-muted-foreground">
                {item.fromEmail}
              </span>
            )}
          </span>
        </button>
      )}

      <p className="mt-2 text-sm font-semibold leading-snug tracking-tight">
        {item.intent || item.title}
      </p>
      {(item.nextStep || (!item.intent && item.subtitle)) && (
        <p className="mt-1 line-clamp-4 text-xs text-muted-foreground">
          {item.nextStep || item.subtitle}
        </p>
      )}
      {financeInv && item.financeAdvice === "escalate" && (
        <p className="mt-1 text-[11px] font-medium text-amber-800 dark:text-amber-200">
          Anbefaling: høyere sak — ikke bare vennlig purring
        </p>
      )}
      {richCard && item.intent && item.title && item.intent !== item.title && (
        <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground/80">{item.title}</p>
      )}

      {richCard && openSlots > 0 && (
        <div
          className={cn(
            "mt-3 grid gap-1.5",
            openSlots === 1 && "grid-cols-1",
            openSlots === 2 && "grid-cols-2",
            openSlots >= 3 && "grid-cols-3",
          )}
        >
          {item.href && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 gap-1 rounded-xl px-1.5 text-[11px]"
              disabled={busy}
              onClick={onOpenModule}
            >
              {gmailMail ? (
                <Mail className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              )}
              {gmailMail ? "I Gmail" : "I Finance"}
            </Button>
          )}
          {ctaDistinct && (
            <Button
              type="button"
              size="sm"
              className="h-9 gap-1 rounded-xl px-1.5 text-[11px]"
              disabled={busy}
              onClick={onOpenCta}
            >
              {ctaPurring ? (
                <Mail className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate">{item.ctaLabel || "Neste steg"}</span>
            </Button>
          )}
          {gmailMail && hasUnsub && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-9 gap-1 rounded-xl px-1.5 text-[11px] text-muted-foreground"
              disabled={busy}
              onClick={onUnsubscribe}
            >
              <Unlink className="h-3.5 w-3.5 shrink-0" />
              Meld av
            </Button>
          )}
        </div>
      )}

      {gmailMail ? (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 gap-1 rounded-xl text-xs"
            disabled={busy}
            onClick={onFollowUp}
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Oppfølging
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 gap-1 rounded-xl text-xs"
            disabled={busy}
            onClick={onReply}
          >
            <Mail className="h-3.5 w-3.5" />
            Svar
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-9 gap-1 rounded-xl text-xs"
            disabled={busy}
            onClick={onPrimary}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Ferdig
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 gap-1 rounded-xl text-xs"
            disabled={busy}
            onClick={onArchive}
          >
            <Archive className="h-3.5 w-3.5" />
            Arkiver
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-9 gap-1 rounded-xl text-xs text-muted-foreground"
            disabled={busy}
            onClick={onTrash}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Slett
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-9 gap-1 rounded-xl text-xs"
            disabled={busy || !!item.entityId}
            onClick={onCreateContact}
          >
            <UserPlus className="h-3.5 w-3.5" />
            {item.entityId ? "Kontakt OK" : "Kontakt"}
          </Button>
        </div>
      ) : financeInv ? (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 gap-1 rounded-xl text-xs"
            disabled={busy || (!item.fromEmail && !item.entityId)}
            onClick={onFollowUp}
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Oppfølging
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-9 gap-1 rounded-xl text-xs"
            disabled={busy}
            onClick={onPrimary}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
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
            className="h-9 gap-1 rounded-xl text-xs"
            disabled={busy || !!item.entityId || !item.fromEmail}
            onClick={onCreateContact}
          >
            <UserPlus className="h-3.5 w-3.5" />
            {item.entityId ? "Kontakt OK" : "Kontakt"}
          </Button>
        </div>
      ) : (
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
      )}
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

function weeklyPlanQueueItem(weekKey: string): DeskQueueItem {
  return {
    id: `weekly-plan:${weekKey}`,
    kind: "manual",
    title: "Oppdater ukesmal",
    subtitle: "Sett NÅ (maks 3) for denne uken",
    source: "manual",
    sourceLabel: "Uke",
    href: null,
    sourceIds: [`weekly-plan:${weekKey}`],
    occurredAt: new Date().toISOString(),
    intent: "Ukesmal mangler",
    nextStep: "Åpne og fyll Denne uka",
  };
}

export function DeskQueuePanel({
  className,
  onOpenContact,
  variant = "rail",
}: {
  className?: string;
  /** Open contact on same page (panel/sheet). */
  onOpenContact?: (entityId: string) => void;
  /** rail = side panel; dashboard = Hele livet Topp 3 (same actions). */
  variant?: "rail" | "dashboard";
}) {
  const isDashboard = variant === "dashboard";
  const { focusHint, needsFill, plan } = useWeeklyPlan();
  const weekKey = plan?.weekKey ?? osloWeekKey();
  const qc = useQueryClient();
  const fetchQueue = useServerFn(getDeskQueue);
  const createManual = useServerFn(createDeskManualSignal);
  const runAct = useServerFn(actOnMorningItem);
  const runUndo = useServerFn(undoMorningItem);
  const runCreateContact = useServerFn(createContactFromSuggestion);
  const runScheduleFollowUp = useServerFn(scheduleEntityFollowUp);

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [manualText, setManualText] = useState("");
  const [adding, setAdding] = useState(false);
  const [showIntake, setShowIntake] = useState(false);
  const [session, setSession] = useState<WorkSession | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [replyItem, setReplyItem] = useState<DeskQueueItem | null>(null);
  const [purringItem, setPurringItem] = useState<DeskQueueItem | null>(null);
  const [followItem, setFollowItem] = useState<DeskQueueItem | null>(null);
  const [createItem, setCreateItem] = useState<DeskQueueItem | null>(null);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [entityOverrides, setEntityOverrides] = useState<Record<string, string>>({});

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

  const cached = useMemo(() => readDeskQueueCache(), []);

  const query = useQuery({
    queryKey: ["desk-queue"],
    queryFn: async () => {
      const data = await fetchQueue();
      writeDeskQueueCache(data);
      return data;
    },
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.updatedAt,
    staleTime: DESK_QUEUE_STALE_MS,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const visible = useMemo(() => {
    const serverItems = (query.data?.items ?? [])
      .filter((i) => !hiddenIds.has(i.id))
      .map((i) =>
        entityOverrides[i.id] ? { ...i, entityId: entityOverrides[i.id]! } : i,
      );
    const local: DeskQueueItem[] = [];
    if (session && !hiddenIds.has(`work:session:${session.startedAt}`)) {
      local.push(workSessionItem(session, nowMs));
    }
    const weekItemId = `weekly-plan:${weekKey}`;
    if (needsFill && !hiddenIds.has(weekItemId)) {
      local.push(weeklyPlanQueueItem(weekKey));
    }
    return [...local, ...serverItems].slice(0, VISIBLE);
  }, [
    query.data?.items,
    hiddenIds,
    session,
    nowMs,
    entityOverrides,
    needsFill,
    weekKey,
  ]);

  const remaining =
    Math.max(0, (query.data?.totalOpen ?? 0) + (session ? 1 : 0) - hiddenIds.size) -
    visible.length;

  async function act(
    item: DeskQueueItem,
    action: "done" | "snoozed" | "ignored",
    gmailSideEffect?: GmailSideEffect,
  ) {
    if (isWeeklyPlanQueueId(item.id)) {
      setHiddenIds((prev) => new Set(prev).add(item.id));
      if (action === "done") openWeekPlanSheet();
      return;
    }
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
            : gmailSideEffect === "mark_read"
              ? "Ferdig — markert lest"
              : "Ferdig"
          : action === "snoozed"
            ? "Utsatt til i morgen"
            : gmailSideEffect === "archive"
              ? "Arkivert i Gmail"
              : gmailSideEffect === "trash"
                ? "Slettet i Gmail"
                : item.kind === "draft"
                  ? "Utkast slettet"
                  : "Fjernet";
      toast(label, {
        duration: 6000,
        action:
          gmailSideEffect === "trash"
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
    if (isWeeklyPlanQueueId(item.id)) {
      openWeekPlanSheet();
      return;
    }
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
      if (item.entityId && onOpenContact) {
        onOpenContact(item.entityId);
      } else {
        window.location.href = item.href;
      }
    }
    void act(item, "done", item.kind === "mail" ? "mark_read" : undefined);
  }

  function openContactFor(item: DeskQueueItem) {
    const entityId = item.entityId ?? entityOverrides[item.id];
    if (entityId && onOpenContact) {
      onOpenContact(entityId);
      return;
    }
    setCreateName(item.fromName || item.fromEmail?.split("@")[0] || "");
    setCreateItem(item);
  }

  function handleUnsubscribe(item: DeskQueueItem) {
    // Always send user to a page/mailto — no silent one-click POST + fake certainty toast.
    const url = item.unsubscribeUrl || item.unsubscribeOneClickUrl;
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    if (item.unsubscribeMailto) {
      window.location.href = `mailto:${item.unsubscribeMailto}`;
    }
  }

  async function ensureEntity(item: DeskQueueItem): Promise<string | null> {
    const existing = item.entityId ?? entityOverrides[item.id];
    if (existing) return existing;
    if (!item.fromEmail) {
      toast.error("Ingen e-post å knytte kontakt til");
      return null;
    }
    const name =
      item.fromName?.trim() ||
      item.fromEmail.split("@")[0] ||
      item.fromEmail;
    const res = await runCreateContact({
      data: {
        name,
        email: item.fromEmail,
        entityType: "person",
        reason: "Fra Desk-kø",
      },
    });
    setEntityOverrides((prev) => ({ ...prev, [item.id]: res.entityId }));
    void qc.invalidateQueries({ queryKey: ["customers"] });
    return res.entityId as string;
  }

  async function submitCreateContact() {
    if (!createItem) return;
    const name = createName.trim();
    if (!name) {
      toast.error("Skriv et navn");
      return;
    }
    setCreating(true);
    try {
      const res = await runCreateContact({
        data: {
          name,
          email: createItem.fromEmail,
          entityType: "person",
          reason: "Fra Desk-kø",
        },
      });
      setEntityOverrides((prev) => ({ ...prev, [createItem.id]: res.entityId }));
      toast.success(res.created ? "Kontakt opprettet" : "Kontakt finnes allerede");
      setCreateItem(null);
      onOpenContact?.(res.entityId);
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: ["desk-queue"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke opprette");
    } finally {
      setCreating(false);
    }
  }

  async function openFollowUp(item: DeskQueueItem) {
    try {
      const entityId = await ensureEntity(item);
      if (!entityId) return;
      setFollowItem({ ...item, entityId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke åpne oppfølging");
    }
  }

  async function submitFollowUp(input: {
    action: string;
    preset: FollowUpPreset;
    pickDate?: string;
  }) {
    const entityId = followItem?.entityId;
    if (!entityId) return;
    setFollowBusy(true);
    try {
      await runScheduleFollowUp({
        data: {
          entityId,
          action: input.action,
          preset: input.preset,
          followUpDate: input.pickDate ?? null,
        },
      });
      toast.success("Oppfølging planlagt");
      setFollowItem(null);
      void qc.invalidateQueries({ queryKey: ["desk-queue"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke lagre");
    } finally {
      setFollowBusy(false);
    }
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
        "flex min-h-0 w-full flex-col",
        isDashboard
          ? "os-glass h-[26.5rem] shrink-0 overflow-hidden rounded-2xl"
          : "h-full border-border/60 bg-background/40",
        className,
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {isDashboard ? "Topp 3" : "I dag"}
          </p>
          <h2 className="mt-0.5 font-heading text-base font-semibold tracking-tight">
            {isDashboard ? "Dagens kø" : "Kø"}
          </h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {isDashboard && focusHint
              ? `Fokus nå: ${focusHint}`
              : isDashboard
                ? "Tre kort · handlinger i ⋯"
                : "Like valg per kilde — ikke AI-anbefalinger"}
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
          <ul className={cn("space-y-2", isDashboard && "space-y-2")}>
            {visible.map((item) => (
              <QueueCard
                key={item.id}
                item={item}
                busy={busyId === item.id}
                compact={isDashboard}
                primaryLabel={isWeeklyPlanQueueId(item.id) ? "Åpne" : undefined}
                onPrimary={() => onPrimary(item)}
                onSnooze={() => void act(item, "snoozed")}
                onRemove={() =>
                  void act(
                    item,
                    "ignored",
                    item.kind === "draft" ? "trash" : undefined,
                  )
                }
                onOpenContact={() => openContactFor(item)}
                onFollowUp={() => void openFollowUp(item)}
                onReply={() => setReplyItem(item)}
                onArchive={() => void act(item, "ignored", "archive")}
                onTrash={() => {
                  if (window.confirm("Slette denne mailen i Gmail også?")) {
                    void act(item, "ignored", "trash");
                  }
                }}
                onCreateContact={() => {
                  setCreateName(item.fromName || item.fromEmail?.split("@")[0] || "");
                  setCreateItem(item);
                }}
                onOpenModule={() => {
                  if (item.href) {
                    window.open(item.href, "_blank", "noopener,noreferrer");
                  }
                }}
                onOpenCta={() => {
                  if (item.ctaKind === "purring" && parseInvoiceFromDeskItem(item)) {
                    setPurringItem(item);
                    return;
                  }
                  if (item.ctaKind === "open_link" && item.ctaUrl) {
                    if (item.ctaUrl.startsWith("/")) {
                      window.location.href = item.ctaUrl;
                    } else {
                      window.open(item.ctaUrl, "_blank", "noopener,noreferrer");
                    }
                    return;
                  }
                  if (item.ctaUrl) {
                    window.open(item.ctaUrl, "_blank", "noopener,noreferrer");
                  }
                }}
                onUnsubscribe={() => handleUnsubscribe(item)}
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

      {replyItem && gmailMessageIdOf(replyItem) && (
        <GmailReplyDrawer
          open={!!replyItem}
          onOpenChange={(open) => {
            if (!open) setReplyItem(null);
          }}
          messageId={gmailMessageIdOf(replyItem)!}
          fallbackSubject={replyItem.title}
          fallbackSender={replyItem.fromName ?? replyItem.fromEmail ?? undefined}
          fallbackSnippet={replyItem.subtitle ?? undefined}
          onSaved={({ markHandled }) => {
            if (markHandled && replyItem) {
              void act(replyItem, "done", "mark_read");
            }
            setReplyItem(null);
          }}
        />
      )}

      {purringItem && parseInvoiceFromDeskItem(purringItem) && (
        <InvoiceComposeSheet
          open={!!purringItem}
          onOpenChange={(open) => {
            if (!open) setPurringItem(null);
          }}
          invoiceId={parseInvoiceFromDeskItem(purringItem)!.invoiceId}
          orgSlug={parseInvoiceFromDeskItem(purringItem)!.orgSlug}
          briefItemId={purringItem.id}
          initialInstruction={purringItem.purringInstruction}
          onSent={() => {
            if (purringItem) void act(purringItem, "done");
            setPurringItem(null);
          }}
        />
      )}

      <Sheet
        open={!!followItem}
        onOpenChange={(open) => {
          if (!open) setFollowItem(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Lag oppfølging</SheetTitle>
            <SheetDescription>
              {followItem?.fromName || followItem?.fromEmail || "Kontakt"}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <PlanFollowUpPanel
              defaultAction={followItem?.title ? `Følg opp: ${followItem.title}` : ""}
              busy={followBusy}
              onSchedule={(input) => void submitFollowUp(input)}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={!!createItem}
        onOpenChange={(open) => {
          if (!open) setCreateItem(null);
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Opprett kontakt</SheetTitle>
            <SheetDescription>
              {createItem?.fromEmail
                ? `Knyttes til ${createItem.fromEmail}`
                : "Ny person i Kontakter"}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <Input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Navn"
              className="h-11 rounded-xl"
            />
            <Button
              type="button"
              className="h-11 w-full rounded-xl"
              disabled={creating || !createName.trim()}
              onClick={() => void submitCreateContact()}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Opprett"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </aside>
  );
}
