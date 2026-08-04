import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function OsCard({
  children,
  className,
  title,
  subtitle,
  footer,
  tone = "glass",
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  footer?: string;
  /** glass = frosted white; hero = day-atmosphere wash; soft = tinted wash */
  tone?: "glass" | "hero" | "soft" | "solid";
}) {
  const isHero = tone === "hero";

  return (
    <section
      className={cn(
        "flex flex-col rounded-2xl p-5 transition-shadow duration-300",
        tone === "glass" && "os-glass",
        tone === "solid" && "border border-border/60 bg-card shadow-soft",
        tone === "hero" && "os-hero-wash shadow-lift border-0",
        tone === "soft" &&
          "border border-white/40 bg-white/55 shadow-soft backdrop-blur-md",
        className,
      )}
    >
      {(title || subtitle) && (
        <header className="mb-4 shrink-0">
          {title && (
            <h2
              className={cn(
                "font-heading text-base font-semibold tracking-tight",
                isHero ? "text-white" : "text-foreground",
              )}
            >
              {title}
            </h2>
          )}
          {subtitle && (
            <p
              className={cn(
                "mt-0.5 text-sm",
                isHero ? "text-white/80" : "text-muted-foreground",
              )}
            >
              {subtitle}
            </p>
          )}
        </header>
      )}
      <div className="min-h-0 flex-1">{children}</div>
      {footer && (
        <button
          type="button"
          className={cn(
            "mt-4 inline-flex items-center gap-0.5 text-sm font-medium transition-colors",
            isHero
              ? "text-white/90 hover:text-white"
              : "text-primary hover:text-primary/80",
          )}
        >
          {footer}
          <ChevronRight className="size-3.5" />
        </button>
      )}
    </section>
  );
}

export function StatusDot({
  status,
  className,
}: {
  status: "ok" | "watch" | "risk";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        status === "ok" && "bg-success",
        status === "watch" && "bg-warning",
        status === "risk" && "bg-destructive",
        className,
      )}
    />
  );
}

export function ProgressBar({
  pct,
  className,
  tone = "primary",
}: {
  pct: number;
  className?: string;
  tone?: "primary" | "success" | "warning";
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500",
          tone === "primary" && "bg-primary",
          tone === "success" && "bg-success",
          tone === "warning" && "bg-warning",
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function RingProgress({
  pct,
  size = 56,
  stroke = 5,
  children,
  className,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c - (clamped / 100) * c;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center text-center">
          {children}
        </div>
      )}
    </div>
  );
}

export function Sparkline({
  values,
  className,
  stroke = "var(--primary)",
}: {
  values: number[];
  className?: string;
  stroke?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 120;
  const h = 40;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("h-10 w-full", className)}
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  );
}

export function Initials({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary",
        className,
      )}
    >
      {value.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function DeltaBadge({
  value,
  good = true,
}: {
  value: string;
  good?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-xs font-medium",
        good ? "text-success" : "text-destructive",
      )}
    >
      {value}
    </span>
  );
}
