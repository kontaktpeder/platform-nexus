import { RelationCard } from "@/components/platform/relation/RelationCard";
import type { RelationCardModel } from "@/lib/relation/types";

export function StartHereBlock({
  card,
  onPrimary,
  onDone,
  primaryLabel,
}: {
  card: RelationCardModel;
  onPrimary?: () => void;
  onDone?: () => void;
  primaryLabel?: string;
}) {
  return (
    <RelationCard
      card={card}
      featured
      primaryLabel={primaryLabel ?? "Gå til handling"}
      onPrimary={onPrimary}
      onDone={onDone}
    />
  );
}
