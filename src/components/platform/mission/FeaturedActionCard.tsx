import { useState } from "react";
import {
  Mail,
  MessageSquare,
  Layers,
  Reply,
  Archive,
  Clock,
  Check,
  X,
  MoreHorizontal,
  ArrowUpRight,
} from "lucide-react";
import type { GlobalMissionAction, MissionSource, MissionTier } from "@/lib/mission-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MissionActionType } from "./MissionActionBar";
import type { SnoozePreset } from "@/lib/mission-snooze";
import { GmailReplyDrawer } from "./GmailReplyDrawer";

const sourceMeta: Record<
  MissionSource,
  { label: string; Icon: typeof Mail; iconClass: string }
> = {
  gmail: { label: "Gmail", Icon: Mail, iconClass: "text-red-500" },
  slack: { label: "Slack", Icon: MessageSquare, iconClass: "text-violet-500" },
  workspace: { label: "Workspaces", Icon: Layers, iconClass: "text-primary" },
};

const tierMeta: Record<MissionTier, { label: string; dot: string }> = {
  urgent: { label: "Akutt", dot: "bg-red-500" },
  important: { label: "Viktig", dot: "bg-amber-500" },
  later: { label: "Senere", dot: "bg-blue-500" },
};

function estimatedMinutes(a: GlobalMissionAction): number {
  if (a.source === "slack") return 3;
  if (a.source === "gmail") return a.tier === "urgent" ? 4 : 5;
  return 4;
}

import { formatOccurredAt } from "@/lib/format-occurred-at";
import { EntityLinkBadge } from "./EntityLinkBadge";

export type FeaturedActionCardProps = {
  action: GlobalMissionAction;
  busy: boolean;
  onAction: (
    action: GlobalMissionAction,
    type: MissionActionType,
    snoozePreset?: SnoozePreset,
  ) => Promise<void> | void;
};

export function FeaturedActionCard({ action, busy, onAction }: FeaturedActionCardProps) {
  const [replyOpen, setReplyOpen] = useState(false);
  const src = sourceMeta[action.source];
  const tier = tierMeta[action.tier];
  const mins = estimatedMinutes(action);
  const gmailMessageId =
    action.source === "gmail" && action.key.startsWith("gmail:")
      ? action.key.slice("gmail:".length)
      : null;

  const primaryLabel =
    action.source === "gmail"
      ? "Svar"
      : action.source === "slack"
        ? "Åpne"
        : "Åpne";

  function handlePrimary() {
    if (action.source === "gmail" && gmailMessageId) {
      setReplyOpen(true);
      return;
    }
    if (action.href) {
      window.open(action.href, action.source === "workspace" ? "_self" : "_blank");
      void onAction(action, "open_only");
    }
  }

  return (
    <section className="mt-2">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Din neste oppgave
      </div>

      <article className="group rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_0_rgba(0,0,0,0.02)] transition-shadow hover:shadow-[0_8px_28px_-16px_rgba(0,0,0,0.15)] sm:p-6">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <src.Icon className={`h-4 w-4 ${src.iconClass}`} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {src.label}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatOccurredAt(action.occurredAt)}</span>
            <RowMenu
              action={action}
              busy={busy}
              onAction={(t, p) => onAction(action, t, p)}
            />
          </div>
        </header>

        {action.entityName && (
          <div className="mt-3">
            <EntityLinkBadge
              entityName={action.entityName}
              entitySlug={action.entitySlug}
              linkSource={action.entityLinkSource}
              className="text-sm font-medium text-primary hover:text-primary"
            />
          </div>
        )}
        <h2
          className={`${action.entityName ? "mt-1" : "mt-3"} font-heading text-xl font-semibold leading-snug sm:text-2xl`}
        >
          {action.title}
        </h2>
        {(action.snippet ?? action.description) && (
          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground sm:text-[15px]">
            {action.snippet ?? action.description}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip icon={<Clock className="h-3 w-3" />}>{mins} min</Chip>
          <Chip>
            <span className={`h-1.5 w-1.5 rounded-full ${tier.dot}`} />
            {tier.label}
          </Chip>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={handlePrimary}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-60"
          >
            {action.source === "gmail" ? (
              <Reply className="h-4 w-4" />
            ) : (
              <ArrowUpRight className="h-4 w-4" />
            )}
            {primaryLabel}
          </button>

          {action.source === "gmail" ? (
            <SecondaryButton
              onClick={() => void onAction(action, "archive")}
              disabled={busy}
              icon={<Archive className="h-4 w-4" />}
              label="Arkiver"
            />
          ) : (
            <SecondaryButton
              onClick={() => void onAction(action, "handled_locally")}
              disabled={busy}
              icon={<Check className="h-4 w-4" />}
              label="Ferdig"
            />
          )}

          <SnoozeButton
            disabled={busy}
            onSnooze={(p) => void onAction(action, "snooze", p)}
          />
        </div>

        {busy && (
          <div className="mt-3 flex items-center justify-center">
            <MoreHorizontal className="h-4 w-4 animate-pulse text-muted-foreground" />
          </div>
        )}
      </article>

      {gmailMessageId && (
        <GmailReplyDrawer
          open={replyOpen}
          onOpenChange={setReplyOpen}
          messageId={gmailMessageId}
          fallbackSubject={action.title}
          fallbackSender={action.sender}
          fallbackSnippet={action.snippet ?? action.description}
          onSaved={({ markHandled }) => {
            if (markHandled) void onAction(action, "handled_locally");
          }}
        />
      )}
    </section>
  );
}

function Chip({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-2.5 py-1 text-xs text-muted-foreground">
      {icon}
      {children}
    </span>
  );
}

function SecondaryButton({
  onClick,
  disabled,
  icon,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
    >
      {icon}
      {label}
    </button>
  );
}

function SnoozeButton({
  disabled,
  onSnooze,
}: {
  disabled?: boolean;
  onSnooze: (preset: SnoozePreset) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          <Clock className="h-4 w-4" />
          Senere
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onSnooze("later_today")}>
          Senere i dag
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSnooze("tomorrow")}>I morgen</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSnooze("next_week")}>Neste uke</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RowMenu({
  action,
  busy,
  onAction,
}: {
  action: GlobalMissionAction;
  busy?: boolean;
  onAction: (type: MissionActionType, preset?: SnoozePreset) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          aria-label="Mer"
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {action.href && (
          <DropdownMenuItem
            onSelect={() => {
              window.open(
                action.href!,
                action.source === "workspace" ? "_self" : "_blank",
              );
              onAction("open_only");
            }}
          >
            <ArrowUpRight className="mr-2 h-4 w-4" /> Åpne kilde
          </DropdownMenuItem>
        )}
        {action.source === "gmail" && (
          <DropdownMenuItem onSelect={() => onAction("mark_read")}>
            <Check className="mr-2 h-4 w-4" /> Merk lest
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => onAction("dismiss")}>
          <X className="mr-2 h-4 w-4" /> Skjul
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
