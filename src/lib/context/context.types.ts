// Context Scan v0 — client-safe types.
// See docs/CONTEXT_SCAN.v0.md.

export type ContextScopeType = "global" | "entity" | "project" | "workspace";

export type ContextSourceCounts = {
  signals?: number;
  commitments?: number;
  widgets?: number;
  relationships?: number;
  entities?: number;
};

export type ContextSummary = {
  id: string;
  user_id: string;
  entity_id: string | null;
  scope_type: ContextScopeType;
  scope_ref: string | null;
  summary: string;
  key_facts: string[];
  open_questions: string[];
  suggested_next_focus: string | null;
  source_counts: ContextSourceCounts;
  last_scanned_at: string;
  created_at: string;
  updated_at: string;
};

// ─── Bundles (used server-side to feed AI) ─────────────────────────────────

export type ContextEntityRef = {
  id: string;
  name: string;
  slug: string;
  type: string;
};

export type ContextSignalFact = {
  source: string;
  signalType: string;
  externalRefPrefix: string; // "gmail:" | "slack:dm:" | ...
  occurredAt: string | null;
  snippet: string | null; // only if ≤160 chars and total ≤10 signals
};

export type ContextCommitmentFact = {
  title: string;
  status: string;
  dueDate: string | null;
};

export type ContextWidgetFact = {
  org: string;
  module: string;
  widget: string;
  display: string;
};

export type ContextRelationshipFact = {
  otherName: string;
  kind: string;
  direction: "outgoing" | "incoming";
};

export type ContextEntityBundle = {
  scopeType: "entity" | "project";
  scopeRef: string; // entity slug
  entity: ContextEntityRef & {
    importance: number;
    summary: string | null;
    metadataKeys: string[];
    lastActivityAt: string | null;
  };
  signals: ContextSignalFact[];
  commitments: ContextCommitmentFact[];
  relationships: ContextRelationshipFact[];
  widgets: ContextWidgetFact[];
  actionStateCounts: { dismissed7d: number; snoozed7d: number };
  insufficient: boolean;
  sourceCounts: ContextSourceCounts;
};

export type ContextGlobalBundle = {
  scopeType: "global";
  scopeRef: null;
  entityCountsByType: Record<string, number>;
  openCommitments: ContextCommitmentFact[]; // max 5
  recentSignalsCount7d: number;
  actionStateCounts: { dismissed7d: number; snoozed7d: number };
  widgets: ContextWidgetFact[];
  sourceCounts: ContextSourceCounts;
  insufficient: boolean;
};

export type ContextScanBundle = ContextGlobalBundle | ContextEntityBundle;
