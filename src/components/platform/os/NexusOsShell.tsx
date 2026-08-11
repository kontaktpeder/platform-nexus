import type { CSSProperties, ReactNode } from "react";
import { NexusOsBottomNav } from "@/components/platform/os/NexusOsBottomNav";
import { NexusOsSideNav } from "@/components/platform/os/NexusOsSideNav";
import { WeekFocusHost } from "@/components/platform/os/WeekFocusHost";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useDayAtmosphere } from "@/hooks/useDayAtmosphere";
import { isDarkPhase } from "@/lib/os/day-atmosphere";
import { OsRailProvider } from "@/lib/os/os-rail-context";
import { cn } from "@/lib/utils";

/**
 * OS shell — charcoal nav + living day-atmosphere canvas.
 * Desktop: side nav. Mobile: bottom dock. Background follows the clock.
 * Evening/night flip canvas text tokens so content stays readable.
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
  const atmosphere = useDayAtmosphere();
  const dark = isDarkPhase(atmosphere.phase);

  return (
    <OsRailProvider>
      <TooltipProvider delayDuration={200}>
        <div
          className={cn("flex h-dvh w-full overflow-hidden", className)}
          data-day-phase={atmosphere.phase}
          style={
            {
              "--os-atmosphere": atmosphere.gradient,
              "--os-blob-a": atmosphere.blobA,
              "--os-blob-b": atmosphere.blobB,
              "--os-blob-c": atmosphere.blobC,
              "--os-hero": atmosphere.hero,
              "--os-glow": atmosphere.glow,
            } as CSSProperties
          }
        >
          <div className="hidden md:flex">
            <NexusOsSideNav />
          </div>
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 transition-[background] duration-[2000ms] ease-in-out"
              style={{ background: "var(--os-atmosphere)" }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -left-24 -top-24 size-[28rem] animate-[os-drift_28s_ease-in-out_infinite] rounded-full blur-3xl transition-colors duration-[2000ms]"
              style={{ background: "var(--os-blob-a)" }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 top-1/4 size-[22rem] animate-[os-drift_36s_ease-in-out_infinite_reverse] rounded-full blur-3xl transition-colors duration-[2000ms]"
              style={{ background: "var(--os-blob-b)" }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-0 left-1/3 size-[24rem] animate-[os-drift_32s_ease-in-out_infinite] rounded-full blur-3xl transition-colors duration-[2000ms]"
              style={{ background: "var(--os-blob-c)" }}
            />
            <div
              className={cn(
                "os-phase-canvas relative flex min-h-0 min-w-0 flex-1 flex-col",
                dark && "os-phase-dark",
                lockMainScroll ? "overflow-hidden" : "overflow-y-auto",
              )}
            >
              {children}
            </div>
            <div className="md:hidden">
              <NexusOsBottomNav />
            </div>
            <WeekFocusHost />
          </div>
        </div>
      </TooltipProvider>
    </OsRailProvider>
  );
}
