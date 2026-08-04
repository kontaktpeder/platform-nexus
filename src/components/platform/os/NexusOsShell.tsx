import type { CSSProperties, ReactNode } from "react";
import { NexusOsSideNav } from "@/components/platform/os/NexusOsSideNav";
import { useDayAtmosphere } from "@/hooks/useDayAtmosphere";
import { cn } from "@/lib/utils";

/**
 * Desktop OS shell — charcoal nav + living day-atmosphere canvas.
 * Background gradient and color blobs follow the clock.
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

  return (
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
      <div
        className={cn(
          "relative flex min-h-0 min-w-0 flex-1 flex-col",
          lockMainScroll ? "overflow-hidden" : "overflow-y-auto",
        )}
      >
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
        {children}
      </div>
    </div>
  );
}
