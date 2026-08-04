import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  CalendarDays,
  CheckSquare,
  CircleHelp,
  Filter,
  LayoutDashboard,
  Lightbulb,
  Map,
  MessageCircle,
  Settings,
  Sparkles,
  StickyNote,
  Target,
} from "lucide-react";
import { NexusMark } from "@/components/platform/NexusMark";
import { WeekFocusSheet } from "@/components/platform/os/WeekFocusSheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useOsProfile } from "@/hooks/useOsProfile";
import { useWeeklyPlan } from "@/hooks/useWeeklyPlan";
import { OS_NAV_ITEMS, type OsNavId } from "@/lib/os/context";
import { WEEK_PLAN_OPEN_EVENT } from "@/lib/os/week-plan-ui";
import { cn } from "@/lib/utils";

const NAV_ICONS: Record<OsNavId, typeof LayoutDashboard> = {
  "i-dag": LayoutDashboard,
  innboks: MessageCircle,
  kalender: CalendarDays,
  oppgaver: CheckSquare,
  mal: Target,
  omrader: Map,
  innsikt: Sparkles,
};

/**
 * Bubbly OS sidebar — chrome sphere home, pill nav, ukesmal, capture, profile.
 */
export function NexusOsSideNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onFortell = pathname.startsWith("/desk/fortell");
  const onDeskHome = !onFortell && (pathname === "/desk" || pathname === "/desk/");
  const { displayName, avatarUrl, fallbackStyle, initials } = useOsProfile();
  const { focusHint, needsFill } = useWeeklyPlan();
  const [weekOpen, setWeekOpen] = useState(false);

  useEffect(() => {
    const open = () => setWeekOpen(true);
    window.addEventListener(WEEK_PLAN_OPEN_EVENT, open);
    return () => window.removeEventListener(WEEK_PLAN_OPEN_EVENT, open);
  }, []);

  return (
    <>
      <aside
        className={cn(
          "relative flex h-full w-[5.75rem] shrink-0 flex-col items-center",
          "bg-gradient-to-b from-[#0c1522] via-[#101a2a] to-[#0a1018]",
          "text-sidebar-foreground",
          "border-r border-white/5",
          "xl:w-[15.5rem] xl:items-stretch",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-6 size-24 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,oklch(0.55_0.12_230/0.45)_0%,transparent_70%)] blur-2xl xl:left-8 xl:translate-x-0"
        />

        <div className="relative z-10 flex flex-col items-center gap-1.5 px-2 pb-3 pt-5 xl:flex-row xl:gap-3 xl:px-4">
          <Link
            to="/desk"
            search={{ kontekst: "hele" }}
            aria-label="NEXUS — I dag"
            className={cn(
              "group relative rounded-full transition-transform duration-300 hover:scale-105",
              onDeskHome && "scale-105",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute inset-[-6px] rounded-full opacity-0 transition-opacity duration-300",
                "bg-[radial-gradient(circle,oklch(0.7_0.1_220/0.5)_0%,transparent_70%)]",
                "group-hover:opacity-100",
                onDeskHome && "opacity-100",
              )}
            />
            <NexusMark size="md" alt="" pulse={onDeskHome} className="relative drop-shadow-lg" />
          </Link>
          <div className="hidden min-w-0 xl:block">
            <p className="font-heading text-sm font-semibold tracking-wide text-white">NEXUS</p>
            <p className="truncate text-[11px] text-white/45">Kontrollsenter</p>
          </div>
        </div>

        <nav className="relative z-10 flex flex-1 flex-col items-center gap-1.5 overflow-y-auto px-2 py-2 xl:items-stretch xl:px-3">
          {OS_NAV_ITEMS.map((item) => {
            const Icon = NAV_ICONS[item.id];
            const active =
              item.id === "innboks"
                ? onFortell
                : item.id === "i-dag"
                  ? onDeskHome
                  : false;

            return (
              <Link
                key={item.id}
                to={item.to}
                search={item.to === "/desk" ? { kontekst: "hele" } : undefined}
                title={item.label}
                className={cn(
                  "group relative flex items-center justify-center gap-3 rounded-full px-0 py-2.5 text-sm font-medium transition-all duration-200",
                  "xl:justify-start xl:px-3",
                  active
                    ? "bg-gradient-to-r from-primary to-[oklch(0.5_0.1_195)] text-white shadow-[0_8px_24px_-8px_oklch(0.45_0.1_210/0.7)]"
                    : "text-white/65 hover:bg-white/8 hover:text-white",
                )}
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full transition-colors",
                    active
                      ? "bg-white/20"
                      : "bg-white/5 group-hover:bg-white/10",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="hidden flex-1 truncate xl:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="relative z-10 mx-2 mb-2 w-[calc(100%-1rem)] xl:mx-3 xl:w-auto">
          <button
            type="button"
            onClick={() => setWeekOpen(true)}
            title="Ukesmal"
            className={cn(
              "flex w-full items-center gap-2 rounded-2xl border border-white/10 px-2 py-2 text-left transition-colors",
              "bg-white/8 hover:bg-white/12",
              "xl:px-3",
              needsFill && "ring-1 ring-warning/50",
            )}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning/25 text-warning">
              <Filter className="size-4" />
            </span>
            <span className="hidden min-w-0 flex-1 xl:block">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/50">
                Ukesmal
              </span>
              <span className="block truncate text-xs font-medium text-white/90">
                {focusHint ?? "Fyll Denne uka…"}
              </span>
            </span>
          </button>
        </div>

        <div className="relative z-10 mx-2 mb-3 hidden rounded-[1.75rem] border border-white/10 bg-white/95 p-2.5 text-foreground shadow-[0_12px_40px_-16px_rgba(0,0,0,0.5)] xl:block">
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Fang noe
          </p>
          <div className="flex justify-between gap-1">
            {(
              [
                { label: "Oppgave", icon: CheckSquare, tone: "bg-primary/12 text-primary" },
                { label: "Notat", icon: StickyNote, tone: "bg-secondary/15 text-secondary" },
                { label: "Idé", icon: Lightbulb, tone: "bg-warning/25 text-[oklch(0.45_0.12_75)]" },
              ] as const
            ).map(({ label, icon: Icon, tone }) => (
              <button
                key={label}
                type="button"
                title={label}
                className="flex flex-1 flex-col items-center gap-1 rounded-2xl p-1.5 transition-transform hover:scale-105"
              >
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full shadow-soft",
                    tone,
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="text-[9px] font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="relative z-10 mb-2 flex flex-col items-center gap-1.5 xl:hidden">
          {(
            [
              { label: "Oppgave", icon: CheckSquare },
              { label: "Notat", icon: StickyNote },
              { label: "Idé", icon: Lightbulb },
            ] as const
          ).map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              title={label}
              className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/18 hover:text-white"
            >
              <Icon className="size-3.5" />
            </button>
          ))}
        </div>

        <div className="relative z-10 mt-auto flex flex-col items-center gap-2 border-t border-white/8 px-2 py-3 xl:flex-row xl:justify-between xl:px-3">
          <div className="flex flex-col items-center gap-1.5 xl:flex-row xl:gap-1">
            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-full bg-white/5 text-white/65 transition-colors hover:bg-white/12 hover:text-white"
              aria-label="Varsler"
            >
              <Bell className="size-4" />
            </button>
            <Link
              to="/profil"
              className="flex size-9 items-center justify-center rounded-full bg-white/5 text-white/65 transition-colors hover:bg-white/12 hover:text-white"
              aria-label="Innstillinger"
            >
              <Settings className="size-4" />
            </Link>
            <button
              type="button"
              className="hidden size-9 items-center justify-center rounded-full bg-white/5 text-white/65 transition-colors hover:bg-white/12 hover:text-white xl:flex"
              aria-label="Hjelp"
            >
              <CircleHelp className="size-4" />
            </button>
          </div>

          <Link
            to="/profil"
            title={displayName}
            aria-label={`Profil — ${displayName}`}
            className="group relative rounded-full ring-2 ring-white/15 transition-all hover:ring-primary/60 hover:ring-offset-2 hover:ring-offset-[#0c1522]"
          >
            <Avatar className="size-10 shadow-[0_8px_20px_-6px_rgba(0,0,0,0.55)]">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
              <AvatarFallback style={fallbackStyle} className="text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span
              aria-hidden
              className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-[#0c1522] bg-success"
            />
          </Link>
        </div>
      </aside>

      <WeekFocusSheet open={weekOpen} onOpenChange={setWeekOpen} />
    </>
  );
}
