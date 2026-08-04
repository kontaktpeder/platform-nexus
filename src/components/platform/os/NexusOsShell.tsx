import type { ReactNode } from "react";
import { NexusOsSideNav } from "@/components/platform/os/NexusOsSideNav";
import { cn } from "@/lib/utils";

/**
 * Desktop OS shell for NEXUS life/portfolio dashboards.
 * Charcoal sidebar + ivory content — mobile keeps /hjem capture.
 */
export function NexusOsShell({
  children,
  className,
  lockMainScroll = false,
}: {
  children: ReactNode;
  className?: string;
  lockMainScroll?: boolean;
}) {
  return (
    <div className={cn("flex h-dvh w-full overflow-hidden bg-background", className)}>
      <div className="hidden md:flex">
        <NexusOsSideNav />
      </div>
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col",
          lockMainScroll ? "overflow-hidden" : "overflow-y-auto",
        )}
      >
        {children}
      </div>
    </div>
  );
}
