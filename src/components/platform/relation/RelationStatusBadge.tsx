import { RELATION_STATUS_LABEL, type RelationStatus } from "@/lib/relation/types";
import { cn } from "@/lib/utils";

const TONE: Record<RelationStatus, string> = {
  waiting_on_me: "bg-amber-500/15 text-amber-900 dark:text-amber-300",
  waiting_on_them: "bg-sky-500/15 text-sky-900 dark:text-sky-300",
  upcoming: "bg-primary/10 text-primary",
  quiet: "bg-muted text-muted-foreground",
  new_unconfirmed: "bg-violet-500/10 text-violet-900 dark:text-violet-300",
  confirmed: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-300",
};

export function RelationStatusBadge({
  status,
  className,
}: {
  status: RelationStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        TONE[status],
        className,
      )}
    >
      {RELATION_STATUS_LABEL[status]}
    </span>
  );
}
