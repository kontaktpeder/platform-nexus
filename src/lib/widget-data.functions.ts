import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseModuleInfoSnapshot } from "@/lib/module-registry";

const Input = z.object({
  orgId: z.string().uuid(),
  workspaceId: z.string().uuid(),
});

export type WidgetDatum = {
  display?: string;
  status?: string;
  error?: string;
};

export type WidgetDataMap = Record<string, WidgetDatum>;

export const getWorkspaceWidgetData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<WidgetDataMap> => {
    const { supabase, userId } = context;

    // Auth: must be a member of the org
    const { data: member } = await supabase
      .from("memberships")
      .select("role")
      .eq("org_id", data.orgId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) return {};

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchModuleWidgets } = await import("@/lib/module-client.server");
    const { decryptSecret } = await import("@/lib/module-secrets.server");

    const { data: connections } = await supabaseAdmin
      .from("module_connections")
      .select("id, module_slug, external_base_url, module_info_snapshot, status")
      .eq("workspace_id", data.workspaceId)
      .eq("org_id", data.orgId)
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
  });
