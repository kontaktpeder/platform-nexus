import { Link } from "@tanstack/react-router";
import { Building2, Layers, Plug } from "lucide-react";

export function WorkspaceContextBar({
  orgSlug,
  orgName,
  wsName,
  connectedCount,
}: {
  orgSlug: string;
  orgName: string;
  wsName: string;
  connectedCount: number;
}) {
  return (
    <div className="surface-card mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-xs text-muted-foreground">
      <Link
        to="/o/$orgSlug"
        params={{ orgSlug }}
        className="inline-flex items-center gap-1.5 hover:text-foreground"
      >
        <Building2 className="h-3.5 w-3.5" />
        <span className="font-medium">{orgName}</span>
      </Link>
      <span className="inline-flex items-center gap-1.5">
        <Layers className="h-3.5 w-3.5" />
        {wsName}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Plug className="h-3.5 w-3.5" />
        {connectedCount} connected module{connectedCount === 1 ? "" : "s"}
      </span>
    </div>
  );
}
