import { Link, useRouterState } from "@tanstack/react-router";
import { Home, UserRound, Users } from "lucide-react";

const ITEMS = [
  { to: "/hjem" as const, label: "Hjem", icon: Home, exact: true },
  { to: "/kontakter" as const, label: "Kontakter", icon: Users, exact: false },
  { to: "/profil" as const, label: "Profil", icon: UserRound, exact: false },
] as const;

export function PlatformBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Hovednavigasjon"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/85"
    >
      <div className="mx-auto grid max-w-lg grid-cols-3 px-2">
        {ITEMS.map((item) => {
          const { to, label, icon: Icon, exact } = item;
          const active = exact ? pathname === to : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium transition-colors active:bg-muted sm:text-xs ${
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
