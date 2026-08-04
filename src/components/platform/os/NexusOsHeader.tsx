import { Link } from "@tanstack/react-router";
import { Moon, Plus, Search, Sunset, Sun } from "lucide-react";
import { useDayAtmosphere } from "@/hooks/useDayAtmosphere";
import {
  OS_CONTEXTS,
  OS_CONTEXT_LABELS,
  type OsContext,
} from "@/lib/os/context";
import { isDarkPhase, type DayPhase } from "@/lib/os/day-atmosphere";
import { cn } from "@/lib/utils";

function PhaseIcon({ phase }: { phase: DayPhase }) {
  if (phase === "night") return <Moon className="size-5 text-violet-200" aria-hidden />;
  if (phase === "evening" || phase === "afternoon")
    return <Sunset className="size-5 text-orange-300" aria-hidden />;
  if (phase === "dawn") return <SunriseIcon />;
  return <Sun className="size-5 text-amber-400" aria-hidden />;
}

function SunriseIcon() {
  return <Sun className="size-5 text-orange-400" aria-hidden />;
}

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
  const atmosphere = useDayAtmosphere();
  const dark = isDarkPhase(atmosphere.phase);

  return (
    <header
      className={cn(
        "shrink-0 border-b px-4 py-3 backdrop-blur-md transition-colors duration-700 sm:px-6 sm:py-4",
        dark
          ? "border-white/10 bg-black/20 text-white"
          : "border-white/40 bg-white/35 text-foreground",
      )}
    >
      <div className="flex flex-wrap items-start gap-3 lg:items-center lg:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {showSun && <PhaseIcon phase={atmosphere.phase} />}
            <h1
              className={cn(
                "font-heading text-lg font-semibold tracking-tight sm:text-xl",
                dark ? "text-white" : "text-foreground",
              )}
            >
              {title}
            </h1>
            <span
              className={cn(
                "hidden rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide sm:inline",
                dark ? "bg-white/15 text-white/80" : "bg-primary/10 text-primary",
              )}
            >
              {atmosphere.label}
            </span>
          </div>
          <p
            className={cn(
              "mt-0.5 text-xs sm:text-sm",
              dark ? "text-white/70" : "text-muted-foreground",
            )}
          >
            {dateLabel}
            {subtitle ? ` · ${subtitle}` : null}
          </p>
        </div>

        <div
          className={cn(
            "order-last hidden w-full max-w-md flex-1 items-center gap-2 rounded-xl px-3 py-2 text-sm shadow-soft backdrop-blur-sm sm:flex lg:order-none lg:mx-auto",
            dark
              ? "border border-white/15 bg-white/10 text-white/70"
              : "border border-white/60 bg-white/70 text-muted-foreground",
          )}
        >
          <Search className="size-4 shrink-0 opacity-60" />
          <span className="flex-1 truncate">Søk i alt...</span>
          <kbd
            className={cn(
              "hidden rounded-md px-1.5 py-0.5 font-mono text-[10px] sm:inline",
              dark ? "bg-white/15 text-white/70" : "bg-muted text-muted-foreground",
            )}
          >
            ⌘K
          </kbd>
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-3">
          <div
            className={cn(
              "flex min-w-0 flex-1 overflow-x-auto rounded-xl p-1 backdrop-blur-sm scrollbar-none sm:flex-none",
              dark ? "bg-white/10" : "bg-white/60",
            )}
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
                    "shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors sm:px-3 sm:text-sm",
                    active
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : dark
                        ? "text-white/70 hover:text-white"
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
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground shadow-soft transition-colors hover:bg-primary/90"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">Legg til</span>
          </button>
        </div>
      </div>
    </header>
  );
}
