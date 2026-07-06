// CRUD + test-ingest for Slack channel whitelist rules.
// RLS in slack_channel_ingest_rules enforces admin-only mutations.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ingestSlack, type IngestResult } from "./ingest/ingest.server";

const uuid = z.string().uuid();

export type SlackChannelRule = {
  id: string;
  organization_id: string;
  slack_channel_id: string;
  slack_channel_name: string | null;
  enabled: boolean;
  ingest_mode: string;
  last_message_ts: string | null;
  last_ingested_at: string | null;
  created_at: string;
  updated_at: string;
};

export const listSlackChannelRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: uuid }).parse(input),
  )
  .handler(async ({ data, context }): Promise<SlackChannelRule[]> => {
    const { data: rows, error } = await context.supabase
      .from("slack_channel_ingest_rules")
      .select(
        "id, organization_id, slack_channel_id, slack_channel_name, enabled, ingest_mode, last_message_ts, last_ingested_at, created_at, updated_at",
      )
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as SlackChannelRule[];
  });

const RuleInput = z.object({
  organizationId: uuid,
  slackChannelId: z.string().trim().min(1).max(64),
  slackChannelName: z.string().trim().max(120).nullish(),
  enabled: z.boolean().optional(),
  ingestMode: z
    .enum(["new_messages", "mentions_only", "thread_replies", "manual_only"])
    .optional(),
});

export const upsertSlackChannelRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RuleInput.parse(input))
  .handler(async ({ data, context }): Promise<SlackChannelRule> => {
    const channelId = data.slackChannelId.replace(/^#/, "").trim();
    const payload = {
      organization_id: data.organizationId,
      slack_channel_id: channelId,
      slack_channel_name: data.slackChannelName?.replace(/^#/, "") ?? null,
      enabled: data.enabled ?? true,
      ingest_mode: data.ingestMode ?? "new_messages",
      created_by: context.userId,
    };
    const { data: row, error } = await context.supabase
      .from("slack_channel_ingest_rules")
      .upsert(payload, { onConflict: "organization_id,slack_channel_id" })
      .select(
        "id, organization_id, slack_channel_id, slack_channel_name, enabled, ingest_mode, last_message_ts, last_ingested_at, created_at, updated_at",
      )
      .single();
    if (error || !row) throw new Error(error?.message ?? "Kunne ikke lagre regel");
    return row as SlackChannelRule;
  });

export const setSlackChannelRuleEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ruleId: uuid, enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("slack_channel_ingest_rules")
      .update({ enabled: data.enabled })
      .eq("id", data.ruleId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSlackChannelRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ ruleId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("slack_channel_ingest_rules")
      .delete()
      .eq("id", data.ruleId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// "Test hent siste meldinger" — runs full Slack ingest but only for one rule.
export const testSlackChannelIngest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ ruleId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<IngestResult> => {
    return ingestSlack({
      supabase: context.supabase,
      userId: context.userId,
      workspaceId: null,
      // Skip DM + mention scans for a targeted test
      maxDms: 0,
      maxMentions: 0,
      onlyRuleId: data.ruleId,
    });
  });
