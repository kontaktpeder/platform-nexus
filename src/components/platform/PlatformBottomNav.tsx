import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Sparkles, Inbox, User } from "lucide-react";
import { useReviewInboxCount } from "@/lib/review.hooks";

const ITEMS = [
  { to: "/app" as const, label: "Hjem", icon: Home, exact: false },
  { to: "/mission" as const, label: "Dagens plan", icon: Sparkles, exact: true },
  { to: "/review" as const, label: "Innboks", icon: Inbox, exact: false, showBadge: true },
  { to: "/settings" as const, label: "Meg", icon: User, exact: false },
] as const;

export function PlatformBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const reviewCount = useReviewInboxCount();
  const inboxTotal = reviewCount.data?.total ?? 0;

  return (
    <nav className="sticky bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid max-w-3xl grid-cols-4">
        {ITEMS.map(({ to, label, icon: Icon, exact, showBadge }) => {
          const active = exact ? pathname === to : pathname.startsWith(to);
          const badge = showBadge && inboxTotal > 0 ? inboxTotal : 0;
          return (
            <Link
              key={to}
              to={to}
              className={`relative flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="relative">
                <Icon className={`h-5 w-5 ${active ? "scale-110" : ""} transition-transform`} />
                {badge > 0 && (
                  <span className="absolute -right-2 -top-1 grid min-w-[1rem] place-items-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
