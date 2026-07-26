import { cn } from "@/lib/utils";

/** AI-suggested content — visually softer than confirmed facts. */
export function AiHint({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-border/80 bg-muted/30 px-3 py-2 text-sm text-muted-foreground",
        className,
      )}
    >
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide">Foreslått av AI</p>
      {children}
    </div>
  );
}

/** User-confirmed or source-of-truth fact. */
export function ConfirmedFact({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card px-3 py-2 text-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}
