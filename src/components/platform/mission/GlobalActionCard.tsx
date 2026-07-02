import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { GlobalMissionAction, MissionTier } from "@/lib/mission-actions";
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

export function GlobalActionCard({ action }: { action: GlobalMissionAction }) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tierStyle[action.tier]}`}>
          {tierLabel[action.tier]}
        </span>
        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
          {action.moduleName}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {action.orgName} · {action.wsName}
        </span>
      </div>

      <div>
        <div className="font-heading text-base font-semibold">{action.title}</div>
        <p className="mt-0.5 text-sm text-muted-foreground">{action.description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {action.href && (
          <Button asChild size="sm">
            <a href={action.href} target="_blank" rel="noreferrer" className="gap-1">
              Open in {action.moduleName} <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
        <Button asChild size="sm" variant="ghost">
          <Link
            to="/o/$orgSlug/w/$wsSlug"
            params={{ orgSlug: action.orgSlug, wsSlug: action.wsSlug }}
          >
            Workspace Mission
          </Link>
        </Button>
      </div>
    </Card>
  );
}
