import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, MessageCircle, UserRound, Users, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mobile nav for non-OS PlatformShell routes — same destinations as OS dock. */
const ITEMS = [
  {
    to: "/desk" as const,
    label: "I dag",
    icon: LayoutDashboard,
    exact: true,
    search: { kontekst: "hele" as const },
  },
  {
    to: "/desk/fortell" as const,
    label: "Fortell",
    icon: MessageCircle,
    exact: false,
    search: undefined,
  },
  {
    to: "/hjem" as const,
    label: "Fang",
    icon: Zap,
    exact: true,
    search: undefined,
  },
  {
    to: "/kontakter" as const,
    label: "Folk",
    icon: Users,
    exact: false,
    search: undefined,
  },
  {
    to: "/profil" as const,
    label: "Profil",
    icon: UserRound,
    exact: false,
    search: undefined,
  },
] as const;

/**
 * @param mode `inline` — docked in PlatformShell (does not move when content scrolls).
 *             `fixed` — legacy absolute overlay for pages outside the shell.
 */
export function PlatformBottomNav({ mode = "fixed" }: { mode?: "fixed" | "inline" }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Hovednavigasjon"
      className={cn(
        "z-30 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85",
        "pb-[max(0.5rem,env(safe-area-inset-bottom))] [.standalone_&]:pb-[env(safe-area-inset-bottom)]",
        mode === "fixed" && "fixed inset-x-0 bottom-0",
        mode === "inline" && "shrink-0",
      )}
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 px-1">
        {ITEMS.map((item) => {
          const { to, label, icon: Icon, exact } = item;
          const active = exact
            ? pathname === to || pathname === `${to}/`
            : to === "/desk/fortell"
              ? pathname.startsWith("/desk/fortell")
              : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              search={"search" in item ? item.search : undefined}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-[3.75rem] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-2 text-[10px] font-medium transition-colors active:bg-muted sm:text-[11px] ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon
                aria-hidden="true"
                className={`h-5 w-5 ${active ? "scale-110" : ""} transition-transform`}
              />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
