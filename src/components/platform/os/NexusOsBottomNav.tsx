import { Link, useRouterState } from "@tanstack/react-router";
import { Filter, LayoutDashboard, MessageCircle, UserRound, Zap } from "lucide-react";
import { openWeekPlanSheet } from "@/lib/os/week-plan-ui";
import { cn } from "@/lib/utils";

const ITEMS = [
  {
    id: "i-dag",
    label: "I dag",
    to: "/desk" as const,
    search: { kontekst: "hele" as const },
    icon: LayoutDashboard,
  },
  {
    id: "fortell",
    label: "Fortell",
    to: "/desk/fortell" as const,
    search: undefined,
    icon: MessageCircle,
  },
  {
    id: "fang",
    label: "Fang",
    to: "/hjem" as const,
    search: undefined,
    icon: Zap,
  },
  {
    id: "profil",
    label: "Profil",
    to: "/profil" as const,
    search: undefined,
    icon: UserRound,
  },
] as const;

/**
 * Mobile OS dock — charcoal pill nav matching NexusOsSideNav.
 * Ukesmal opens the same sheet as desktop sidebar.
 */
export function NexusOsBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Hovednavigasjon"
      className={cn(
        "shrink-0 border-t border-white/10",
        "bg-gradient-to-t from-[#0a1018] via-[#101a2a] to-[#0c1522]",
        "pb-[max(0.35rem,env(safe-area-inset-bottom))]",
      )}
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-0.5 px-1.5 pt-1">
        {ITEMS.slice(0, 2).map((item) => {
          const Icon = item.icon;
          const active =
            item.id === "i-dag"
              ? pathname === "/desk" || pathname === "/desk/"
              : pathname.startsWith("/desk/fortell");
          return (
            <Link
              key={item.id}
              to={item.to}
              search={item.search}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-medium transition-colors",
                active
                  ? "bg-primary/25 text-white"
                  : "text-white/55 hover:bg-white/8 hover:text-white",
              )}
            >
              <Icon className={cn("size-5", active && "scale-110")} aria-hidden />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => openWeekPlanSheet()}
          className="flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-medium text-warning/90 transition-colors hover:bg-white/8"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-warning/25">
            <Filter className="size-4" aria-hidden />
          </span>
          <span className="truncate">Ukesmal</span>
        </button>

        {ITEMS.slice(2).map((item) => {
          const Icon = item.icon;
          const active =
            item.id === "fang"
              ? pathname === "/hjem" || pathname.startsWith("/hjem/")
              : pathname.startsWith("/profil");
          return (
            <Link
              key={item.id}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-medium transition-colors",
                active
                  ? "bg-primary/25 text-white"
                  : "text-white/55 hover:bg-white/8 hover:text-white",
              )}
            >
              <Icon className={cn("size-5", active && "scale-110")} aria-hidden />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
