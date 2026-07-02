// Shared helper: build MissionSignalDescriptors for a signed-in user.
// Used by both getGlobalMissionData (auto-link) and suggestKnowledgeEntities.
// No behavior change vs the previous inline descriptors in global-mission.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { MissionSignalDescriptor } from "@/lib/knowledge/auto-link.server";
import type { InboxAction } from "@/lib/inbox/types";

type DB = SupabaseClient<Database>;

export function inboxDescriptors(inbox: InboxAction[]): MissionSignalDescriptor[] {
  return inbox.map((i) => ({
    source: i.source,
    externalRef: i.key,
    sender: i.sender ?? null,
    senderEmail: i.senderEmail ?? null,
    channelName: i.channelName ?? null,
    signalType:
      i.source === "gmail"
        ? "message.received"
        : i.key.startsWith("slack:dm:")
          ? "dm.unread"
          : "mention.received",
    occurredAt: i.occurredAt ?? null,
    snippet: null,
  }));
}

export type WorkspaceDescriptorInput = {
  orgSlug: string;
  orgName: string;
  wsSlug: string;
  wsName: string;
};

export function workspaceDescriptors(
  workspaces: WorkspaceDescriptorInput[],
): MissionSignalDescriptor[] {
  const out: MissionSignalDescriptor[] = [];
  const seen = new Set<string>();
  for (const ws of workspaces) {
    const ref = `ws:${ws.orgSlug}`;
    if (seen.has(ref)) continue;
    seen.add(ref);
    out.push({
      source: "workspace",
      externalRef: ref,
      orgSlug: ws.orgSlug,
      orgName: ws.orgName,
      wsSlug: ws.wsSlug,
      wsName: ws.wsName,
      signalType: "workspace.org",
      occurredAt: null,
      snippet: null,
    });
  }
  return out;
}

/**
 * Build the full descriptor list for the user: current Gmail + Slack inbox,
 * plus a workspace descriptor per org (via memberships). Safe to call from
 * any server function that already has an authenticated Supabase client.
 */
export async function buildMissionSignalDescriptors(
  supabase: DB,
  userId: string,
): Promise<MissionSignalDescriptor[]> {
  const { fetchGmailActionsWithMeta } = await import("@/lib/inbox/gmail.server");
  const { fetchSlackActions } = await import("@/lib/inbox/slack.server");

  const [gmailRes, slack, memberships] = await Promise.all([
    fetchGmailActionsWithMeta().catch(() => ({ actions: [], error: null })),
    fetchSlackActions().catch(() => [] as InboxAction[]),
    supabase.from("memberships").select("org_id").eq("user_id", userId),
  ]);
  const inbox = [...gmailRes.actions, ...slack];
  const inboxDs = inboxDescriptors(inbox);

  const orgIds = (memberships.data ?? []).map((m) => m.org_id as string);
  let wsDs: MissionSignalDescriptor[] = [];
  if (orgIds.length > 0) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [orgsRes, wsRes] = await Promise.all([
      supabaseAdmin
        .from("organizations")
        .select("id, name, slug")
        .in("id", orgIds),
      supabaseAdmin
        .from("workspaces")
        .select("id, name, slug, org_id")
        .in("org_id", orgIds),
    ]);
    const orgById = new Map(
      (orgsRes.data ?? []).map((o) => [o.id as string, o]),
    );
    const inputs: WorkspaceDescriptorInput[] = [];
    for (const ws of wsRes.data ?? []) {
      const org = orgById.get(ws.org_id as string);
      if (!org) continue;
      inputs.push({
        orgSlug: (org.slug as string) ?? "",
        orgName: (org.name as string) ?? "",
        wsSlug: (ws.slug as string) ?? "",
        wsName: (ws.name as string) ?? "",
      });
    }
    wsDs = workspaceDescriptors(inputs);
  }

  return [...inboxDs, ...wsDs];
}
