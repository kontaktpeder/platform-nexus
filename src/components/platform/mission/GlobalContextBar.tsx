import { Link } from "@tanstack/react-router";
import { Building2, Layers, Plug, ArrowUpRight } from "lucide-react";

export function GlobalContextBar({
  orgCount,
  workspaceCount,
  connectedCount,
}: {
  orgCount: number;
  workspaceCount: number;
  connectedCount: number;
}) {
  return (
    <div className="surface-card mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <Building2 className="h-3.5 w-3.5" />
        {orgCount} organization{orgCount === 1 ? "" : "s"}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Layers className="h-3.5 w-3.5" />
        {workspaceCount} workspace{workspaceCount === 1 ? "" : "s"}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Plug className="h-3.5 w-3.5" />
        {connectedCount} connected module{connectedCount === 1 ? "" : "s"}
      </span>
      <Link
        to="/app"
        className="ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline"
      >
        Browse workspaces <ArrowUpRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
