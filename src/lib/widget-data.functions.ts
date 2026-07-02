import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    const { fetchWorkspaceWidgetData } = await import("@/lib/widget-data.server");

    return fetchWorkspaceWidgetData({
      supabaseAdmin,
      orgId: data.orgId,
      workspaceId: data.workspaceId,
    });
  });
