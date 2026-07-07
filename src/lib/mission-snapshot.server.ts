// Server-only: single loader used by both /mission and Context Scan.
// Same shape as GlobalMissionData plus derived global/workspace actions.
// This is the ONE source of truth for widget numbers, inbox, links, commitments.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  GlobalMissionData,
  GlobalWorkspaceEntry,
  EntityLink,
  InboxSourceMeta,
} from "@/lib/global-mission.functions";
import type { InboxAction } from "@/lib/inbox/types";
import type { MissionActionState } from "@/lib/mission-action-state";
import type { UserCommitment } from "@/lib/knowledge/commitment.types";
import type { ModuleConnectionRow } from "@/lib/module-connections";
import type { WorkspaceModule } from "@/lib/workspaceContext";
import {
  buildGlobalActions,
  buildNextActions,
  buildCommitmentActions,
  buildModuleAlertActions,
  type GlobalMissionAction,
  type MissionAction,
} from "@/lib/mission-actions";
import { todayOsloISO } from "@/lib/knowledge/commitment.types";

type DB = SupabaseClient<Database>;

export type MissionSnapshot = GlobalMissionData & {
  globalActions: GlobalMissionAction[];
  workspaceActions: Record<string, MissionAction[]>; // key: `${orgSlug}/${wsSlug}`
};

async function loadOpenCommitments(supabase: DB, userId: string): Promise<UserCommitment[]> {
  const today = todayOsloISO();
  const { data } = await supabase
    .from("user_commitments")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "open")
    .or(`due_date.is.null,due_date.lte.${today}`)
    .order("due_date", { ascending: true, nullsFirst: false });
  return (data ?? []) as unknown as UserCommitment[];
}

export async function loadMissionSnapshot(
  supabase: DB,
  userId: string,
): Promise<MissionSnapshot> {
  const { fetchGmailActionsWithMeta } = await import("@/lib/inbox/gmail.server");
  const { fetchSlackActions } = await import("@/lib/inbox/slack.server");
  const { listMissionActionStates } = await import("@/lib/mission-action-state.server");
  const { autoLinkMissionSignals } = await import("@/lib/knowledge/auto-link.server");
  const { inboxDescriptors, workspaceDescriptors } = await import(
    "@/lib/mission-signals.server"
  );
  const { ensureAnchorEntities } = await import(
    "@/lib/knowledge/anchor-entities.server"
  );

  // Best-effort: seed the three Knowledge context anchors. Idempotent, fast.
  await ensureAnchorEntities(supabase, userId).catch((err) => {
    console.warn("[anchors] ensure failed", err);
  });

  const gmailAvailable = !!process.env.GOOGLE_MAIL_API_KEY;
  const slackAvailable = !!process.env.SLACK_API_KEY;

  const { data: memberships } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId);
  const orgIds = (memberships ?? []).map((m) => m.org_id as string);

  let orgs: { id: string; name: string; slug: string }[] = [];
  let entries: GlobalWorkspaceEntry[] = [];

  if (orgIds.length > 0) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchWorkspaceWidgetData } = await import("@/lib/widget-data.server");

    const [orgsRes, wsRes, modsRes, wsModsRes, connsRes] = await Promise.all([
      supabaseAdmin
        .from("organizations")
        .select("id, name, slug")
        .in("id", orgIds)
        .order("name"),
      supabaseAdmin
        .from("workspaces")
        .select("id, name, slug, org_id")
        .in("org_id", orgIds),
      supabaseAdmin.from("modules").select("*").order("sort_order"),
      supabaseAdmin
        .from("workspace_modules")
        .select("workspace_id, module_id, enabled, config"),
      supabaseAdmin
        .from("module_connections")
        .select(
          "id, org_id, workspace_id, module_id, external_org_id, external_base_url, status, connected_by, connected_at, last_verified_at, error_message, external_org_name, resolved_org_home_url, module_slug, module_info_snapshot",
        ),
    ]);

    orgs = (orgsRes.data ?? []) as typeof orgs;
    const workspaces = wsRes.data ?? [];
    const allModules = modsRes.data ?? [];
    const wsMods = wsModsRes.data ?? [];
    const conns = (connsRes.data ?? []) as ModuleConnectionRow[];
    const orgById = new Map(orgs.map((o) => [o.id, o]));

    entries = await Promise.all(
      workspaces.map(async (ws) => {
        const org = orgById.get(ws.org_id as string);
        const enabledMap = new Map(
          wsMods.filter((r) => r.workspace_id === ws.id).map((r) => [r.module_id, r]),
        );
        const connMap = new Map(
          conns.filter((c) => c.workspace_id === ws.id).map((c) => [c.module_id, c]),
        );
        const modules: WorkspaceModule[] = allModules.map((m) => ({
          ...m,
          enabled: enabledMap.get(m.id)?.enabled ?? false,
          config: (m.config ?? {}) as Record<string, unknown>,
          connection: connMap.get(m.id) ?? null,
        }));
        const { fetchWorkspaceModuleAlerts } = await import(
          "@/lib/module-alerts.server"
        );
        const [widgetData, alertsRes] = await Promise.all([
          fetchWorkspaceWidgetData({
            supabaseAdmin,
            orgId: ws.org_id as string,
            workspaceId: ws.id as string,
          }),
          fetchWorkspaceModuleAlerts({
            supabaseAdmin,
            orgId: ws.org_id as string,
            workspaceId: ws.id as string,
          }).catch((err) => {
            console.warn("[module-alerts] workspace fetch failed", err);
            return { alerts: {}, errors: {} };
          }),
        ]);
        return {
          orgId: ws.org_id as string,
          orgSlug: org?.slug ?? "",
          orgName: org?.name ?? "",
          workspaceId: ws.id as string,
          wsSlug: ws.slug as string,
          wsName: ws.name as string,
          widgetData,
          moduleAlerts: alertsRes.alerts,
          moduleAlertErrors: alertsRes.errors,
          modules,
        };
      }),
    );
  }

  const [gmailRes, slack, actionStates, openCommitments] = await Promise.all([
    fetchGmailActionsWithMeta().catch(() => ({ actions: [] as InboxAction[], error: null as string | null })),
    fetchSlackActions().catch(() => [] as InboxAction[]),
    listMissionActionStates(supabase, userId).catch(() => [] as MissionActionState[]),
    loadOpenCommitments(supabase, userId).catch(() => [] as UserCommitment[]),
  ]);
  const inbox = [...gmailRes.actions, ...slack];

  const wsInputs = entries.map((ws) => ({
    orgSlug: ws.orgSlug,
    orgName: ws.orgName,
    wsSlug: ws.wsSlug,
    wsName: ws.wsName,
  }));

  const entityLinks = await autoLinkMissionSignals(supabase, userId, [
    ...inboxDescriptors(inbox),
    ...workspaceDescriptors(wsInputs),
  ]).catch(() => ({}) as Record<string, EntityLink>);

  // Derived actions used by both /mission and Context Scan.
  const workspaceActions: Record<string, MissionAction[]> = {};
  for (const ws of entries) {
    workspaceActions[`${ws.orgSlug}/${ws.wsSlug}`] = [
      ...buildModuleAlertActions({
        moduleAlerts: ws.moduleAlerts,
        modules: ws.modules,
      }),
      ...buildNextActions({
        widgetData: ws.widgetData,
        modules: ws.modules,
      }),
    ];
  }

  const entityMap: Record<
    string,
    { name: string; slug: string; linkSource?: "manual" | "auto" }
  > = {};
  for (const link of Object.values(entityLinks)) {
    if (link?.entityId) {
      entityMap[link.entityId] = {
        name: link.entityName,
        slug: link.entitySlug,
        linkSource: link.linkSource ?? "manual",
      };
    }
  }

  const globalActions = [
    ...buildGlobalActions({ workspaces: entries, inbox, max: 50 }),
    ...buildCommitmentActions(
      openCommitments.map((c) => ({
        id: c.id,
        title: c.title,
        due_date: c.due_date ?? null,
        entity_id: c.entity_id ?? null,
        metadata: (c as unknown as { metadata?: Record<string, unknown> }).metadata,
      })),
      entityMap,
    ),
  ];

  const inboxMeta: { gmail: InboxSourceMeta; slack: InboxSourceMeta } = {
    gmail: {
      connected: gmailAvailable,
      error: gmailRes.error,
      count: gmailRes.actions.length,
    },
    slack: { connected: slackAvailable, error: null, count: slack.length },
  };

  return {
    orgs,
    workspaces: entries,
    inbox,
    inboxSources: { gmail: gmailAvailable, slack: slackAvailable },
    inboxMeta,
    actionStates,
    entityLinks,
    openCommitments,
    globalActions,
    workspaceActions,
  };
}
