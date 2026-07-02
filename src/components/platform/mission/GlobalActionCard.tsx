import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Mail, MessageSquare, Layers } from "lucide-react";
import type { GlobalMissionAction, MissionTier, MissionSource } from "@/lib/mission-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const tierStyle: Record<MissionTier, string> = {
  urgent: "bg-destructive/10 text-destructive",
  important: "bg-primary-soft text-primary",
  later: "bg-muted text-muted-foreground",
};

const tierLabel: Record<MissionTier, string> = {
  urgent: "Urgent",
  important: "Important",
  later: "Later",
};

const sourceMeta: Record<MissionSource, { label: string; className: string; Icon: typeof Mail }> = {
  gmail: {
    label: "Gmail",
    className: "bg-red-500/10 text-red-600 dark:text-red-400",
    Icon: Mail,
  },
  slack: {
    label: "Slack",
    className: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    Icon: MessageSquare,
  },
  workspace: {
    label: "Workspace",
    className: "bg-primary-soft text-primary",
    Icon: Layers,
  },
};

export function GlobalActionCard({ action }: { action: GlobalMissionAction }) {
  const src = sourceMeta[action.source];
  const openLabel =
    action.source === "gmail"
      ? "Open in Gmail"
      : action.source === "slack"
        ? "Open in Slack"
        : `Open in ${action.moduleName ?? "module"}`;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tierStyle[action.tier]}`}
        >
          {tierLabel[action.tier]}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${src.className}`}
        >
          <src.Icon className="h-3 w-3" /> {src.label}
        </span>
        {action.source === "workspace" && action.orgName && (
          <span className="text-[11px] text-muted-foreground">
            {action.orgName} · {action.wsName}
          </span>
        )}
        {action.source !== "workspace" && action.sender && (
          <span className="text-[11px] text-muted-foreground">from {action.sender}</span>
        )}
      </div>

      <div>
        <div className="font-heading text-base font-semibold">{action.title}</div>
        {action.description && (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
            {action.description}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {action.href && (
          <Button asChild size="sm">
            <a href={action.href} target="_blank" rel="noreferrer" className="gap-1">
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
      </div>
    </Card>
  );
}
