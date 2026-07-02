import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { connectionInputSchema, normalizeBaseUrl } from "@/lib/module-connections";

const VerifyInput = z.object({
  orgId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  moduleId: z.string().uuid(),
  moduleSlug: z.string().min(1),
  external_org_id: z.string().uuid(),
  external_base_url: z.string().url(),
  verify_api_key: z.string().min(20),
});

const RetestInput = z.object({
  orgId: z.string().uuid(),
  connectionId: z.string().uuid(),
});

async function assertOrgAdmin(
  supabase: { from: (t: string) => any },
  orgId: string,
  userId: string,
) {
  const { data } = await supabase
    .from("memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || !["owner", "admin"].includes(data.role)) {
    throw new Error("Kun org-admin kan koble moduler");
  }
}

export const verifyAndSaveModuleConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VerifyInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyModuleConnection, ModuleClientError } = await import(
      "@/lib/module-client.server"
    );
    const { encryptSecret } = await import("@/lib/module-secrets.server");

    await assertOrgAdmin(supabase, data.orgId, userId);

    connectionInputSchema.parse({
      external_org_id: data.external_org_id,
      external_base_url: data.external_base_url,
    });

    const baseUrl = normalizeBaseUrl(data.external_base_url);
    const now = new Date().toISOString();
    const apiKey = data.verify_api_key.trim();

    try {
      const result = await verifyModuleConnection({
        baseUrl,
        expectedModuleSlug: data.moduleSlug,
        externalOrgId: data.external_org_id,
        apiKey,
      });

      const snapshot = {
        module_slug: result.info.module_slug,
        module_name: result.info.module_name,
        capabilities: result.info.capabilities ?? [],
        deep_links: result.info.deep_links ?? { org_home: "/orgs/{org_id}" },
        widgets: result.info.widgets ?? [],
        fetched_at: now,
      };

      const { data: conn, error: upsertErr } = await supabaseAdmin
        .from("module_connections")
        .upsert(
          {
            org_id: data.orgId,
            workspace_id: data.workspaceId,
            module_id: data.moduleId,
            external_org_id: data.external_org_id,
            external_base_url: baseUrl,
            external_org_name: result.orgName,
            resolved_org_home_url: result.orgHome,
            module_slug: data.moduleSlug,
            module_info_snapshot: snapshot as unknown as import("@/integrations/supabase/types").Json,
            status: "connected",
            connected_by: userId,
            connected_at: now,
            last_verified_at: now,
            error_message: null,
          },
          { onConflict: "workspace_id,module_id" },
        )
        .select("id")
        .single();

      if (upsertErr || !conn) {
        throw new Error(upsertErr?.message ?? "Kunne ikke lagre kobling");
      }

      const { error: secErr } = await supabaseAdmin
        .from("module_connection_secrets")
        .upsert({
          connection_id: conn.id,
          api_key_ciphertext: encryptSecret(apiKey),
        });
      if (secErr) throw new Error(secErr.message);

      return {
        ok: true as const,
        status: "connected" as const,
        orgName: result.orgName,
        orgHome: result.orgHome,
      };
    } catch (e) {
      const msg =
        e instanceof ModuleClientError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Verify feilet";

      await supabaseAdmin.from("module_connections").upsert(
        {
          org_id: data.orgId,
          workspace_id: data.workspaceId,
          module_id: data.moduleId,
          external_org_id: data.external_org_id,
          external_base_url: baseUrl,
          module_slug: data.moduleSlug,
          status: "error",
          connected_by: userId,
          last_verified_at: now,
          error_message: msg,
        },
        { onConflict: "workspace_id,module_id" },
      );

      throw new Error(msg);
    }
  });

export const retestModuleConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RetestInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyModuleConnection } = await import("@/lib/module-client.server");
    const { decryptSecret } = await import("@/lib/module-secrets.server");

    await assertOrgAdmin(supabase, data.orgId, userId);

    const { data: conn, error } = await supabaseAdmin
      .from("module_connections")
      .select("id, external_org_id, external_base_url, module_slug")
      .eq("id", data.connectionId)
      .eq("org_id", data.orgId)
      .maybeSingle();
    if (error || !conn || !conn.module_slug) {
      throw new Error("Kobling ikke funnet");
    }

    const { data: sec } = await supabaseAdmin
      .from("module_connection_secrets")
      .select("api_key_ciphertext")
      .eq("connection_id", conn.id)
      .maybeSingle();
    if (!sec) throw new Error("Ingen lagret verify-nøkkel — koble på nytt med nøkkel");

    const apiKey = decryptSecret(sec.api_key_ciphertext);
    const now = new Date().toISOString();

    const result = await verifyModuleConnection({
      baseUrl: conn.external_base_url,
      expectedModuleSlug: conn.module_slug,
      externalOrgId: conn.external_org_id,
      apiKey,
    });

    const snapshot = {
      module_slug: result.info.module_slug,
      module_name: result.info.module_name,
      capabilities: result.info.capabilities ?? [],
      deep_links: result.info.deep_links ?? { org_home: "/orgs/{org_id}" },
      widgets: result.info.widgets ?? [],
      fetched_at: now,
    };

    await supabaseAdmin
      .from("module_connections")
      .update({
        status: "connected",
        external_org_name: result.orgName,
        resolved_org_home_url: result.orgHome,
        module_info_snapshot: snapshot as unknown as import("@/integrations/supabase/types").Json,
        last_verified_at: now,
        error_message: null,
      })
      .eq("id", conn.id);

    return {
      ok: true as const,
      orgName: result.orgName,
      orgHome: result.orgHome,
    };
  });
