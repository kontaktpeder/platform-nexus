import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WorkspaceAlertsResult } from "@/lib/module-alerts.types";

const Input = z.object({
  orgId: z.string().uuid(),
  workspaceId: z.string().uuid(),
});

export const getWorkspaceModuleAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<WorkspaceAlertsResult> => {
    const { supabase, userId } = context;

    const { data: member } = await supabase
      .from("memberships")
      .select("role")
      .eq("org_id", data.orgId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) return { alerts: {}, errors: {} };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchWorkspaceModuleAlerts } = await import("@/lib/module-alerts.server");

    return fetchWorkspaceModuleAlerts({
      supabaseAdmin,
      orgId: data.orgId,
      workspaceId: data.workspaceId,
    });
  });
