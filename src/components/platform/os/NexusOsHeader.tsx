import { Link } from "@tanstack/react-router";
import { Plus, Search, Sun } from "lucide-react";
import {
  OS_CONTEXTS,
  OS_CONTEXT_LABELS,
  type OsContext,
} from "@/lib/os/context";
import { cn } from "@/lib/utils";

export function NexusOsHeader({
  title,
  subtitle,
  dateLabel,
  kontekst,
  showSun = false,
}: {
  title: string;
  subtitle?: string;
  dateLabel: string;
  kontekst: OsContext;
  showSun?: boolean;
}) {
  return (
    <header className="shrink-0 border-b border-border/50 bg-background/80 px-6 py-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-start gap-4 lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {showSun && <Sun className="size-5 text-warning" aria-hidden />}
            <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {dateLabel}
            {subtitle ? ` · ${subtitle}` : null}
          </p>
        </div>

        <div className="order-last flex w-full max-w-md flex-1 items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2 text-sm text-muted-foreground shadow-soft lg:order-none lg:mx-auto">
          <Search className="size-4 shrink-0 opacity-60" />
          <span className="flex-1 truncate">Søk i alt...</span>
          <kbd className="hidden rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            ⌘K
          </kbd>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="flex rounded-xl bg-muted/80 p-1"
            role="tablist"
            aria-label="Kontekst"
          >
            {OS_CONTEXTS.map((id) => {
              const active = id === kontekst;
              return (
                <Link
                  key={id}
                  to="/desk"
                  search={{ kontekst: id }}
                  role="tab"
                  aria-selected={active}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm",
                    active
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {OS_CONTEXT_LABELS[id]}
                </Link>
              );
            })}
          </div>

          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground shadow-soft transition-colors hover:bg-primary/90"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">Legg til</span>
          </button>
        </div>
      </div>
    </header>
  );
}
