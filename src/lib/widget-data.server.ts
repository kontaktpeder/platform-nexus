// Server-only helper — never import from client code.
import { parseModuleInfoSnapshot } from "@/lib/module-registry";
import { fetchModuleWidgets } from "@/lib/module-client.server";
import { decryptSecret } from "@/lib/module-secrets.server";
import type { WidgetDataMap, WidgetDatum } from "@/lib/widget-data.functions";

type AdminClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

export async function fetchWorkspaceWidgetData(input: {
  supabaseAdmin: AdminClient;
  orgId: string;
  workspaceId: string;
}): Promise<WidgetDataMap> {
  const { supabaseAdmin, orgId, workspaceId } = input;

  const { data: connections } = await supabaseAdmin
    .from("module_connections")
    .select("id, module_slug, external_base_url, module_info_snapshot, status")
    .eq("workspace_id", workspaceId)
    .eq("org_id", orgId)
    .eq("status", "connected");

  if (!connections?.length) return {};

  const results = await Promise.all(
    connections.map(async (conn) => {
      const slug = conn.module_slug;
      if (!slug) return [] as Array<[string, WidgetDatum]>;
      const snapshot = parseModuleInfoSnapshot(conn.module_info_snapshot);
      const widgetIds = (snapshot?.widgets ?? [])
        .filter((w) => !w.placeholder)
        .map((w) => w.id);
      if (widgetIds.length === 0) return [];

      const { data: sec } = await supabaseAdmin
        .from("module_connection_secrets")
        .select("api_key_ciphertext")
        .eq("connection_id", conn.id)
        .maybeSingle();
      if (!sec) return [];

      try {
        const apiKey = decryptSecret(sec.api_key_ciphertext);
        const widgets = await fetchModuleWidgets({
          baseUrl: conn.external_base_url,
          apiKey,
          widgetIds,
        });
        return widgets.map(
          (w) =>
            [
              `${slug}:${w.id}`,
              { display: w.display, status: w.status, error: w.error },
            ] as [string, WidgetDatum],
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Kunne ikke hente widget-data";
        return widgetIds.map(
          (id) => [`${slug}:${id}`, { error: msg }] as [string, WidgetDatum],
        );
      }
    }),
  );

  const map: WidgetDataMap = {};
  for (const entries of results) {
    for (const [key, value] of entries) map[key] = value;
  }
  return map;
}
