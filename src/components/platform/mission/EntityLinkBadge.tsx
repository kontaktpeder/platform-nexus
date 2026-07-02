// EntityLinkBadge — surfaces Knowledge entity links on Mission cards.
// Positive links only in production UI; "no entity" hint reserved for
// dev + /knowledge signal rows (opt-in via `showEmpty`).

import { Link } from "@tanstack/react-router";

type Props = {
  entityName?: string | null;
  entitySlug?: string | null;
  linkSource?: "manual" | "auto" | null;
  compact?: boolean;
  showEmpty?: boolean;
  className?: string;
};

export function EntityLinkBadge({
  entityName,
  entitySlug,
  linkSource,
  compact,
  showEmpty,
  className,
}: Props) {
  if (!entityName) {
    if (!showEmpty) return null;
    return (
      <span
        className={`text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60 ${className ?? ""}`}
      >
        Ingen entity
      </span>
    );
  }

  const label = linkSource === "auto" ? `↳ ${entityName}` : `Koblet til ${entityName}`;

  const base = compact
    ? "text-[11px] text-muted-foreground"
    : "text-xs text-muted-foreground";
  const cls = `${base} ${className ?? ""}`.trim();

  if (entitySlug) {
    return (
      <Link
        to="/knowledge/$slug"
        params={{ slug: entitySlug }}
        className={`${cls} hover:text-foreground hover:underline`}
      >
        {label}
      </Link>
    );
  }

  return <span className={cls}>{label}</span>;
}
