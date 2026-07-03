// Server-only: derive verbatim ContextWidgetFacts from a MissionSnapshot.
// Uses same widget keys as mission-actions.ts ("moduleSlug:widgetId"), so the
// Context Scan can NEVER report a different number than /mission shows.
// If a widget is missing, empty, or errored, status is "unknown"/"error" —
// we NEVER emit "0" as a made-up value.

import type { MissionSnapshot } from "@/lib/mission-snapshot.server";
import type { ContextWidgetFact } from "./context.types";
import { parseCount, parseHours, type MissionAction } from "@/lib/mission-actions";

// Widgets Context Scan tracks. Superset of mission-actions RULES to also
// include informational widgets (revenue etc.) that Mission may or may not show.
type Spec = {
  moduleSlug: string;
  widgetId: string;
  kind: "hours" | "count" | "text";
};

const SPECS: Spec[] = [
  { moduleSlug: "finance", widgetId: "unpaid_invoices", kind: "count" },
  { moduleSlug: "finance", widgetId: "month_revenue", kind: "text" },
  { moduleSlug: "work", widgetId: "today_hours", kind: "hours" },
  { moduleSlug: "work", widgetId: "active_projects", kind: "count" },
];

function extractValue(display: string, kind: Spec["kind"]): number | null {
  if (kind === "hours") return parseHours(display);
  if (kind === "count") return parseCount(display);
  return null;
}

export function normalizeWidgetFactsFromSnapshot(
  snapshot: MissionSnapshot,
): ContextWidgetFact[] {
  const facts: ContextWidgetFact[] = [];
  for (const ws of snapshot.workspaces) {
    const actionKey = `${ws.orgSlug}/${ws.wsSlug}`;
    const wsActions: MissionAction[] = snapshot.workspaceActions[actionKey] ?? [];
    for (const spec of SPECS) {
      const key = `${spec.moduleSlug}:${spec.widgetId}`;
      const datum = ws.widgetData?.[key];
      const sourceRef = `${ws.orgSlug}:${ws.wsSlug}:${key}`;
      const actionTitle =
        wsActions.find((a) => a.key === key)?.title ?? null;

      if (!datum) {
        facts.push({
          source: "widget",
          sourceRef,
          orgSlug: ws.orgSlug,
          orgName: ws.orgName,
          wsSlug: ws.wsSlug,
          wsName: ws.wsName,
          moduleSlug: spec.moduleSlug,
          widgetId: spec.widgetId,
          displayValue: null,
          extractedValue: null,
          status: "unknown",
          note: null,
          missionActionTitle: actionTitle,
        });
        continue;
      }
      if (datum.error) {
        facts.push({
          source: "widget",
          sourceRef,
          orgSlug: ws.orgSlug,
          orgName: ws.orgName,
          wsSlug: ws.wsSlug,
          wsName: ws.wsName,
          moduleSlug: spec.moduleSlug,
          widgetId: spec.widgetId,
          displayValue: null,
          extractedValue: null,
          status: "error",
          note: String(datum.error).slice(0, 160),
          missionActionTitle: actionTitle,
        });
        continue;
      }
      const display = datum.display ? String(datum.display).trim() : "";
      if (!display) {
        facts.push({
          source: "widget",
          sourceRef,
          orgSlug: ws.orgSlug,
          orgName: ws.orgName,
          wsSlug: ws.wsSlug,
          wsName: ws.wsName,
          moduleSlug: spec.moduleSlug,
          widgetId: spec.widgetId,
          displayValue: null,
          extractedValue: null,
          status: "unknown",
          note: null,
          missionActionTitle: actionTitle,
        });
        continue;
      }
      facts.push({
        source: "widget",
        sourceRef,
        orgSlug: ws.orgSlug,
        orgName: ws.orgName,
        wsSlug: ws.wsSlug,
        wsName: ws.wsName,
        moduleSlug: spec.moduleSlug,
        widgetId: spec.widgetId,
        displayValue: display.slice(0, 120),
        extractedValue: extractValue(display, spec.kind),
        status: "ok",
        note: null,
        missionActionTitle: actionTitle,
      });
    }
  }
  return facts;
}

export function widgetSourcesFromFacts(
  facts: ContextWidgetFact[],
): Set<string> {
  const s = new Set<string>();
  for (const f of facts) if (f.status === "ok") s.add(f.moduleSlug);
  return s;
}
