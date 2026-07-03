import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WidgetDataMap } from "@/lib/widget-data.functions";
import type { WorkspaceModule } from "@/lib/workspaceContext";
import type { ModuleConnectionRow } from "@/lib/module-connections";
import type { InboxAction } from "@/lib/inbox/types";
import type { MissionActionState } from "@/lib/mission-action-state";
import type { UserCommitment } from "@/lib/knowledge/commitment.types";
import { todayOsloISO } from "@/lib/knowledge/commitment.types";

export type GlobalWorkspaceEntry = {
  orgId: string;
  orgSlug: string;
  orgName: string;
  workspaceId: string;
  wsSlug: string;
  wsName: string;
  widgetData: WidgetDataMap;
  modules: WorkspaceModule[];
};

export type InboxSourceMeta = {
  connected: boolean;
  error: string | null;
  count: number;
};

export type EntityLink = {
  entityId: string;
  entityName: string;
  entitySlug: string;
  linkSource?: "manual" | "auto";
};

export type GlobalMissionData = {
  orgs: { id: string; name: string; slug: string }[];
  workspaces: GlobalWorkspaceEntry[];
  inbox: InboxAction[];
  inboxSources: { gmail: boolean; slack: boolean };
  inboxMeta: { gmail: InboxSourceMeta; slack: InboxSourceMeta };
  actionStates: MissionActionState[];
  entityLinks: Record<string, EntityLink>;
  openCommitments: UserCommitment[];
};

// TSS serialization validation trips on `unknown` fields inside
// ModuleConnectionRow.module_info_snapshot / WorkspaceModule.config.
// Payload is real JSON — we send it through JSON.parse(JSON.stringify(...))
// and cast to keep the strict client-facing types.
export const getGlobalMissionData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { loadMissionSnapshot } = await import("@/lib/mission-snapshot.server");
    const snapshot = await loadMissionSnapshot(supabase, userId);
    // Drop derived actions from wire payload — /mission builds them client-side.
    const {
      globalActions: _ga,
      workspaceActions: _wa,
      ...wire
    } = snapshot;
    void _ga;
    void _wa;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return JSON.parse(JSON.stringify(wire)) as any;
  });



