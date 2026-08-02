import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Connected Work org names from Platform — seeds the timer org picker. */
export const listConnectedWorkOrgs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("module_connections")
      .select("external_org_id, external_org_name, status, module_slug")
      .eq("module_slug", "work")
      .eq("status", "connected");
    if (error) throw error;
    const seen = new Set<string>();
    const orgs: Array<{ id: string; name: string }> = [];
    for (const row of data ?? []) {
      const name = (row.external_org_name as string | null)?.trim();
      const id = (row.external_org_id as string | null)?.trim();
      if (!name || !id) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      orgs.push({ id, name });
    }
    return { orgs };
  });
