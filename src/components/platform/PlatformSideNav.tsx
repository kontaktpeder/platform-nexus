import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronsLeft, ChevronsRight, LayoutDashboard, UserRound, Users } from "lucide-react";
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

/** Desktop sidebar — Desk is primary. Mobile capture Hjem lives in bottom nav only. */
export const PLATFORM_NAV_ITEMS = [
  { to: "/desk" as const, label: "Desk", icon: LayoutDashboard, exact: true },
  { to: "/kontakter" as const, label: "Kontakter", icon: Users, exact: false },
  { to: "/profil" as const, label: "Profil", icon: UserRound, exact: false },
] as const;

export function PlatformSideNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" variant="sidebar" className="border-r border-border">
      <SidebarHeader className="border-b border-border/60 px-3 py-4">
        <Link
          to="/desk"
          className={cn(
            "flex items-center gap-2 overflow-hidden rounded-lg px-1 py-1 font-heading text-sm font-semibold tracking-tight text-foreground",
            collapsed && "justify-center",
          )}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
            N
          </span>
          {!collapsed && <span className="truncate">Nexus</span>}
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
                return (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton asChild isActive={active} tooltip={label}>
                      <Link to={to} aria-current={active ? "page" : undefined}>
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
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
