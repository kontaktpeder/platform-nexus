// Context Scan v1 — client-safe types.
// See docs/CONTEXT_SCAN.v1.md.

export type ContextScopeType = "global" | "entity" | "project" | "workspace";

export type ContextSource =
  | "gmail"
  | "slack"
  | "finance"
  | "work"
  | "commitments"
  | "mission"
  | "widgets"
  | "signals"
  | "relationships";

export type ContextSourceCounts = {
  signals?: number;
  commitments?: number;
  widgets?: number;
  relationships?: number;
  entities?: number;
  missionActions?: number;
};

export type ContextWidgetFactStatus = "ok" | "error" | "unknown";

export type ContextFactProvenance = {
  source: "widget" | "commitment" | "signal" | "mission";
  sourceRef: string;
  displayValue: string | null;
  extractedValue: number | null;
  status: ContextWidgetFactStatus;
  note?: string | null;
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
  included_sources: ContextSource[];
  fact_provenance: ContextFactProvenance[];
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
  externalRefPrefix: string;
  occurredAt: string | null;
  snippet: string | null;
  linkedEntityName?: string | null;
};

export type ContextCommitmentFact = {
  title: string;
  status: string;
  dueDate: string | null;
};

// v1: verbatim display values with explicit status. Never fake "0".
export type ContextWidgetFact = {
  source: "widget";
  sourceRef: string; // e.g. "gold-of-sicily:default:work:today_hours"
  orgSlug: string;
  orgName: string;
  wsSlug: string;
  wsName: string;
  moduleSlug: string;
  widgetId: string;
  displayValue: string | null; // exact string Mission would show
  extractedValue: number | null;
  status: ContextWidgetFactStatus;
  note?: string | null;
  missionActionTitle?: string | null;
};

export type ContextRelationshipFact = {
  otherName: string;
  kind: string;
  direction: "outgoing" | "incoming";
};

export type ContextMissionActionFact = {
  title: string;
  description: string;
  source: string;
  tier: string;
  entityName?: string | null;
};

export type ContextEntityBundle = {
  scopeType: "entity" | "project";
  scopeRef: string;
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
  missionActions: ContextMissionActionFact[];
  actionStateCounts: { dismissed7d: number; snoozed7d: number };
  insufficient: boolean;
  sourceCounts: ContextSourceCounts;
  includedSources: ContextSource[];
};

export type ContextWorkspaceBundle = {
  scopeType: "workspace";
  scopeRef: string; // `${orgSlug}/${wsSlug}`
  orgSlug: string;
  orgName: string;
  wsSlug: string;
  wsName: string;
  widgets: ContextWidgetFact[];
  missionActions: ContextMissionActionFact[];
  signals: ContextSignalFact[];
  insufficient: boolean;
  sourceCounts: ContextSourceCounts;
  includedSources: ContextSource[];
};

export type ContextGlobalBundle = {
  scopeType: "global";
  scopeRef: null;
  entityCountsByType: Record<string, number>;
  activeEntityNames: string[]; // max 8
  openCommitments: ContextCommitmentFact[];
  recentSignalsCount30d: number;
  actionStateCounts: { dismissed7d: number; snoozed7d: number };
  widgets: ContextWidgetFact[];
  missionActions: ContextMissionActionFact[];
  sourceCounts: ContextSourceCounts;
  insufficient: boolean;
  includedSources: ContextSource[];
};

export type ContextScanBundle =
  | ContextGlobalBundle
  | ContextEntityBundle
  | ContextWorkspaceBundle;
