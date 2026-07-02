import { Link, useRouterState } from "@tanstack/react-router";
import { Sparkles, Building2, Blocks, Settings } from "lucide-react";

const ITEMS = [
  { to: "/mission", label: "Mission", icon: Sparkles, exact: true },
  { to: "/app", label: "Workspaces", icon: Building2, exact: false },
  { to: "/modules", label: "Modules", icon: Blocks, exact: false },
  { to: "/settings", label: "Settings", icon: Settings, exact: false },
] as const;

export function PlatformBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="sticky bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid max-w-3xl grid-cols-4">
        {ITEMS.map(({ to, label, icon: Icon, exact }) => {
          const active = exact ? pathname === to : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "scale-110" : ""} transition-transform`} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
