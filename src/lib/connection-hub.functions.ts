import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildOrgConnectionHub } from "@/lib/connection-hub.server";
import type { ConnectionHubResponse } from "@/lib/connection-hub.types";

export const getOrgConnectionHub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orgSlug: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }): Promise<ConnectionHubResponse> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: org, error: orgErr } = await context.supabase
      .from("organizations")
      .select("id, name, slug")
      .eq("slug", data.orgSlug)
      .maybeSingle();
    if (orgErr) throw orgErr;
    if (!org) throw new Error("Organisasjon ikke funnet");

    const { data: workspaces } = await context.supabase
      .from("workspaces")
      .select("id, name, slug")
      .eq("org_id", org.id)
      .order("name");

    const wsIds = (workspaces ?? []).map((w) => w.id as string);

    const [
      { data: modules },
      { data: enabled },
      { data: connections },
      { count: slackChannelRuleCount },
    ] = await Promise.all([
      context.supabase.from("modules").select("id, slug, name, status").order("sort_order"),
      wsIds.length
        ? context.supabase
            .from("workspace_modules")
            .select("workspace_id, module_id, enabled")
            .in("workspace_id", wsIds)
        : Promise.resolve({ data: [] }),
      context.supabase
        .from("module_connections")
        .select(
          "id, org_id, workspace_id, module_id, external_org_id, external_base_url, status, last_verified_at, error_message, external_org_name, module_slug",
        )
        .eq("org_id", org.id),
      context.supabase
        .from("slack_channel_ingest_rules")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .eq("enabled", true),
    ]);

    const connectionIds = (connections ?? []).map((c) => c.id as string);
    const invoicesCapableByConnectionId = new Map<string, boolean>();
    const financeConnections = (connections ?? []).filter(
      (c) => c.module_slug === "finance" && c.status === "connected",
    );
    if (financeConnections.length > 0) {
      const { financeInvoicesCapable } = await import("@/lib/module-connection-secrets.server");
      await Promise.all(
        financeConnections.map(async (conn) => {
          const capable = await financeInvoicesCapable(supabaseAdmin, {
            id: conn.id as string,
            external_base_url: conn.external_base_url as string,
            module_slug: conn.module_slug as string,
            status: conn.status as string,
          });
          invoicesCapableByConnectionId.set(conn.id as string, capable);
        }),
      );
    }

    return buildOrgConnectionHub({
      org: { id: org.id, name: org.name, slug: org.slug },
      workspaces: (workspaces ?? []) as Array<{ id: string; name: string; slug: string }>,
      modules: (modules ?? []) as Array<{ id: string; slug: string; name: string; status: string }>,
      enabled: (enabled ?? []) as Array<{
        workspace_id: string;
        module_id: string;
        enabled: boolean;
      }>,
      connections: (connections ?? []) as import("@/lib/module-connections").ModuleConnectionRow[],
      invoicesCapableByConnectionId,
      slackChannelRuleCount: slackChannelRuleCount ?? 0,
    });
  });
