import { useState } from "react";
import {
  ArrowUpRight,
  Archive,
  Check,
  MoreHorizontal,
  X,
  Clock,
  Reply,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { GlobalMissionAction } from "@/lib/mission-actions";
import type { SnoozePreset } from "@/lib/mission-snooze";
import { GmailReplyDrawer } from "./GmailReplyDrawer";

export type MissionActionType =
  | "mark_read"
  | "archive"
  | "dismiss"
  | "snooze"
  | "handled_locally"
  | "open_only";

export type MissionActionBarProps = {
  action: GlobalMissionAction;
  onAction: (type: MissionActionType, snoozePreset?: SnoozePreset) => Promise<void> | void;
  busy?: boolean;
};

export function MissionActionBar({ action, onAction, busy }: MissionActionBarProps) {
  const [replyOpen, setReplyOpen] = useState(false);
  const openLabel =
    action.source === "gmail"
      ? "Open in Gmail"
      : action.source === "slack"
        ? "Open in Slack"
        : `Open in ${action.moduleName ?? "module"}`;

  const gmailMessageId =
    action.source === "gmail" && action.key.startsWith("gmail:")
      ? action.key.slice("gmail:".length)
      : null;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      {action.href && (
        <Button asChild size="sm">
          <a
            href={action.href}
            target="_blank"
            rel="noreferrer"
            className="gap-1"
            onClick={() => void onAction("open_only")}
          >
            {openLabel} <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </Button>
      )}

      {action.source === "workspace" && action.orgSlug && action.wsSlug && (
        <Button asChild size="sm" variant="ghost">
          <Link
            to="/o/$orgSlug/w/$wsSlug"
            params={{ orgSlug: action.orgSlug, wsSlug: action.wsSlug }}
          >
            Workspace Mission
          </Link>
        </Button>
      )}

      {action.source === "gmail" && (
        <>
          {gmailMessageId && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setReplyOpen(true)}
            >
              <Reply className="mr-1 h-3.5 w-3.5" /> Draft reply
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void onAction("mark_read")}
          >
            <Check className="mr-1 h-3.5 w-3.5" /> Mark read
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void onAction("archive")}
          >
            <Archive className="mr-1 h-3.5 w-3.5" /> Archive
          </Button>
        </>
      )}

      {action.source === "slack" && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void onAction("handled_locally")}
        >
          <Check className="mr-1 h-3.5 w-3.5" /> Mark handled
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy}>
            <Clock className="mr-1 h-3.5 w-3.5" /> Snooze
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void onAction("snooze", "later_today")}>
            Later today
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void onAction("snooze", "tomorrow")}>
            Tomorrow
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void onAction("snooze", "next_week")}>
            Next week
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => void onAction("dismiss")}
        aria-label="Dismiss"
      >
        <X className="mr-1 h-3.5 w-3.5" /> Dismiss
      </Button>

      {busy && <MoreHorizontal className="h-4 w-4 animate-pulse text-muted-foreground" />}
    </div>
  );
}
