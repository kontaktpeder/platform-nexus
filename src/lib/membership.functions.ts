import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OrgIdSchema = z.object({ orgId: z.string().uuid() });

const InviteSchema = z.object({
  orgId: z.string().uuid(),
  email: z.string().email().max(320),
  role: z.enum(["admin", "editor", "viewer"]).default("editor"),
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
    throw new Error("Kun org-admin kan invitere medlemmer");
  }
}

async function findUserIdByEmail(admin: any, email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: normalized,
  });
  if (!linkErr && linkData?.user?.id) return linkData.user.id as string;

  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const hit = data.users.find(
      (u: { email?: string | null }) => (u.email ?? "").toLowerCase() === normalized,
    );
    if (hit?.id) return hit.id as string;
    if ((data.users?.length ?? 0) < 200) break;
  }
  return null;
}

export const inviteOrgMemberByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOrgAdmin(supabase, data.orgId, userId);

    const email = data.email.trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const appUrl = (process.env.PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const redirectTo = appUrl ? `${appUrl}/auth` : undefined;

    let targetUserId: string | null = null;
    let invited = false;

    const { data: inviteData, error: inviteErr } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { invited_org_id: data.orgId },
      });

    if (!inviteErr && inviteData.user?.id) {
      targetUserId = inviteData.user.id;
      invited = true;
    } else {
      targetUserId = await findUserIdByEmail(supabaseAdmin, email);
      if (!targetUserId) {
        throw new Error(
          inviteErr?.message ??
            "Kunne ikke invitere. Sjekk e-post og at Auth har e-post aktivert.",
        );
      }
    }

    const { data: existing } = await supabaseAdmin
      .from("memberships")
      .select("id")
      .eq("org_id", data.orgId)
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (existing) {
      return { ok: true as const, invited: false, alreadyMember: true as const };
    }

    const { error: insertErr } = await supabaseAdmin.from("memberships").insert({
      org_id: data.orgId,
      user_id: targetUserId,
      role: data.role,
    });
    if (insertErr) throw new Error(insertErr.message);

    return { ok: true as const, invited, alreadyMember: false as const };
  });

export const listOrgMembersWithEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OrgIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("memberships")
      .select("role")
      .eq("org_id", data.orgId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!me) throw new Error("Ingen tilgang");

    const { data: mem, error } = await supabase
      .from("memberships")
      .select("id, user_id, role")
      .eq("org_id", data.orgId);
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = (mem ?? []).map((m) => m.user_id);
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", ids)
      : { data: [] as Array<{ id: string; display_name: string | null; avatar_url: string | null }> };
    const map = new Map((profs ?? []).map((p) => [p.id, p]));

    const members = await Promise.all(
      (mem ?? []).map(async (m) => {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
        return {
          id: m.id as string,
          userId: m.user_id as string,
          role: m.role as string,
          email: userData.user?.email ?? null,
          profile: map.get(m.user_id) ?? null,
        };
      }),
    );

    return {
      members,
      canInvite: ["owner", "admin"].includes(me.role),
    };
  });
