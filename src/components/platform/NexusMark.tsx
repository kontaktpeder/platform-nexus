import { cn } from "@/lib/utils";

const SIZE = {
  sm: "h-8 w-8",
  md: "h-12 w-12",
  lg: "h-16 w-16",
  hero: "h-28 w-28 sm:h-32 sm:w-32",
} as const;

type NexusMarkSize = keyof typeof SIZE;

/**
 * Chrome sphere mark — hero on Desk, compact in chrome.
 * Liquid-metal orb = NEXUS brand anchor.
 */
export function NexusMark({
  size = "md",
  pulse = false,
  className,
  alt = "Nexus",
}: {
  size?: NexusMarkSize;
  /** Soft breathe while the agent works / active home */
  pulse?: boolean;
  className?: string;
  alt?: string;
}) {
  const src = size === "sm" || size === "md" ? "/nexus-mark-128.png" : "/nexus-mark.png";

  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center",
        SIZE[size],
        className,
      )}
      aria-hidden={alt === "" ? true : undefined}
    >
      {pulse && (
        <span
          className="absolute inset-[-22%] rounded-full bg-[radial-gradient(circle,oklch(0.65_0.1_220/0.45)_0%,transparent_68%)] animate-pulse"
          aria-hidden
        />
      )}
      <img
        src={src}
        alt={alt}
        width={size === "hero" ? 128 : size === "lg" ? 64 : size === "md" ? 44 : 32}
        height={size === "hero" ? 128 : size === "lg" ? 64 : size === "md" ? 44 : 32}
        draggable={false}
        className={cn(
          "relative h-full w-full rounded-full object-cover",
          "shadow-[0_10px_32px_-8px_oklch(0.3_0.08_230/0.55),0_2px_8px_oklch(0_0_0/0.2)]",
          "ring-1 ring-white/15",
          pulse && "animate-[nexus-breathe_2.4s_ease-in-out_infinite]",
        )}
      />
    </span>
  );
}
