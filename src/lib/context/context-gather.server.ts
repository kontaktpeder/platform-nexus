// Context Scan v1 — build sanitized ContextScanBundles from the shared
// MissionSnapshot. Widget numbers are verbatim what /mission shows.
// Coverage extends to workspace bundles and entities that are only
// referenced via entityLinks / commitments (last 30 days).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  ContextScanBundle,
  ContextGlobalBundle,
  ContextEntityBundle,
  ContextWorkspaceBundle,
  ContextSignalFact,
  ContextCommitmentFact,
  ContextRelationshipFact,
  ContextMissionActionFact,
  ContextWidgetFact,
  ContextSource,
} from "./context.types";
import type { MissionSnapshot } from "@/lib/mission-snapshot.server";
import type { Entity } from "@/lib/knowledge/types";
import {
  normalizeWidgetFactsFromSnapshot,
  widgetSourcesFromFacts,
} from "./context-widget-facts.server";

type DB = SupabaseClient<Database>;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function refPrefix(externalRef: string): string {
  if (externalRef.startsWith("gmail:")) return "gmail:";
  if (externalRef.startsWith("slack:dm:")) return "slack:dm:";
  if (externalRef.startsWith("slack:mention:")) return "slack:mention:";
  if (externalRef.startsWith("slack:")) return "slack:";
  if (externalRef.startsWith("ws:")) return "ws:";
  const i = externalRef.indexOf(":");
  return i >= 0 ? externalRef.slice(0, i + 1) : "";
}

function sourceForSignal(source: string): ContextSource | null {
  if (source === "gmail") return "gmail";
  if (source === "slack") return "slack";
  return null;
}

async function resolveActiveEntityIds(
  supabase: DB,
  userId: string,
  snapshot: MissionSnapshot,
): Promise<Set<string>> {
  const active = new Set<string>();

  // 1. From entityLinks (current inbox actions).
  for (const link of Object.values(snapshot.entityLinks ?? {})) {
    if (link?.entityId) active.add(link.entityId);
  }

  // 2. From global actions with entityId.
  for (const a of snapshot.globalActions) {
    if (a.entityId) active.add(a.entityId);
  }

  // 3. From open/suggested commitments.
  for (const c of snapshot.openCommitments) {
    if (c.entity_id) active.add(c.entity_id);
  }

  // 4. From entity_signals last 30 days (occurred_at, not created_at).
  const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
  const { data: recent } = await supabase
    .from("entity_signals")
    .select("entity_id, occurred_at, created_at")
    .eq("user_id", userId)
    .or(`occurred_at.gte.${since},created_at.gte.${since}`);
  for (const r of recent ?? []) {
    if (r.entity_id) active.add(r.entity_id as string);
  }

  return active;
}

export async function buildContextBundlesFromSnapshot(
  snapshot: MissionSnapshot,
  supabase: DB,
  userId: string,
): Promise<ContextScanBundle[]> {
  const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

  // ── Widgets (verbatim from snapshot) ─────────────────────────────────────
  const allWidgetFacts = normalizeWidgetFactsFromSnapshot(snapshot);
  const widgetsByWs = new Map<string, ContextWidgetFact[]>();
  const widgetsByOrg = new Map<string, ContextWidgetFact[]>();
  for (const f of allWidgetFacts) {
    const wsKey = `${f.orgSlug}/${f.wsSlug}`;
    const wsArr = widgetsByWs.get(wsKey) ?? [];
    wsArr.push(f);
    widgetsByWs.set(wsKey, wsArr);
    const orgArr = widgetsByOrg.get(f.orgSlug) ?? [];
    orgArr.push(f);
    widgetsByOrg.set(f.orgSlug, orgArr);
  }

  // ── Active entities ─────────────────────────────────────────────────────
  const activeIds = await resolveActiveEntityIds(supabase, userId, snapshot);

  const [entitiesRes, allSignalsRes, allCommitmentsRes, relsRes, actionStatesRes] =
    await Promise.all([
      supabase.from("entities").select("*").eq("user_id", userId),
      supabase
        .from("entity_signals")
        .select("*")
        .eq("user_id", userId)
        .gte("occurred_at", thirtyDaysAgo)
        .order("occurred_at", { ascending: false, nullsFirst: false })
        .limit(1000),
      supabase.from("user_commitments").select("*").eq("user_id", userId),
      supabase.from("entity_relationships").select("*").eq("user_id", userId),
      supabase
        .from("mission_action_states")
        .select("status, updated_at")
        .eq("user_id", userId)
        .gte("updated_at", sevenDaysAgo),
    ]);

  const entities = (entitiesRes.data ?? []) as unknown as Entity[];
  const signals30d = allSignalsRes.data ?? [];
  const commitments = allCommitmentsRes.data ?? [];
  const rels = relsRes.data ?? [];
  const actionStates = actionStatesRes.data ?? [];

  const dismissed7d = actionStates.filter((s) => s.status === "dismissed").length;
  const snoozed7d = actionStates.filter((s) => s.status === "snoozed").length;

  const entityById = new Map(entities.map((e) => [e.id, e]));
  const activeEntities = entities.filter((e) => activeIds.has(e.id));

  const signalsByEntity = new Map<string, typeof signals30d>();
  for (const s of signals30d) {
    if (!s.entity_id) continue;
    const arr = signalsByEntity.get(s.entity_id as string) ?? [];
    arr.push(s);
    signalsByEntity.set(s.entity_id as string, arr);
  }

  const signalsByOrg = new Map<string, typeof signals30d>();
  for (const s of signals30d) {
    const md = (s as unknown as { metadata?: Record<string, unknown> }).metadata ?? {};
    const orgSlug = (md as { platform_org_slug?: string }).platform_org_slug;
    if (!orgSlug) continue;
    const arr = signalsByOrg.get(orgSlug) ?? [];
    arr.push(s);
    signalsByOrg.set(orgSlug, arr);
  }

  const bundles: ContextScanBundle[] = [];

  // ── Global bundle ────────────────────────────────────────────────────────
  const entityCountsByType: Record<string, number> = {};
  for (const e of entities) {
    entityCountsByType[e.type] = (entityCountsByType[e.type] ?? 0) + 1;
  }
  const activeEntityNames = activeEntities
    .slice()
    .sort((a, b) => (b.importance ?? 50) - (a.importance ?? 50))
    .slice(0, 8)
    .map((e) => e.name);

  const openCommitmentsGlobal: ContextCommitmentFact[] = commitments
    .filter((c) => c.status === "open" || c.status === "suggested")
    .slice(0, 8)
    .map((c) => ({
      title: (c.title as string).slice(0, 200),
      status: c.status as string,
      dueDate: (c.due_date as string) ?? null,
    }));

  const globalMissionActions: ContextMissionActionFact[] = snapshot.globalActions
    .slice(0, 10)
    .map((a) => ({
      title: a.title,
      description: a.description,
      source: a.source,
      tier: a.tier,
      entityName: a.entityName ?? null,
    }));

  const globalWidgetFacts = allWidgetFacts
    .filter((f) => f.status === "ok")
    .slice(0, 25);

  const includedSourcesGlobal = new Set<ContextSource>();
  for (const s of widgetSourcesFromFacts(allWidgetFacts)) {
    includedSourcesGlobal.add(s as ContextSource);
  }
  if (snapshot.inboxMeta.gmail.connected) includedSourcesGlobal.add("gmail");
  if (snapshot.inboxMeta.slack.connected) includedSourcesGlobal.add("slack");
  if (openCommitmentsGlobal.length > 0) includedSourcesGlobal.add("commitments");
  if (globalMissionActions.length > 0) includedSourcesGlobal.add("mission");
  if (signals30d.length > 0) includedSourcesGlobal.add("signals");

  const globalBundle: ContextGlobalBundle = {
    scopeType: "global",
    scopeRef: null,
    entityCountsByType,
    activeEntityNames,
    openCommitments: openCommitmentsGlobal,
    recentSignalsCount30d: signals30d.length,
    actionStateCounts: { dismissed7d, snoozed7d },
    widgets: globalWidgetFacts,
    missionActions: globalMissionActions,
    sourceCounts: {
      entities: entities.length,
      signals: signals30d.length,
      commitments: openCommitmentsGlobal.length,
      widgets: allWidgetFacts.filter((f) => f.status === "ok").length,
      missionActions: globalMissionActions.length,
    },
    includedSources: [...includedSourcesGlobal],
    insufficient:
      entities.length === 0 &&
      signals30d.length === 0 &&
      commitments.length === 0 &&
      allWidgetFacts.every((f) => f.status !== "ok"),
  };
  bundles.push(globalBundle);

  // ── Workspace bundles ────────────────────────────────────────────────────
  for (const ws of snapshot.workspaces) {
    const wsKey = `${ws.orgSlug}/${ws.wsSlug}`;
    const widgets = widgetsByWs.get(wsKey) ?? [];
    const okWidgets = widgets.filter((w) => w.status === "ok");
    const wsActions = snapshot.workspaceActions[wsKey] ?? [];
    const missionActions: ContextMissionActionFact[] = wsActions.map((a) => ({
      title: a.title,
      description: a.description,
      source: "workspace",
      tier: a.priority <= 2 ? "urgent" : a.priority <= 5 ? "important" : "later",
      entityName: null,
    }));
    const wsSignals = signalsByOrg.get(ws.orgSlug) ?? [];
    const signalFacts: ContextSignalFact[] = wsSignals.slice(0, 10).map((s) => ({
      source: s.source as string,
      signalType: s.signal_type as string,
      externalRefPrefix: refPrefix(s.external_ref as string),
      occurredAt: (s.occurred_at as string) ?? null,
      snippet:
        s.snippet && (s.snippet as string).length <= 160
          ? (s.snippet as string)
          : null,
      linkedEntityName: entityById.get(s.entity_id as string)?.name ?? null,
    }));

    const included = new Set<ContextSource>();
    for (const s of widgetSourcesFromFacts(widgets)) included.add(s as ContextSource);
    if (missionActions.length > 0) included.add("mission");
    if (signalFacts.some((s) => s.source === "gmail")) included.add("gmail");
    if (signalFacts.some((s) => s.source === "slack")) included.add("slack");
    if (signalFacts.length > 0) included.add("signals");

    const insufficient =
      okWidgets.length === 0 &&
      missionActions.length === 0 &&
      signalFacts.length === 0;

    const wsBundle: ContextWorkspaceBundle = {
      scopeType: "workspace",
      scopeRef: wsKey,
      orgSlug: ws.orgSlug,
      orgName: ws.orgName,
      wsSlug: ws.wsSlug,
      wsName: ws.wsName,
      widgets,
      missionActions,
      signals: signalFacts,
      insufficient,
      sourceCounts: {
        widgets: okWidgets.length,
        missionActions: missionActions.length,
        signals: signalFacts.length,
      },
      includedSources: [...included],
    };
    if (!insufficient) bundles.push(wsBundle);
  }

  // ── Entity bundles (only active) ─────────────────────────────────────────
  for (const e of activeEntities) {
    const eSignals = (signalsByEntity.get(e.id) ?? []).slice(0, 15);
    const signalFacts: ContextSignalFact[] = eSignals.map((s) => ({
      source: s.source as string,
      signalType: s.signal_type as string,
      externalRefPrefix: refPrefix(s.external_ref as string),
      occurredAt: (s.occurred_at as string) ?? null,
      snippet:
        s.snippet && (s.snippet as string).length <= 160
          ? (s.snippet as string)
          : null,
      linkedEntityName: e.name,
    }));

    const eCommitments: ContextCommitmentFact[] = commitments
      .filter(
        (c) =>
          c.entity_id === e.id && (c.status === "open" || c.status === "suggested"),
      )
      .slice(0, 5)
      .map((c) => ({
        title: (c.title as string).slice(0, 200),
        status: c.status as string,
        dueDate: (c.due_date as string) ?? null,
      }));

    const eRels: ContextRelationshipFact[] = [];
    for (const r of rels) {
      if (r.from_entity_id === e.id) {
        const other = entityById.get(r.to_entity_id as string);
        if (other)
          eRels.push({
            otherName: other.name,
            kind: r.kind as string,
            direction: "outgoing",
          });
      } else if (r.to_entity_id === e.id) {
        const other = entityById.get(r.from_entity_id as string);
        if (other)
          eRels.push({
            otherName: other.name,
            kind: r.kind as string,
            direction: "incoming",
          });
      }
      if (eRels.length >= 10) break;
    }

    const metadata = (e.metadata ?? {}) as Record<string, unknown>;
    const metadataKeys = Object.keys(metadata);
    const orgSlug = metadata.platform_org_slug as string | undefined;
    const widgetsForEntity = orgSlug ? widgetsByOrg.get(orgSlug) ?? [] : [];

    const eMissionActions: ContextMissionActionFact[] = snapshot.globalActions
      .filter((a) => a.entityId === e.id)
      .slice(0, 6)
      .map((a) => ({
        title: a.title,
        description: a.description,
        source: a.source,
        tier: a.tier,
        entityName: e.name,
      }));

    const lastActivityAt =
      eSignals.reduce<string | null>((acc, s) => {
        const t = (s.occurred_at as string) ?? null;
        if (!t) return acc;
        if (!acc || t > acc) return t;
        return acc;
      }, null) ?? e.last_seen_at ?? null;

    const included = new Set<ContextSource>();
    for (const s of signalFacts) {
      const src = sourceForSignal(s.source);
      if (src) included.add(src);
    }
    if (signalFacts.length > 0) included.add("signals");
    if (eCommitments.length > 0) included.add("commitments");
    if (eRels.length > 0) included.add("relationships");
    for (const s of widgetSourcesFromFacts(widgetsForEntity))
      included.add(s as ContextSource);
    if (eMissionActions.length > 0) included.add("mission");

    const factTotal =
      signalFacts.length + eCommitments.length + eRels.length + eMissionActions.length;
    const insufficient = factTotal < 2;

    const bundle: ContextEntityBundle = {
      scopeType: e.type === "project" ? "project" : "entity",
      scopeRef: e.slug,
      entity: {
        id: e.id,
        name: e.name,
        slug: e.slug,
        type: e.type,
        importance: e.importance ?? 50,
        summary: e.summary ?? null,
        metadataKeys,
        lastActivityAt,
      },
      signals: signalFacts,
      commitments: eCommitments,
      relationships: eRels,
      widgets: widgetsForEntity,
      missionActions: eMissionActions,
      actionStateCounts: { dismissed7d: 0, snoozed7d: 0 },
      insufficient,
      sourceCounts: {
        signals: signalFacts.length,
        commitments: eCommitments.length,
        relationships: eRels.length,
        widgets: widgetsForEntity.filter((w) => w.status === "ok").length,
        missionActions: eMissionActions.length,
      },
      includedSources: [...included],
    };
    if (!insufficient) bundles.push(bundle);
  }

  return bundles;
}
