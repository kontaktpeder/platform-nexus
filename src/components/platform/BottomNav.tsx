import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Blocks, Settings } from "lucide-react";

export function BottomNav({ orgSlug, wsSlug }: { orgSlug: string; wsSlug: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = [
    {
      to: "/o/$orgSlug/w/$wsSlug" as const,
      params: { orgSlug, wsSlug },
      label: "Oversikt",
      icon: LayoutDashboard,
      exact: true,
    },
    {
      to: "/o/$orgSlug/w/$wsSlug/modules" as const,
      params: { orgSlug, wsSlug },
      label: "Moduler",
      icon: Blocks,
      exact: false,
    },
    {
      to: "/o/$orgSlug/w/$wsSlug/settings" as const,
      params: { orgSlug, wsSlug },
      label: "Utseende",
      icon: Settings,
      exact: false,
    },
  ] as const;

  return (
    <nav className="sticky bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid max-w-3xl grid-cols-3">
        {items.map(({ to, params, label, icon: Icon, exact }) => {
          const href = to
            .replace("$orgSlug", orgSlug)
            .replace("$wsSlug", wsSlug);
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={to}
              to={to}
              params={params}
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
