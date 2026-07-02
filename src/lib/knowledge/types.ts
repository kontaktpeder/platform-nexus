// Knowledge layer — client-safe types.
// Entities, relationships, and signals model the user's world.
// See docs/UNDERSTANDING.md and docs/KNOWLEDGE.v0.md.

export type EntityType = "person" | "company" | "project" | "goal" | "commitment";

export type EntityRelationshipKind =
  | "works_on"
  | "customer_of"
  | "member_of"
  | "owns"
  | "blocked_by"
  | "related_to";

export type EntityMetadata = {
  platform_org_id?: string;
  platform_org_slug?: string;
  platform_workspace_id?: string;
  email_domain?: string;
  external_ref?: string;
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

export const ENTITY_TYPES: EntityType[] = [
  "person",
  "company",
  "project",
  "goal",
  "commitment",
];

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
