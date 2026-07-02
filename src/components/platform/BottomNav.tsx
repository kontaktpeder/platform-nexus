import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Blocks, Settings } from "lucide-react";

export function BottomNav({ orgSlug, wsSlug }: { orgSlug: string; wsSlug: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const base = `/o/${orgSlug}/w/${wsSlug}`;
  const items = [
    { to: `${base}` as const, label: "Mission", icon: Home, exact: true },
    { to: `${base}/modules` as const, label: "Moduler", icon: Blocks, exact: false },
    { to: `${base}/settings` as const, label: "Innstillinger", icon: Settings, exact: false },
  ];
  return (
    <nav className="sticky bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid max-w-3xl grid-cols-3">
        {items.map(({ to, label, icon: Icon, exact }) => {
          const active = exact ? pathname === to : pathname.startsWith(to);
          return (
            <a
              key={to}
              href={to}
              className={`flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "scale-110" : ""} transition-transform`} />
              {label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
