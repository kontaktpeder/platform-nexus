// Server-only helper — mirrors widget-data.server.ts for alerts.
import { fetchModuleAlerts } from "@/lib/module-client.server";
import { decryptSecret } from "@/lib/module-secrets.server";
import { resolveModuleOpenUrl } from "@/lib/module-connections";
import type {
  WorkspaceAlertsMap,
  WorkspaceAlertsResult,
} from "@/lib/module-alerts.types";

type AdminClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

export async function fetchWorkspaceModuleAlerts(input: {
  supabaseAdmin: AdminClient;
  orgId: string;
  workspaceId: string;
}): Promise<WorkspaceAlertsResult> {
  const { supabaseAdmin, orgId, workspaceId } = input;

  const { data: connections } = await supabaseAdmin
    .from("module_connections")
    .select(
      "id, org_id, workspace_id, module_id, external_org_id, external_base_url, status, module_slug, module_info_snapshot, resolved_org_home_url, connected_by, connected_at, last_verified_at, error_message, external_org_name",
    )
    .eq("workspace_id", workspaceId)
    .eq("org_id", orgId)
    .eq("status", "connected");

  if (!connections?.length) return { alerts: {}, errors: {} };

  // Module names come from `modules` for display.
  const moduleIds = Array.from(new Set(connections.map((c) => c.module_id)));
  const { data: modules } = await supabaseAdmin
    .from("modules")
    .select("id, slug, name")
    .in("id", moduleIds);
  const nameBySlug = new Map(
    (modules ?? []).map((m) => [m.slug as string, m.name as string]),
  );

  const results = await Promise.all(
    connections.map(async (conn) => {
      const slug = conn.module_slug;
      if (!slug) return { slug: null, alerts: [], error: null };

      const { data: sec } = await supabaseAdmin
        .from("module_connection_secrets")
        .select("api_key_ciphertext")
        .eq("connection_id", conn.id)
        .maybeSingle();
      if (!sec) return { slug, alerts: [], error: null };

      try {
        const apiKey = decryptSecret(sec.api_key_ciphertext);
        const alerts = await fetchModuleAlerts({
          baseUrl: conn.external_base_url,
          apiKey,
        });
        const home = resolveModuleOpenUrl(conn);
        const name = nameBySlug.get(slug) ?? slug;
        return {
          slug,
          alerts: alerts.map((a) => ({
            ...a,
            source_module: a.source_module || slug,
            moduleSlug: slug,
            moduleName: name,
            connectionHomeUrl: home,
          })),
          error: null as string | null,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Kunne ikke hente alerts";
        return { slug, alerts: [], error: msg };
      }
    }),
  );

  const map: WorkspaceAlertsMap = {};
  const errors: Record<string, string> = {};
  for (const r of results) {
    if (r.slug && r.error) errors[r.slug] = r.error;
    for (const a of r.alerts) {
      map[`${a.moduleSlug}:${a.id}`] = a;
    }
  }
  return { alerts: map, errors };
}
