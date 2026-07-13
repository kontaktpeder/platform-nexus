import { Link } from "@tanstack/react-router";
import { ArrowRight, Layers } from "lucide-react";
import type { ResolvedLastWorkspace } from "@/lib/last-workspace";

export function WorkspaceResumeCard({ workspace }: { workspace: ResolvedLastWorkspace }) {
  return (
    <Link
      to="/o/$orgSlug/w/$wsSlug"
      params={{ orgSlug: workspace.orgSlug, wsSlug: workspace.wsSlug }}
      className="surface-card mb-5 flex items-center gap-4 p-4 transition-all hover:shadow-lift active:scale-[0.99]"
    >
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
        <Layers className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Fortsett der du slapp
        </p>
        <p className="mt-0.5 truncate font-heading text-lg font-semibold">{workspace.wsName}</p>
        <p className="truncate text-sm text-muted-foreground">{workspace.orgName}</p>
      </div>
      <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
