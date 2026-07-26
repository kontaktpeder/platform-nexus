import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { RelationAvatar } from "@/components/platform/relation/RelationAvatar";
import { OwnerContextChip } from "@/components/platform/relation/OwnerContextChip";
import { RelationStatusBadge } from "@/components/platform/relation/RelationStatusBadge";
import { RELATION_SOURCE_LABEL, type RelationCardModel } from "@/lib/relation/types";
import { cn } from "@/lib/utils";

const PRIORITY_LABEL: Record<RelationCardModel["priority"], string> = {
  high: "Høy prioritet",
  medium: "Medium",
  low: "Lav",
};

export function RelationCard({
  card,
  featured = false,
  primaryLabel = "Neste steg",
  onPrimary,
  onDone,
  className,
}: {
  card: RelationCardModel;
  featured?: boolean;
  primaryLabel?: string;
  onPrimary?: () => void;
  onDone?: () => void;
  className?: string;
}) {
  const source =
    card.sourceLabel ||
    (card.sourceKind ? RELATION_SOURCE_LABEL[card.sourceKind] : null);

  if (featured) {
    return (
      <article
        className={cn(
          "rounded-2xl border-2 border-primary/25 bg-card p-5 shadow-md",
          className,
        )}
      >
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
          Start her
        </p>
        <div className="flex items-start gap-3">
          <RelationAvatar
            name={card.name}
            imageUrl={card.imageUrl}
            entityType={card.entityType}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-semibold leading-tight">{card.name}</h3>
              <RelationStatusBadge status={card.status} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {card.subtitle && (
                <p className="text-sm text-muted-foreground">{card.subtitle}</p>
              )}
              <OwnerContextChip ownerContext={card.ownerContext} />
            </div>
            {source && (
              <p className="mt-1 text-[11px] text-muted-foreground/80">{source}</p>
            )}
          </div>
        </div>
        <p className="mt-4 text-sm leading-snug text-foreground/90">{card.whyNow}</p>
        {card.nextAction && (
          <p className="mt-2 text-sm font-medium text-foreground">
            Neste: {card.nextAction}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {onPrimary && (
            <Button
              type="button"
              className="h-12 min-w-[10rem] flex-1 rounded-xl text-sm font-semibold"
              onClick={onPrimary}
            >
              {primaryLabel}
            </Button>
          )}
          {card.entityId ? (
            <Button variant="outline" className="h-12 flex-1 rounded-xl text-sm" asChild>
              <Link to="/kontakter/$entityId" params={{ entityId: card.entityId }}>
                Se detalj
              </Link>
            </Button>
          ) : null}
          {onDone && (
            <Button
              type="button"
              variant="ghost"
              className="h-12 rounded-xl text-sm text-muted-foreground"
              onClick={onDone}
            >
              Ferdig
            </Button>
          )}
        </div>
      </article>
    );
  }

  // Mockup list row — avatar left, copy center, CTA + priority right
  return (
    <article
      className={cn(
        "rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/30",
        className,
      )}
    >
      <div className="flex items-start gap-3 sm:items-center">
        <RelationAvatar
          name={card.name}
          imageUrl={card.imageUrl}
          entityType={card.entityType}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold leading-tight">{card.name}</h3>
            <RelationStatusBadge status={card.status} />
            <OwnerContextChip ownerContext={card.ownerContext} />
          </div>
          {card.subtitle && (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{card.subtitle}</p>
          )}
          <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-foreground/85">
            {card.whyNow}
          </p>
          {source && (
            <p className="mt-1 text-[11px] text-muted-foreground/70">{source}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wide",
              card.priority === "high" ? "text-primary" : "text-muted-foreground",
            )}
          >
            {PRIORITY_LABEL[card.priority]}
          </span>
          {onPrimary && (
            <Button
              type="button"
              size="sm"
              className="h-10 rounded-xl px-4 text-xs font-semibold sm:text-sm"
              onClick={onPrimary}
            >
              {primaryLabel}
            </Button>
          )}
          {card.entityId ? (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground" asChild>
              <Link to="/kontakter/$entityId" params={{ entityId: card.entityId }}>
                Se detalj
              </Link>
            </Button>
          ) : null}
          {onDone && (
            <button
              type="button"
              className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
              onClick={onDone}
            >
              Ferdig
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
