import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarDays,
  CheckSquare,
  CircleHelp,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  Map,
  Settings,
  Sparkles,
  StickyNote,
  Target,
  Bell,
} from "lucide-react";
import { NexusMark } from "@/components/platform/NexusMark";
import { OS_NAV_ITEMS, type OsNavId } from "@/lib/os/context";
import { cn } from "@/lib/utils";

const NAV_ICONS: Record<OsNavId, typeof LayoutDashboard> = {
  "i-dag": LayoutDashboard,
  innboks: Inbox,
  kalender: CalendarDays,
  oppgaver: CheckSquare,
  mal: Target,
  omrader: Map,
  innsikt: Sparkles,
};

export function NexusOsSideNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onFortell = pathname.startsWith("/desk/fortell");

  return (
    <aside className="flex h-full w-[15.5rem] shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <NexusMark size="sm" alt="" className="brightness-0 invert" />
        <span className="font-heading text-lg font-semibold tracking-tight text-white">
          NEXUS
        </span>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {OS_NAV_ITEMS.map((item) => {
          const Icon = NAV_ICONS[item.id];
          const active =
            item.id === "innboks"
              ? onFortell
              : item.id === "i-dag"
                ? !onFortell && pathname === "/desk"
                : false;

          return (
            <Link
              key={item.id}
              to={item.to}
              search={item.to === "/desk" ? { kontekst: "hele" } : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4 shrink-0 opacity-90" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge != null && item.badge > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                    active
                      ? "bg-white/20 text-white"
                      : "bg-warning/90 text-foreground",
                  )}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mx-3 mb-3 rounded-2xl bg-white/95 p-3 text-foreground shadow-soft">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Fang noe...</p>
        <div className="flex gap-1.5">
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
              className="flex flex-1 flex-col items-center gap-1 rounded-xl bg-muted/80 px-1 py-2 text-[10px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Icon className="size-3.5 text-primary" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-around border-t border-sidebar-border px-3 py-3">
        <button
          type="button"
          className="rounded-lg p-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label="Varsler"
        >
          <Bell className="size-4" />
        </button>
        <Link
          to="/profil"
          className="rounded-lg p-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label="Innstillinger"
        >
          <Settings className="size-4" />
        </Link>
        <button
          type="button"
          className="rounded-lg p-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label="Hjelp"
        >
          <CircleHelp className="size-4" />
        </button>
      </div>
    </aside>
  );
}
