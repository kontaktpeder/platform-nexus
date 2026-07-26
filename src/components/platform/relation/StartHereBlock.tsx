import { RelationCard } from "@/components/platform/relation/RelationCard";
import type { RelationCardModel } from "@/lib/relation/types";

export function StartHereBlock({
  card,
  onPrimary,
  primaryLabel,
}: {
  card: RelationCardModel;
  onPrimary?: () => void;
  primaryLabel?: string;
}) {
  return (
    <StartHereBlockInner
      card={card}
      onPrimary={onPrimary}
      primaryLabel={primaryLabel}
    />
  );
}

function StartHereBlockInner(props: {
  card: RelationCardModel;
  onPrimary?: () => void;
  primaryLabel?: string;
}) {
  return (
    <RelationCard
      {...props}
      featured
      primaryLabel={props.primaryLabel ?? "Gå til handling"}
    />
  );
}
