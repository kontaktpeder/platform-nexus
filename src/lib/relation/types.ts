/** Relation workspace — client-safe types (Direction C + A). */

import type { OwnerContext } from "@/lib/knowledge/types";

export type RelationEntityType = "person" | "company";

/** Human status — not CRM pipeline. */
export type RelationStatus =
  | "waiting_on_me"
  | "waiting_on_them"
  | "upcoming"
  | "quiet"
  | "new_unconfirmed"
  | "confirmed";

export const RELATION_STATUS_LABEL: Record<RelationStatus, string> = {
  waiting_on_me: "Venter på meg",
  waiting_on_them: "Venter på dem",
  upcoming: "Neste snart",
  quiet: "Stille",
  new_unconfirmed: "Ny / uavklart",
  confirmed: "Bekreftet",
};

export type RelationSourceKind =
  | "gmail"
  | "slack"
  | "felt"
  | "finance"
  | "work"
  | "ai"
  | "system"
  | "manual";

export const RELATION_SOURCE_LABEL: Record<RelationSourceKind, string> = {
  gmail: "fra Gmail",
  slack: "fra Slack",
  felt: "fra Felt",
  finance: "fra Finance",
  work: "fra Work",
  ai: "foreslått av AI",
  system: "system",
  manual: "manuelt",
};

/** Mission / list card — relation owns the card; source is metadata. */
export type RelationCardModel = {
  id: string;
  entityId: string | null;
  entityType: RelationEntityType | null;
  name: string;
  subtitle: string | null;
  whyNow: string;
  nextAction: string;
  status: RelationStatus;
  ownerContext: OwnerContext | null;
  sourceKind: RelationSourceKind | null;
  sourceLabel: string | null;
  imageUrl: string | null;
  href: string | null;
  priority: "high" | "medium" | "low";
  /** Legacy morning-mission item id for actions until relations payload ships. */
  briefItemId?: string | null;
};

export type RelationBriefing = {
  startHere: RelationCardModel | null;
  needsFollowUp: RelationCardModel[];
  upcoming: RelationCardModel[];
  unresolved: RelationCardModel[];
  system: RelationCardModel[];
};
