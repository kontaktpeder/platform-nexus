// Knowledge layer — client-safe types.
// Entities, relationships, and signals model the user's world.
// See docs/UNDERSTANDING.md and docs/KNOWLEDGE.v0.md.

export type EntityType = "person" | "company" | "project" | "goal" | "commitment";

export type EntityRelationshipKind =
  "works_on" | "customer_of" | "member_of" | "owns" | "blocked_by" | "related_to";

export type OwnerContext = "personal" | "peder-enk" | "gold-of-sicily" | "unknown";

export const ANCHOR_SLUGS = ["personal", "peder-enk", "gold-of-sicily"] as const;
export type AnchorSlug = (typeof ANCHOR_SLUGS)[number];
export const ANCHOR_SLUG_SET: ReadonlySet<string> = new Set(ANCHOR_SLUGS);
export function isAnchorSlug(slug: string): slug is AnchorSlug {
  return ANCHOR_SLUG_SET.has(slug);
}

export const OWNER_CONTEXT_LABEL: Record<OwnerContext, string> = {
  personal: "Personlig",
  "peder-enk": "Peder ENK",
  "gold-of-sicily": "Gold of Sicily",
  unknown: "Ukjent",
};

export type EntityMetadata = {
  platform_org_id?: string;
  platform_org_slug?: string | null;
  platform_workspace_id?: string;
  email?: string;
  email_domain?: string;
  role?: string;
  title?: string;
  phone?: string;
  website?: string;
  org_nr?: string;
  address?: string;
  industry?: string;
  external_ref?: string;
  is_anchor?: boolean;
  [key: string]: unknown;
};

export type Entity = {
  id: string;
  user_id: string;
  type: EntityType;
  name: string;
  slug: string;
  importance: number;
  summary: string | null;
  last_seen_at: string | null;
  metadata: EntityMetadata;
  owner_context: OwnerContext;
  created_at: string;
  updated_at: string;
};

export type EntityRelationship = {
  id: string;
  user_id: string;
  from_entity_id: string;
  to_entity_id: string;
  kind: EntityRelationshipKind;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type EntitySignalLinkSource = "manual" | "auto";

export type EntitySignal = {
  id: string;
  user_id: string;
  entity_id: string;
  source: string;
  signal_type: string;
  external_ref: string;
  occurred_at: string | null;
  snippet: string | null;
  created_at: string;
  link_source: EntitySignalLinkSource;
};

export type EntityGraph = {
  root: Entity | null;
  entities: Entity[];
  relationships: EntityRelationship[];
  signals: EntitySignal[];
};

export const ENTITY_TYPES: EntityType[] = ["person", "company", "project", "goal", "commitment"];

export const RELATIONSHIP_KINDS: EntityRelationshipKind[] = [
  "works_on",
  "customer_of",
  "member_of",
  "owns",
  "blocked_by",
  "related_to",
];

export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  person: "Person",
  company: "Company",
  project: "Project",
  goal: "Goal",
  commitment: "Commitment",
};

export const RELATIONSHIP_LABEL: Record<EntityRelationshipKind, string> = {
  works_on: "works on",
  customer_of: "customer of",
  member_of: "member of",
  owns: "owns",
  blocked_by: "blocked by",
  related_to: "related to",
};

/**
 * Norwegian, direction-aware labels for showing a relation from one side.
 * `out` = the viewed entity is from_entity ("Fredrik jobber i …"),
 * `in`  = the viewed entity is to_entity ("… har ansatt Fredrik").
 */
export const RELATIONSHIP_LABEL_NO: Record<EntityRelationshipKind, { out: string; in: string }> = {
  works_on: { out: "jobber med", in: "involverer" },
  customer_of: { out: "kunde av", in: "har kunde" },
  member_of: { out: "jobber i", in: "har ansatt" },
  owns: { out: "eier", in: "eies av" },
  blocked_by: { out: "blokkert av", in: "blokkerer" },
  related_to: { out: "relatert til", in: "relatert til" },
};

export function relationshipLabelNo(kind: string, direction: "out" | "in"): string {
  const entry = RELATIONSHIP_LABEL_NO[kind as EntityRelationshipKind];
  return entry ? entry[direction] : kind;
}
