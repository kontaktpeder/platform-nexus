import { Link, useRouterState } from "@tanstack/react-router";
import { Inbox, MapPin, Menu, Sparkles, Users } from "lucide-react";
import { useReviewInboxCount } from "@/lib/review.hooks";

const ITEMS = [
  { to: "/mission" as const, label: "Mission", icon: Sparkles, exact: true },
  { to: "/kontakter" as const, label: "Kontakter", icon: Users, exact: false },
  { to: "/field" as const, label: "Felt", icon: MapPin, exact: false },
  { to: "/review" as const, label: "Innboks", icon: Inbox, exact: false, showBadge: true },
  { to: "/settings" as const, label: "Mer", icon: Menu, exact: false },
] as const;

export function PlatformBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const reviewCount = useReviewInboxCount();
  const inboxTotal = reviewCount.data?.total ?? 0;

  return (
    <nav
      aria-label="Hovednavigasjon"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/85"
    >
      <div className="mx-auto grid max-w-3xl grid-cols-5 px-1">
        {ITEMS.map((item) => {
          const { to, label, icon: Icon, exact } = item;
          const active = exact ? pathname === to : pathname.startsWith(to);
          const showBadge = "showBadge" in item && item.showBadge;
          const badge = showBadge && inboxTotal > 0 ? inboxTotal : 0;
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium transition-colors active:bg-muted sm:text-xs ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="relative">
                <Icon
                  aria-hidden="true"
                  className={`h-5 w-5 ${active ? "scale-110" : ""} transition-transform`}
                />
                {badge > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-none text-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </span>
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
