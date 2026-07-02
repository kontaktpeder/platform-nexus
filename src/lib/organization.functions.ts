import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify } from "@/lib/slug";

const Input = z.object({
  name: z.string().trim().min(1, "Navn kreves").max(120),
  workspaceName: z.string().trim().min(1).max(80).optional(),
});

async function uniqueOrgSlug(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  base: string,
): Promise<string> {
  const root = base || `org-${Date.now()}`;
  let candidate = root;
  let n = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await admin
      .from("organizations")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return candidate;
    candidate = `${root}-${n++}`;
    if (n > 100) throw new Error("Kunne ikke generere unik slug");
  }
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const userId = context.userId;

    const baseSlug = slugify(data.name);
    const slug = await uniqueOrgSlug(admin, baseSlug);

    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .insert({ name: data.name, slug, created_by: userId })
      .select("id, name, slug")
      .single();
    if (orgErr || !org) throw new Error(orgErr?.message ?? "Kunne ikke opprette organisasjon");

    // Ensure membership exists even if trigger is missing
    const { error: memErr } = await admin
      .from("memberships")
      .upsert(
        { org_id: org.id, user_id: userId, role: "owner" },
        { onConflict: "org_id,user_id" },
      );
    if (memErr) throw new Error(memErr.message);

    const wsName = data.workspaceName ?? "Operations";
    const { data: ws, error: wsErr } = await admin
      .from("workspaces")
      .insert({
        org_id: org.id,
        name: wsName,
        slug: "operations",
        workspace_type: "drift",
      })
      .select("id, name, slug")
      .single();
    if (wsErr || !ws) throw new Error(wsErr?.message ?? "Kunne ikke opprette arbeidsflate");

    return { org, workspace: ws };
  });
