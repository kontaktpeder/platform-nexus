import { Link, useRouterState } from "@tanstack/react-router";
import {
  Blocks,
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  UserRound,
  Users,
} from "lucide-react";
import { NexusMark } from "@/components/platform/NexusMark";
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

/** Desktop sidebar for non-OS routes (kontakter, modules, profil). /desk uses NexusOsSideNav. */
export const PLATFORM_NAV_ITEMS = [
  { to: "/desk" as const, label: "I dag", icon: LayoutDashboard, exact: false },
  { to: "/kontakter" as const, label: "Kontakter", icon: Users, exact: false },
  { to: "/modules" as const, label: "Moduler", icon: Blocks, exact: false },
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
          search={{ kontekst: "hele" }}
          aria-label="Nexus"
          className={cn(
            "flex items-center gap-2 overflow-hidden rounded-lg px-1 py-1 font-heading text-sm font-semibold tracking-tight text-foreground",
            collapsed && "justify-center",
          )}
        >
          <NexusMark size="sm" alt="" />
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
                const active = exact
                  ? pathname === to
                  : to === "/desk"
                    ? pathname === "/desk" || pathname.startsWith("/desk/")
                    : pathname.startsWith(to);
                return (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton asChild isActive={active} tooltip={label}>
                      <Link
                        to={to}
                        search={to === "/desk" ? { kontekst: "hele" } : undefined}
                        aria-current={active ? "page" : undefined}
                      >
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
