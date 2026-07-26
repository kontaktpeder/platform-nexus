import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { RelationAvatar } from "@/components/platform/relation/RelationAvatar";
import { OwnerContextChip } from "@/components/platform/relation/OwnerContextChip";
import { RelationStatusBadge } from "@/components/platform/relation/RelationStatusBadge";
import { RELATION_SOURCE_LABEL, type RelationCardModel } from "@/lib/relation/types";
import { cn } from "@/lib/utils";

export function RelationCard({
  card,
  featured = false,
  primaryLabel = "Neste steg",
  onPrimary,
  className,
}: {
  card: RelationCardModel;
  featured?: boolean;
  primaryLabel?: string;
  onPrimary?: () => void;
  className?: string;
}) {
  const source =
    card.sourceLabel ||
    (card.sourceKind ? RELATION_SOURCE_LABEL[card.sourceKind] : null);

  return (
    <article
      className={cn(
        "rounded-2xl border border-border bg-card shadow-sm",
        featured ? "p-5" : "p-4",
        className,
      )}
    >
      {featured && (
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
          Start her
        </p>
      )}

      <div className="flex items-start gap-3">
        <RelationAvatar
          name={card.name}
          imageUrl={card.imageUrl}
          entityType={card.entityType}
          size={featured ? "lg" : "md"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={cn(
                "truncate font-semibold leading-tight",
                featured ? "text-xl" : "text-base",
              )}
            >
              {card.name}
            </h3>
            <RelationStatusBadge status={card.status} />
            <OwnerContextChip ownerContext={card.ownerContext} />
          </div>
          {card.subtitle && (
            <p className="mt-0.5 text-sm text-muted-foreground">{card.subtitle}</p>
          )}
          {source && (
            <p className="mt-1 text-[11px] text-muted-foreground/80">{source}</p>
          )}
        </div>
      </div>

      <p className={cn("text-sm leading-snug text-foreground/90", featured ? "mt-4" : "mt-3")}>
        {card.whyNow}
      </p>

      {card.nextAction && (
        <div className="mt-3 rounded-xl bg-muted/50 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Anbefalt neste handling
          </p>
          <p className="mt-0.5 text-sm font-medium">{card.nextAction}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {onPrimary && (
          <Button
            type="button"
            className="h-11 flex-1 rounded-xl text-sm"
            onClick={onPrimary}
          >
            {primaryLabel}
          </Button>
        )}
        {card.entityId ? (
          <Button variant="outline" className="h-11 flex-1 rounded-xl text-sm" asChild>
            <Link to="/kontakter/$entityId" params={{ entityId: card.entityId }}>
              Se detalj
            </Link>
          </Button>
        ) : card.href ? (
          <Button variant="outline" className="h-11 flex-1 rounded-xl text-sm" asChild>
            <a href={card.href}>Se detalj</a>
          </Button>
        ) : null}
      </div>
    </article>
  );
}
