import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ConnectedModuleOrg = {
  connectionId: string;
  externalOrgId: string;
  name: string;
  platformOrgSlug: string;
  platformOrgName: string;
};

/** Connected Work/Finance orgs for pickers (one key/connection per Platform org workspace). */
export const listConnectedModuleOrgs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ moduleSlug: z.enum(["work", "finance"]) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ orgs: ConnectedModuleOrg[] }> => {
    const { supabase, userId } = context;

    const { data: memberships } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", userId);
    const orgIds = (memberships ?? []).map((m) => m.org_id as string);
    if (!orgIds.length) return { orgs: [] };

    const { data: orgs, error: orgErr } = await supabase
      .from("organizations")
      .select("id, name, slug")
      .in("id", orgIds);
    if (orgErr) throw orgErr;
    const orgById = new Map(
      (orgs ?? []).map((o) => [o.id as string, o as { id: string; name: string; slug: string }]),
    );

    const { data: conns, error } = await supabase
      .from("module_connections")
      .select("id, org_id, external_org_id, external_org_name, status, module_slug")
      .eq("module_slug", data.moduleSlug)
      .eq("status", "connected")
      .in("org_id", orgIds);
    if (error) throw error;

    const seen = new Set<string>();
    const out: ConnectedModuleOrg[] = [];
    for (const row of conns ?? []) {
      const externalOrgId = (row.external_org_id as string | null)?.trim();
      const platform = orgById.get(row.org_id as string);
      if (!externalOrgId || !platform) continue;
      const key = `${platform.slug}:${externalOrgId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        connectionId: row.id as string,
        externalOrgId,
        name:
          (row.external_org_name as string | null)?.trim() ||
          platform.name ||
          data.moduleSlug,
        platformOrgSlug: platform.slug,
        platformOrgName: platform.name,
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name, "nb"));
    return { orgs: out };
  });
