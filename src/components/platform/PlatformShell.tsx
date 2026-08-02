import type { ReactNode } from "react";
import { PlatformBottomNav } from "@/components/platform/PlatformBottomNav";
import { PlatformSideNav } from "@/components/platform/PlatformSideNav";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * App shell: desktop left sidebar; mobile docked bottom nav.
 * Only the main column scrolls — top/bottom chrome stay put in PWA.
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
      <div className={cn("flex h-dvh w-full overflow-hidden bg-background", className)}>
        <div className="hidden md:block">
          <PlatformSideNav />
        </div>
        <SidebarInset className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className={cn("flex h-full min-h-0 flex-col", contentClassName)}>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
              {children}
            </div>
            {!hideMobileNav && (
              <div className="md:hidden">
                <PlatformBottomNav mode="inline" />
              </div>
            )}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
