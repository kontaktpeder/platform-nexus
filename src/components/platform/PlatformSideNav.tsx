import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronsLeft, ChevronsRight, Inbox, MapPin, Menu, Sparkles, Users } from "lucide-react";
import { useReviewInboxCount } from "@/lib/review.hooks";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

export const PLATFORM_NAV_ITEMS = [
  { to: "/mission" as const, label: "Mission", icon: Sparkles, exact: true },
  { to: "/kontakter" as const, label: "Kontakter", icon: Users, exact: false },
  { to: "/field" as const, label: "Felt", icon: MapPin, exact: false },
  { to: "/review" as const, label: "Innboks", icon: Inbox, exact: false, showBadge: true },
  { to: "/settings" as const, label: "Mer", icon: Menu, exact: false },
] as const;

export function PlatformSideNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { state, toggleSidebar } = useSidebar();
  const reviewCount = useReviewInboxCount();
  const inboxTotal = reviewCount.data?.total ?? 0;
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" variant="sidebar" className="border-r border-border">
      <SidebarHeader className="border-b border-border/60 px-3 py-4">
        <Link
          to="/mission"
          className={cn(
            "flex items-center gap-2 overflow-hidden rounded-lg px-1 py-1 font-heading text-sm font-semibold tracking-tight text-foreground",
            collapsed && "justify-center",
          )}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
            M
          </span>
          {!collapsed && <span className="truncate">Platform Core</span>}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Navigasjon</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {PLATFORM_NAV_ITEMS.map((item) => {
                const { to, label, icon: Icon, exact } = item;
                const active = exact ? pathname === to : pathname.startsWith(to);
                const showBadge = "showBadge" in item && item.showBadge;
                const badge = showBadge && inboxTotal > 0 ? inboxTotal : 0;
                return (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton asChild isActive={active} tooltip={label}>
                      <Link to={to} aria-current={active ? "page" : undefined}>
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {badge > 0 && (
                      <SidebarMenuBadge className="bg-amber-500 text-white">
                        {badge > 9 ? "9+" : badge}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border/60 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              type="button"
              tooltip={collapsed ? "Utvid meny" : "Lukk meny"}
              onClick={toggleSidebar}
            >
              {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
              <span>{collapsed ? "Utvid" : "Lukk"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
