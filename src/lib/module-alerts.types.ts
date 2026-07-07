// Module Contract v1.1 — generic alerts published by any module.
// Platform Core stores no fagdata; alerts are opaque payloads produced
// by the source module and rendered by Mission.

export type ModuleAlertSeverity = "info" | "warning" | "critical";

export type ModuleAlert = {
  id: string;
  severity: ModuleAlertSeverity;
  title: string;
  description?: string;
  action_url?: string | null;
  /** Lower number = higher priority. */
  priority: number;
  /** Module slug that produced the alert (e.g. "finance", "work"). */
  source_module: string;
};

export type ModuleAlertsResponse = {
  contract_version: string;
  alerts: ModuleAlert[];
};

/**
 * Per-workspace alerts map used by Mission.
 * Key: `${moduleSlug}:${alert.id}` — mirrors WidgetDataMap layout.
 */
export type WorkspaceAlertsMap = Record<
  string,
  ModuleAlert & {
    moduleSlug: string;
    moduleName: string;
    connectionHomeUrl: string | null;
  }
>;

export type WorkspaceAlertsResult = {
  alerts: WorkspaceAlertsMap;
  errors: Record<string, string>;
};
