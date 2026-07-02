// Server-only: build sanitized ContextScanBundles from Platform data.
// No cross-module SQL. Widget data via existing fetchWorkspaceWidgetData (HTTP).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  ContextScanBundle,
  ContextGlobalBundle,
  ContextEntityBundle,
  ContextWidgetFact,
  ContextSignalFact,
  ContextCommitmentFact,
  ContextRelationshipFact,
} from "./context.types";

type DB = SupabaseClient<Database>;

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

async function gatherWidgetFacts(
  supabase: DB,
  userId: string,
): Promise<{ widgets: ContextWidgetFact[]; byOrgSlug: Map<string, ContextWidgetFact[]> }> {
  const widgets: ContextWidgetFact[] = [];
  const byOrgSlug = new Map<string, ContextWidgetFact[]>();

  const { data: memberships } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId);
  const orgIds = (memberships ?? []).map((m) => m.org_id as string);
  if (orgIds.length === 0) return { widgets, byOrgSlug };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { fetchWorkspaceWidgetData } = await import("@/lib/widget-data.server");

  const [orgsRes, wsRes, connsRes] = await Promise.all([
    supabaseAdmin.from("organizations").select("id, name, slug").in("id", orgIds),
    supabaseAdmin.from("workspaces").select("id, org_id").in("org_id", orgIds),
    supabaseAdmin
      .from("module_connections")
      .select("workspace_id, module_slug")
      .in("org_id", orgIds),
  ]);
  const orgById = new Map((orgsRes.data ?? []).map((o) => [o.id as string, o]));
  const modulesByWs = new Map<string, string[]>();
  for (const c of connsRes.data ?? []) {
    const arr = modulesByWs.get(c.workspace_id as string) ?? [];
    if (c.module_slug) arr.push(c.module_slug as string);
    modulesByWs.set(c.workspace_id as string, arr);
  }

  for (const ws of wsRes.data ?? []) {
    const org = orgById.get(ws.org_id as string);
    if (!org) continue;
    const data = await fetchWorkspaceWidgetData({
      supabaseAdmin,
      orgId: ws.org_id as string,
      workspaceId: ws.id as string,
    }).catch(() => ({}));
    for (const [key, datum] of Object.entries(data ?? {})) {
      if (!datum?.display) continue;
      // key convention: `${moduleSlug}.${widget}` if present, else raw key
      const dot = key.indexOf(".");
      const moduleSlug = dot > 0 ? key.slice(0, dot) : (modulesByWs.get(ws.id as string)?.[0] ?? "module");
      const widgetName = dot > 0 ? key.slice(dot + 1) : key;
      const fact: ContextWidgetFact = {
        org: (org.name as string) ?? "",
        module: moduleSlug,
        widget: widgetName,
        display: String(datum.display).slice(0, 120),
      };
      widgets.push(fact);
      const slug = (org.slug as string) ?? "";
      const arr = byOrgSlug.get(slug) ?? [];
      arr.push(fact);
      byOrgSlug.set(slug, arr);
    }
  }
  return { widgets, byOrgSlug };
}

export async function buildContextBundles(
  supabase: DB,
  userId: string,
): Promise<ContextScanBundle[]> {
  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

  const [entitiesRes, allSignalsRes, allCommitmentsRes, relsRes, actionStatesRes, widgetInfo] =
    await Promise.all([
      supabase.from("entities").select("*").eq("user_id", userId),
      supabase
        .from("entity_signals")
        .select("*")
        .eq("user_id", userId)
        .gte("created_at", sevenDaysAgo),
      supabase.from("user_commitments").select("*").eq("user_id", userId),
      supabase.from("entity_relationships").select("*").eq("user_id", userId),
      supabase
        .from("mission_action_states")
        .select("status, updated_at")
        .eq("user_id", userId)
        .gte("updated_at", sevenDaysAgo),
      gatherWidgetFacts(supabase, userId),
    ]);

  const entities = entitiesRes.data ?? [];
  const signals7d = allSignalsRes.data ?? [];
  const commitments = allCommitmentsRes.data ?? [];
  const rels = relsRes.data ?? [];
  const actionStates = actionStatesRes.data ?? [];

  const dismissed7d = actionStates.filter((s) => s.status === "dismissed").length;
  const snoozed7d = actionStates.filter((s) => s.status === "snoozed").length;

  // ── Global bundle ────────────────────────────────────────────────────────
  const entityCountsByType: Record<string, number> = {};
  for (const e of entities) {
    entityCountsByType[e.type as string] = (entityCountsByType[e.type as string] ?? 0) + 1;
  }

  const openCommitmentsGlobal: ContextCommitmentFact[] = commitments
    .filter((c) => c.status === "open" || c.status === "suggested")
    .slice(0, 5)
    .map((c) => ({
      title: (c.title as string).slice(0, 200),
      status: c.status as string,
      dueDate: (c.due_date as string) ?? null,
    }));

  const global: ContextGlobalBundle = {
    scopeType: "global",
    scopeRef: null,
    entityCountsByType,
    openCommitments: openCommitmentsGlobal,
    recentSignalsCount7d: signals7d.length,
    actionStateCounts: { dismissed7d, snoozed7d },
    widgets: widgetInfo.widgets.slice(0, 20),
    sourceCounts: {
      entities: entities.length,
      signals: signals7d.length,
      commitments: openCommitmentsGlobal.length,
      widgets: widgetInfo.widgets.length,
    },
    insufficient:
      entities.length === 0 &&
      signals7d.length === 0 &&
      commitments.length === 0 &&
      widgetInfo.widgets.length === 0,
  };

  const bundles: ContextScanBundle[] = [global];

  // ── Per-entity bundles ───────────────────────────────────────────────────
  const entityById = new Map(entities.map((e) => [e.id as string, e]));

  // All signals for these entities (broader than 7d window — up to last 10 per entity)
  const entityIds = entities.map((e) => e.id as string);
  const { data: allEntitySignals } = entityIds.length
    ? await supabase
        .from("entity_signals")
        .select("*")
        .eq("user_id", userId)
        .in("entity_id", entityIds)
        .order("occurred_at", { ascending: false, nullsFirst: false })
        .limit(500)
    : { data: [] as (typeof signals7d) };

  const signalsByEntity = new Map<string, typeof signals7d>();
  for (const s of allEntitySignals ?? []) {
    const arr = signalsByEntity.get(s.entity_id as string) ?? [];
    arr.push(s);
    signalsByEntity.set(s.entity_id as string, arr);
  }

  for (const e of entities) {
    const eSignals = (signalsByEntity.get(e.id as string) ?? []).slice(0, 10);
    const includeSnippets = eSignals.length <= 10;
    const signalFacts: ContextSignalFact[] = eSignals.map((s) => ({
      source: s.source as string,
      signalType: s.signal_type as string,
      externalRefPrefix: refPrefix(s.external_ref as string),
      occurredAt: (s.occurred_at as string) ?? null,
      snippet:
        includeSnippets && s.snippet && (s.snippet as string).length <= 160
          ? (s.snippet as string)
          : null,
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
            otherName: other.name as string,
            kind: r.kind as string,
            direction: "outgoing",
          });
      } else if (r.to_entity_id === e.id) {
        const other = entityById.get(r.from_entity_id as string);
        if (other)
          eRels.push({
            otherName: other.name as string,
            kind: r.kind as string,
            direction: "incoming",
          });
      }
      if (eRels.length >= 10) break;
    }

    const metadata = (e.metadata ?? {}) as Record<string, unknown>;
    const metadataKeys = Object.keys(metadata);
    const orgSlug = metadata.platform_org_slug as string | undefined;
    const widgetsForEntity = orgSlug ? widgetInfo.byOrgSlug.get(orgSlug) ?? [] : [];

    const lastActivityAt =
      eSignals.reduce<string | null>((acc, s) => {
        const t = (s.occurred_at as string) ?? null;
        if (!t) return acc;
        if (!acc || t > acc) return t;
        return acc;
      }, null) ?? (e.last_seen_at as string) ?? null;

    const factTotal =
      signalFacts.length +
      eCommitments.length +
      eRels.length +
      widgetsForEntity.length;
    const insufficient = factTotal < 2 && eRels.length === 0 && signalFacts.length === 0;

    const bundle: ContextEntityBundle = {
      scopeType: e.type === "project" ? "project" : "entity",
      scopeRef: e.slug as string,
      entity: {
        id: e.id as string,
        name: e.name as string,
        slug: e.slug as string,
        type: e.type as string,
        importance: (e.importance as number) ?? 50,
        summary: (e.summary as string) ?? null,
        metadataKeys,
        lastActivityAt,
      },
      signals: signalFacts,
      commitments: eCommitments,
      relationships: eRels,
      widgets: widgetsForEntity,
      actionStateCounts: { dismissed7d: 0, snoozed7d: 0 },
      insufficient,
      sourceCounts: {
        signals: signalFacts.length,
        commitments: eCommitments.length,
        relationships: eRels.length,
        widgets: widgetsForEntity.length,
      },
    };
    bundles.push(bundle);
  }

  return bundles;
}
