import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WidgetDataMap } from "@/lib/widget-data.functions";
import type { WorkspaceModule } from "@/lib/workspaceContext";
import type { ModuleConnectionRow } from "@/lib/module-connections";
import type { InboxAction } from "@/lib/inbox/types";
import type { MissionActionState } from "@/lib/mission-action-state";
import type { UserCommitment } from "@/lib/knowledge/commitment.types";
import { todayOsloISO } from "@/lib/knowledge/commitment.types";

export type GlobalWorkspaceEntry = {
  orgId: string;
  orgSlug: string;
  orgName: string;
  workspaceId: string;
  wsSlug: string;
  wsName: string;
  widgetData: WidgetDataMap;
  modules: WorkspaceModule[];
};

export type InboxSourceMeta = {
  connected: boolean;
  error: string | null;
  count: number;
};

export type EntityLink = {
  entityId: string;
  entityName: string;
  entitySlug: string;
  linkSource?: "manual" | "auto";
};

export type GlobalMissionData = {
  orgs: { id: string; name: string; slug: string }[];
  workspaces: GlobalWorkspaceEntry[];
  inbox: InboxAction[];
  inboxSources: { gmail: boolean; slack: boolean };
  inboxMeta: { gmail: InboxSourceMeta; slack: InboxSourceMeta };
  actionStates: MissionActionState[];
  entityLinks: Record<string, EntityLink>;
  openCommitments: UserCommitment[];
};

async function loadOpenCommitments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<UserCommitment[]> {
  const today = todayOsloISO();
  const { data } = await supabase
    .from("user_commitments")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "open")
    .or(`due_date.is.null,due_date.lte.${today}`)
    .order("due_date", { ascending: true, nullsFirst: false });
  return (data ?? []) as UserCommitment[];
}


// TSS serialization validation trips on `unknown` fields inside
// ModuleConnectionRow.module_info_snapshot / WorkspaceModule.config.
// Payload is real JSON — we send it through JSON.parse(JSON.stringify(...))
// and cast to keep the strict client-facing types.
export const getGlobalMissionData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {

    const { supabase, userId } = context;

    const { data: memberships } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", userId);
    const orgIds = (memberships ?? []).map((m) => m.org_id);
    const { fetchGmailActionsWithMeta } = await import("@/lib/inbox/gmail.server");
    const { fetchSlackActions } = await import("@/lib/inbox/slack.server");
    const { listMissionActionStates } = await import("@/lib/mission-action-state.server");
    const gmailAvailable = !!process.env.GOOGLE_MAIL_API_KEY;
    const slackAvailable = !!process.env.SLACK_API_KEY;

    const { autoLinkMissionSignals } = await import(
      "@/lib/knowledge/auto-link.server"
    );
    const { inboxDescriptors, workspaceDescriptors } = await import(
      "@/lib/mission-signals.server"
    );


    if (orgIds.length === 0) {
      const [gmailRes, slack, actionStates, openCommitments] = await Promise.all([
        fetchGmailActionsWithMeta(),
        fetchSlackActions(),
        listMissionActionStates(supabase, userId).catch(() => []),
        loadOpenCommitments(supabase, userId).catch(() => []),
      ]);
      const inbox = [...gmailRes.actions, ...slack];
      const entityLinks = await autoLinkMissionSignals(
        supabase,
        userId,
        inboxDescriptors(inbox),
      ).catch(() => ({}) as Record<string, EntityLink>);
      return {
        orgs: [],
        workspaces: [],
        inbox,
        inboxSources: { gmail: gmailAvailable, slack: slackAvailable },
        inboxMeta: {
          gmail: {
            connected: gmailAvailable,
            error: gmailRes.error,
            count: gmailRes.actions.length,
          },
          slack: { connected: slackAvailable, error: null, count: slack.length },
        },
        actionStates,
        entityLinks,
        openCommitments,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
    }


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

    const orgs = orgsRes.data ?? [];
    const workspaces = wsRes.data ?? [];
    const allModules = modsRes.data ?? [];
    const wsMods = wsModsRes.data ?? [];
    const conns = (connsRes.data ?? []) as ModuleConnectionRow[];

    const orgById = new Map(orgs.map((o) => [o.id, o]));

    const entries: GlobalWorkspaceEntry[] = await Promise.all(
      workspaces.map(async (ws) => {
        const org = orgById.get(ws.org_id);
        const enabledMap = new Map(
          wsMods.filter((r) => r.workspace_id === ws.id).map((r) => [r.module_id, r]),
        );
        const connMap = new Map(
          conns
            .filter((c) => c.workspace_id === ws.id)
            .map((c) => [c.module_id, c]),
        );
        const modules: WorkspaceModule[] = allModules.map((m) => ({
          ...m,
          enabled: enabledMap.get(m.id)?.enabled ?? false,
          config: (m.config ?? {}) as Record<string, unknown>,
          connection: connMap.get(m.id) ?? null,
        }));

        const widgetData = await fetchWorkspaceWidgetData({
          supabaseAdmin,
          orgId: ws.org_id,
          workspaceId: ws.id,
        });

        return {
          orgId: ws.org_id,
          orgSlug: org?.slug ?? "",
          orgName: org?.name ?? "",
          workspaceId: ws.id,
          wsSlug: ws.slug,
          wsName: ws.name,
          widgetData,
          modules,
        };
      }),
    );

    const [gmailRes, slack, actionStates] = await Promise.all([
      fetchGmailActionsWithMeta(),
      fetchSlackActions(),
      listMissionActionStates(supabase, userId).catch(() => []),
    ]);
    const inbox = [...gmailRes.actions, ...slack];

    // Build workspace descriptors so R7/R8 can match by orgSlug/orgName.
    // Stable per-org external_ref `ws:{orgSlug}` — Mission.tsx falls back to
    // this key when a widget-specific action.key has no direct link.
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


    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return JSON.parse(
      JSON.stringify({
        orgs,
        workspaces: entries,
        inbox,
        inboxSources: { gmail: gmailAvailable, slack: slackAvailable },
        inboxMeta: {
          gmail: {
            connected: gmailAvailable,
            error: gmailRes.error,
            count: gmailRes.actions.length,
          },
          slack: { connected: slackAvailable, error: null, count: slack.length },
        },
        actionStates,
        entityLinks,
      }),
    ) as any;
  });


