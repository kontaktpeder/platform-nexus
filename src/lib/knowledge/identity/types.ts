// Client-safe types for the known_identities layer.

export type IdentityType =
  | "email_address"
  | "email_domain"
  | "slack_user"
  | "slack_channel"
  | "external_account";

export type IdentityRole =
  | "sender"
  | "recipient"
  | "cc"
  | "mentioned"
  | "channel"
  | "domain"
  | "participant";

export type SuggestionReason =
  | "frequent_contact"
  | "mission_relevance"
  | "cross_source_match"
  | "relationship_detected"
  | "manual_review"
  | "legacy_cluster";

export type KnownIdentity = {
  id: string;
  user_id: string;
  identity_type: IdentityType;
  provider: string;
  external_key: string;
  display_name: string | null;
  handle: string | null;
  email: string | null;
  domain: string | null;
  first_seen_at: string;
  last_seen_at: string;
  seen_count: number;
  metadata: Record<string, unknown>;
  entity_id: string | null;
  ignored_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExtractedIdentity = {
  provider: string;
  identityType: IdentityType;
  externalKey: string;
  role: IdentityRole;
  displayName?: string | null;
  handle?: string | null;
  email?: string | null;
  domain?: string | null;
  confidence?: number | null;
};
