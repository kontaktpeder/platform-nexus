import { useState } from "react";
import { EntityLinkBadge } from "./EntityLinkBadge";
import {
  Mail,
  MessageSquare,
  Layers,
  MoreHorizontal,
  Check,
  Archive,
  Clock,
  X,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Reply,
} from "lucide-react";
import type {
  GlobalMissionAction,
  MissionSource,
  MissionTier,
} from "@/lib/mission-actions";
import type { ModuleAlertSeverity } from "@/lib/module-alerts.types";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MissionActionType } from "./MissionActionBar";
import type { SnoozePreset } from "@/lib/mission-snooze";
import { GmailReplyDrawer } from "./GmailReplyDrawer";
import { parseGmailMessageIdFromKey } from "./useGmailMessageId";

const sourceIcon: Record<MissionSource, { Icon: typeof Mail; className: string }> = {
  gmail: { Icon: Mail, className: "text-red-500" },
  slack: { Icon: MessageSquare, className: "text-violet-500" },
  workspace: { Icon: Layers, className: "text-primary" },
  commitment: { Icon: Check, className: "text-emerald-500" },
};

const tierDot: Record<MissionTier, string> = {
  urgent: "bg-red-500",
  important: "bg-amber-500",
  later: "bg-blue-500",
};

const INITIAL = 3;

export type QueueListProps = {
  actions: GlobalMissionAction[];
  busyKey: string | null;
  onAction: (
    action: GlobalMissionAction,
    type: MissionActionType,
    snoozePreset?: SnoozePreset,
  ) => Promise<void> | void;
};

export function QueueList({ actions, busyKey, onAction }: QueueListProps) {
  const [expanded, setExpanded] = useState(false);
  if (actions.length === 0) return null;
  const visible = expanded ? actions : actions.slice(0, INITIAL);
  const hidden = actions.length - visible.length;

  return (
    <section className="mt-10">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Deretter
      </div>
      <ul className="divide-y divide-border/60 rounded-2xl border border-border/60 bg-card">
        {visible.map((a) => (
          <QueueRow
            key={a.key}
            action={a}
            busy={busyKey === a.key}
            onAction={onAction}
          />
        ))}
      </ul>

      {actions.length > INITIAL && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? (
            <>
              Vis mindre <ChevronUp className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              Vis alle {actions.length} <ChevronDown className="h-3.5 w-3.5" />
              {hidden > 0 && <span className="sr-only">({hidden} skjult)</span>}
            </>
          )}
        </button>
      )}
    </section>
  );
}

function QueueRow({
  action,
  busy,
  onAction,
}: {
  action: GlobalMissionAction;
  busy: boolean;
  onAction: QueueListProps["onAction"];
}) {
  const src = sourceIcon[action.source];
  const dot = tierDot[action.tier];
  const meta =
    action.source === "workspace"
      ? [action.orgName, action.wsName, action.moduleName]
          .filter(Boolean)
          .join(" · ")
      : action.sender || "";

  const gmailMessageId =
    action.source === "gmail" ? parseGmailMessageIdFromKey(action.key) : null;
  const [replyOpen, setReplyOpen] = useState(false);

  // Row body: NEVER auto-navigates externally. Click is a no-op (info only).
  // Explicit actions live in the shortcut bar / menu.
  return (
    <li className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40 sm:px-5">
      <div className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-muted/60">
        <src.Icon className={`h-4 w-4 ${src.className}`} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {action.title}
          </span>
          <span className={`h-1.5 w-1.5 flex-none rounded-full ${dot}`} aria-hidden />
        </div>
        {(meta || action.entityName) && (
          <div className="mt-0.5 flex items-center gap-2 truncate text-xs text-muted-foreground">
            {meta && <span className="truncate">{meta}</span>}
            {action.entityName && (
              <>
                {meta && <span aria-hidden>·</span>}
                <EntityLinkBadge
                  entityName={action.entityName}
                  entitySlug={action.entitySlug}
                  linkSource={action.entityLinkSource}
                  compact
                />
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-none items-center gap-0.5">
        {action.source === "gmail" && gmailMessageId && (
          <>
            <IconButton
              aria-label="Svar"
              title="Svar"
              disabled={busy}
              onClick={() => setReplyOpen(true)}
            >
              <Reply className="h-4 w-4" />
            </IconButton>
            <IconButton
              aria-label="Merk lest"
              title="Merk lest"
              disabled={busy}
              onClick={() => void onAction(action, "mark_read")}
            >
              <Check className="h-4 w-4" />
            </IconButton>
            <IconButton
              aria-label="Arkiver"
              title="Arkiver"
              disabled={busy}
              onClick={() => void onAction(action, "archive")}
            >
              <Archive className="h-4 w-4" />
            </IconButton>
          </>
        )}
        {action.source === "slack" && (
          <IconButton
            aria-label="Ferdig"
            title="Ferdig"
            disabled={busy}
            onClick={() => void onAction(action, "handled_locally")}
          >
            <Check className="h-4 w-4" />
          </IconButton>
        )}
        <RowMenu
          action={action}
          busy={busy}
          onAction={(t, p) => onAction(action, t, p)}
          onReply={gmailMessageId ? () => setReplyOpen(true) : undefined}
        />
      </div>

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
    </li>
  );
}

function IconButton({
  children,
  onClick,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
      {...rest}
    >
      {children}
    </button>
  );
}

function RowMenu({
  action,
  busy,
  onAction,
  onReply,
}: {
  action: GlobalMissionAction;
  busy?: boolean;
  onAction: (type: MissionActionType, preset?: SnoozePreset) => void;
  onReply?: () => void;
}) {
  const openLabel =
    action.source === "gmail"
      ? "Åpne i Gmail"
      : action.source === "slack"
        ? "Åpne i Slack"
        : "Åpne";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          aria-label="Mer"
          title="Mer"
          className="grid h-8 w-8 flex-none place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onReply && (
          <DropdownMenuItem onSelect={() => onReply()}>
            <Reply className="mr-2 h-4 w-4" /> Svar
          </DropdownMenuItem>
        )}
        {action.source === "gmail" && (
          <>
            <DropdownMenuItem onSelect={() => onAction("mark_read")}>
              <Check className="mr-2 h-4 w-4" /> Merk lest
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction("archive")}>
              <Archive className="mr-2 h-4 w-4" /> Arkiver
            </DropdownMenuItem>
          </>
        )}
        {action.source !== "gmail" && (
          <DropdownMenuItem onSelect={() => onAction("handled_locally")}>
            <Check className="mr-2 h-4 w-4" /> Ferdig
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => onAction("snooze", "later_today")}>
          <Clock className="mr-2 h-4 w-4" /> Senere i dag
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAction("snooze", "tomorrow")}>
          <Clock className="mr-2 h-4 w-4" /> I morgen
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAction("dismiss")}>
          <X className="mr-2 h-4 w-4" /> Skjul
        </DropdownMenuItem>
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
            <ArrowUpRight className="mr-2 h-4 w-4" /> {openLabel}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
