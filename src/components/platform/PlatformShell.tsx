import type { ReactNode } from "react";
import { PlatformBottomNav } from "@/components/platform/PlatformBottomNav";
import { PlatformSideNav } from "@/components/platform/PlatformSideNav";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * Desktop: left sidebar (collapsible to icons). Mobile: bottom nav.
 */
export function PlatformShell({
  children,
  className,
  contentClassName,
  hideMobileNav = false,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Full-screen capture flows hide bottom tabs on mobile. */
  hideMobileNav?: boolean;
}) {
  return (
    <SidebarProvider defaultOpen>
      <div className={cn("flex min-h-svh w-full bg-background", className)}>
        <div className="hidden md:block">
          <PlatformSideNav />
        </div>
        <SidebarInset className="min-w-0 flex-1">
          <div
            className={cn(
              "flex min-h-svh flex-col",
              hideMobileNav ? "pb-0" : "pb-20 md:pb-0",
              contentClassName,
            )}
          >
            {children}
          </div>
          {!hideMobileNav && (
            <div className="md:hidden">
              <PlatformBottomNav />
            </div>
          )}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
