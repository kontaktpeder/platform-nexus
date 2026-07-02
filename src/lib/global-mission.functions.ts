import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WidgetDataMap } from "@/lib/widget-data.functions";
import type { WorkspaceModule } from "@/lib/workspaceContext";
import type { ModuleConnectionRow } from "@/lib/module-connections";

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

export type GlobalMissionData = {
  orgs: { id: string; name: string; slug: string }[];
  workspaces: GlobalWorkspaceEntry[];
};

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
    if (orgIds.length === 0) return { orgs: [], workspaces: [] };

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return JSON.parse(JSON.stringify({ orgs, workspaces: entries })) as any;
  });

