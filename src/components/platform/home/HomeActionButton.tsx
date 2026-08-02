import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function HomeActionButton({
  title,
  description,
  icon,
  onClick,
  active,
  className,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-4 rounded-2xl border px-4 py-5 text-left shadow-sm transition-colors active:scale-[0.99]",
        active ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted/40",
        className,
      )}
    >
      <span
        className={cn(
          "grid h-12 w-12 shrink-0 place-items-center rounded-2xl",
          active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 pt-0.5">
        <span className="block text-base font-semibold tracking-tight">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}
