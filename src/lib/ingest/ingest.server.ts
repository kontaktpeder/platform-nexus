// Server-only Gmail ingest: fetch recent messages, normalize, upsert to raw_signals.
// Best-effort: individual message failures do not abort the batch.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { normalizeGmailMessage, normalizeSlackMessage, type NormalizedSignal } from "./normalize";

const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const SLACK_GATEWAY = "https://connector-gateway.lovable.dev/slack/api";

export type IngestResult = {
  fetched: number;
  inserted: number;
  skipped: number;
  errors: string[];
};

type GmailListResp = {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
};
type GmailHeader = { name: string; value: string };
type GmailMeta = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: GmailHeader[] };
};

function gmailHeader(headers: GmailHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

async function gmailGet<T>(path: string, apiKey: string, lovableKey: string): Promise<T> {
  const res = await fetch(`${GMAIL_GATEWAY}${path}`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": apiKey,
    },
  });
  if (!res.ok) throw new Error(`gmail ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

/** List all message IDs for a query, paging until hardCap. */
async function listGmailMessageIds(opts: {
  apiKey: string;
  lovableKey: string;
  query: string;
  hardCap: number;
}): Promise<{ ids: string[]; errors: string[] }> {
  const ids: string[] = [];
  const errors: string[] = [];
  let pageToken: string | undefined;
  const pageSize = 100; // Gmail API max per page
  const q = encodeURIComponent(opts.query);

  for (let page = 0; page < 50 && ids.length < opts.hardCap; page += 1) {
    const tokenQs = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    try {
      const list = await gmailGet<GmailListResp>(
        `/users/me/messages?maxResults=${pageSize}&q=${q}${tokenQs}`,
        opts.apiKey,
        opts.lovableKey,
      );
      for (const m of list.messages ?? []) {
        ids.push(m.id);
        if (ids.length >= opts.hardCap) break;
      }
      pageToken = list.nextPageToken;
      if (!pageToken || !(list.messages?.length)) break;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "gmail list failed");
      break;
    }
  }
  return { ids, errors };
}

async function mapInChunks<T, R>(
  items: T[],
  chunkSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const part = await Promise.all(chunk.map(fn));
    out.push(...part);
  }
  return out;
}

export async function ingestGmail(opts: {
  supabase: SupabaseClient<Database>;
  userId: string;
  workspaceId?: string | null;
  max?: number;
  query?: string;
}): Promise<IngestResult> {
  const apiKey = process.env.GOOGLE_MAIL_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || !lovableKey) {
    return { fetched: 0, inserted: 0, skipped: 0, errors: ["gmail not connected"] };
  }
  const result: IngestResult = { fetched: 0, inserted: 0, skipped: 0, errors: [] };
  // Full last-30d inbox by default (paged). Cap avoids runaway runs.
  const hardCap = Math.min(Math.max(opts.max ?? 500, 1), 1000);
  const query = opts.query ?? "in:inbox newer_than:30d";

  const { ids, errors: listErrors } = await listGmailMessageIds({
    apiKey,
    lovableKey,
    query,
    hardCap,
  });
  result.errors.push(...listErrors);
  result.fetched = ids.length;
  if (ids.length === 0) return result;

  const metas = await mapInChunks(ids, 20, (id) =>
    gmailGet<GmailMeta>(
      `/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc`,
      apiKey,
      lovableKey,
    ).catch((err) => {
      result.errors.push(err instanceof Error ? err.message : `gmail meta ${id} failed`);
      return null;
    }),
  );

  const rows = metas
    .filter((m): m is GmailMeta => !!m)
    .map((m) =>
      normalizeGmailMessage({
        id: m.id,
        threadId: m.threadId,
        labelIds: m.labelIds,
        snippet: m.snippet,
        internalDate: m.internalDate,
        subject: gmailHeader(m.payload?.headers, "Subject"),
        from: gmailHeader(m.payload?.headers, "From"),
        to: gmailHeader(m.payload?.headers, "To"),
        cc: gmailHeader(m.payload?.headers, "Cc"),
      }),
    );

  return upsertSignals({
    supabase: opts.supabase,
    userId: opts.userId,
    workspaceId: opts.workspaceId ?? null,
    rows,
    result,
  });
}

// ── Slack ────────────────────────────────────────────────────────────────

type SlackResp<T> = T & { ok: boolean; error?: string };

async function slackCall<T>(
  method: string,
  init: { apiKey: string; lovableKey: string; query?: string; body?: unknown },
): Promise<SlackResp<T>> {
  const url = `${SLACK_GATEWAY}/${method}${init.query ? `?${init.query}` : ""}`;
  const isJson = init.body !== undefined;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${init.lovableKey}`,
      "X-Connection-Api-Key": init.apiKey,
      ...(isJson ? { "Content-Type": "application/json" } : {}),
    },
    body: isJson ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let json: SlackResp<T>;
  try {
    json = JSON.parse(text) as SlackResp<T>;
  } catch {
    throw new Error(`slack ${method} non-json ${res.status}`);
  }
  if (!json.ok) throw new Error(`slack ${method} ${json.error ?? "error"}`);
  return json;
}

type SlackChannel = { id: string; user?: string; is_im?: boolean };
type SlackHistoryMsg = { text?: string; ts: string; user?: string; thread_ts?: string };
type SlackAuth = { user_id: string };

export async function ingestSlack(opts: {
  supabase: SupabaseClient<Database>;
  userId: string;
  workspaceId?: string | null;
  maxDms?: number;
  maxPerChannel?: number;
  maxMentions?: number;
  onlyRuleId?: string | null;
}): Promise<IngestResult> {
  const apiKey = process.env.SLACK_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || !lovableKey) {
    return { fetched: 0, inserted: 0, skipped: 0, errors: ["slack not connected"] };
  }
  const result: IngestResult = { fetched: 0, inserted: 0, skipped: 0, errors: [] };
  const shared = { apiKey, lovableKey };
  const rows: NormalizedSignal[] = [];

  let me: SlackAuth;
  try {
    me = await slackCall<SlackAuth>("auth.test", shared);
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : "slack auth failed");
    return result;
  }

  // DMs
  const maxDms = opts.maxDms ?? 15;
  if (maxDms > 0) try {
    const dms = await slackCall<{ channels: SlackChannel[] }>("conversations.list", {
      ...shared,
      query: "types=im&limit=50",
    });
    const dmChannels = (dms.channels ?? []).slice(0, opts.maxDms ?? 15);
    for (const ch of dmChannels) {
      try {
        const hist = await slackCall<{ messages: SlackHistoryMsg[] }>(
          "conversations.history",
          { ...shared, query: `channel=${ch.id}&limit=${opts.maxPerChannel ?? 5}` },
        );
        for (const msg of hist.messages ?? []) {
          rows.push(
            normalizeSlackMessage({
              channel_id: ch.id,
              ts: msg.ts,
              thread_ts: msg.thread_ts ?? null,
              text: msg.text,
              user: msg.user ?? null,
              kind: "dm",
            }),
          );
        }
      } catch (err) {
        result.errors.push(err instanceof Error ? err.message : `slack dm ${ch.id} failed`);
      }
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : "slack dm list failed");
  }

  // Mentions via assistant.search.context
  const maxMentions = opts.maxMentions ?? 15;
  if (maxMentions > 0) try {
    const search = await slackCall<{
      results?: {
        messages?: {
          items?: Array<{
            text?: string;
            ts: string;
            thread_ts?: string;
            channel?: { id: string; name?: string };
            user?: string;
          }>;
        };
      };
    }>("assistant.search.context", {
      ...shared,
      body: {
        query: `<@${me.user_id}>`,
        content_types: ["messages"],
        channel_types: ["public_channel", "private_channel", "mpim", "im"],
        sort: "timestamp",
        sort_dir: "desc",
        limit: maxMentions,
      },
    });
    const items = search.results?.messages?.items ?? [];
    for (const it of items) {
      const channelId = it.channel?.id;
      if (!channelId) continue;
      rows.push(
        normalizeSlackMessage({
          channel_id: channelId,
          ts: it.ts,
          thread_ts: it.thread_ts ?? null,
          text: it.text,
          user: it.user ?? null,
          channel_name: it.channel?.name ?? null,
          kind: "mention",
        }),
      );
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : "slack mention search failed");
  }

  // Channel whitelist ingest (org-configured `slack_channel_ingest_rules`)
  try {
    const channelRows = await ingestSlackWhitelistedChannels({
      supabase: opts.supabase,
      shared,
      myUserId: me.user_id,
      result,
      onlyRuleId: opts.onlyRuleId ?? null,
    });
    rows.push(...channelRows);
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : "slack channel whitelist failed");
  }

  result.fetched = rows.length;
  return upsertSignals({
    supabase: opts.supabase,
    userId: opts.userId,
    workspaceId: opts.workspaceId ?? null,
    rows,
    result,
  });
}

// ── Slack channel whitelist ──────────────────────────────────────────────

type SlackRuleRow = {
  id: string;
  organization_id: string;
  slack_channel_id: string;
  slack_channel_name: string | null;
  enabled: boolean;
  ingest_mode: string;
  last_message_ts: string | null;
};

async function ingestSlackWhitelistedChannels(opts: {
  supabase: SupabaseClient<Database>;
  shared: { apiKey: string; lovableKey: string };
  myUserId: string;
  result: IngestResult;
  onlyRuleId: string | null;
}): Promise<NormalizedSignal[]> {
  const rows: NormalizedSignal[] = [];
  let q = opts.supabase
    .from("slack_channel_ingest_rules")
    .select("id, organization_id, slack_channel_id, slack_channel_name, enabled, ingest_mode, last_message_ts")
    .eq("enabled", true);
  if (opts.onlyRuleId) q = q.eq("id", opts.onlyRuleId);
  const { data: rules, error } = await q;
  if (error) {
    opts.result.errors.push(`slack rule lookup: ${error.message}`);
    return rows;
  }
  const list = (rules ?? []) as SlackRuleRow[];
  if (list.length === 0) return rows;

  // Admin client for updating last_message_ts even if the runner isn't org admin.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  for (const rule of list) {
    try {
      const query = new URLSearchParams({
        channel: rule.slack_channel_id,
        limit: "50",
      });
      if (rule.last_message_ts) query.set("oldest", rule.last_message_ts);
      const hist = await slackCall<{ messages: SlackHistoryMsg[] }>(
        "conversations.history",
        { ...opts.shared, query: query.toString() },
      );
      const msgs = (hist.messages ?? []).filter((m) => {
        if (!rule.last_message_ts) return true;
        return Number(m.ts) > Number(rule.last_message_ts);
      });
      let newestTs = rule.last_message_ts;
      for (const m of msgs) {
        rows.push(
          normalizeSlackMessage({
            channel_id: rule.slack_channel_id,
            ts: m.ts,
            thread_ts: m.thread_ts ?? null,
            text: m.text,
            user: m.user ?? null,
            channel_name: rule.slack_channel_name,
            kind: "channel",
            source_type: "slack_channel",
            mention_user_id: opts.myUserId,
          }),
        );
        if (!newestTs || Number(m.ts) > Number(newestTs)) newestTs = m.ts;
      }
      const { error: upErr } = await supabaseAdmin
        .from("slack_channel_ingest_rules")
        .update({
          last_message_ts: newestTs,
          last_ingested_at: new Date().toISOString(),
        })
        .eq("id", rule.id);
      if (upErr) opts.result.errors.push(`slack rule ${rule.id} bookmark: ${upErr.message}`);
    } catch (err) {
      opts.result.errors.push(
        err instanceof Error ? err.message : `slack channel ${rule.slack_channel_id} failed`,
      );
    }
  }
  return rows;
}

// ── Upsert ───────────────────────────────────────────────────────────────

function errMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const e = err as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    const parts = [e.message, e.code, e.details, e.hint]
      .filter((p): p is string => typeof p === "string" && p.length > 0);
    if (parts.length) return parts.join(" — ");
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

async function upsertSignals(opts: {
  supabase: SupabaseClient<Database>;
  userId: string;
  workspaceId: string | null;
  rows: NormalizedSignal[];
  result: IngestResult;
}): Promise<IngestResult> {
  const { supabase, userId, workspaceId, rows, result } = opts;
  if (rows.length === 0) return result;

  // Dedupe within batch (same external_id can appear twice, e.g. mention + DM)
  const uniq = new Map<string, NormalizedSignal>();
  for (const r of rows) {
    uniq.set(`${r.source}:${r.external_id}`, r);
  }
  const deduped = Array.from(uniq.values());

  // Which already exist? So we can report inserted vs skipped accurately.
  const externalIds = deduped.map((r) => r.external_id);
  const sources = Array.from(new Set(deduped.map((r) => r.source)));

  let existing: Set<string> = new Set();
  try {
    const { data, error } = await supabase
      .from("raw_signals")
      .select("source, external_id")
      .eq("user_id", userId)
      .in("source", sources)
      .in("external_id", externalIds);
    if (error) throw error;
    existing = new Set((data ?? []).map((row) => `${row.source}:${row.external_id}`));
  } catch (err) {
    result.errors.push(errMessage(err));
  }

  const toInsert = deduped.filter((r) => !existing.has(`${r.source}:${r.external_id}`));
  const alreadyKnown = deduped.length - toInsert.length;
  result.skipped += alreadyKnown;

  if (toInsert.length > 0) {
    const payload = toInsert.map((r) => ({
      user_id: userId,
      workspace_id: workspaceId,
      source: r.source,
      external_id: r.external_id,
      external_thread_id: r.external_thread_id,
      raw_text: r.raw_text,
      summary: r.summary,
      status: "new" as const,
      occurred_at: r.occurred_at,
      metadata: r.metadata as unknown as import("@/integrations/supabase/types").Database["public"]["Tables"]["raw_signals"]["Insert"]["metadata"],
    }));

    // Insert-only (no onConflict) — works even before unique-constraint migration.
    // Race duplicates surface as 23505 and are counted as skipped.
    const { error } = await supabase.from("raw_signals").insert(payload);
    if (error) {
      const msg = errMessage(error);
      const isDup =
        (typeof error === "object" &&
          error &&
          "code" in error &&
          (error as { code?: string }).code === "23505") ||
        /duplicate|unique/i.test(msg);
      if (isDup) {
        // Concurrent insert — treat as known; identity layer still runs below.
        result.skipped += toInsert.length;
      } else {
        result.errors.push(msg);
        // Still try identity on any rows that already exist in DB.
      }
    } else {
      result.inserted += toInsert.length;
    }
  }

  // Deterministic identity layer — runs for every row in batch (new + existing).
  try {
    const { data: signalRows, error: selErr } = await supabase
      .from("raw_signals")
      .select("id, source, external_id, occurred_at, summary, metadata")
      .eq("user_id", userId)
      .in("source", sources)
      .in("external_id", externalIds);
    if (selErr) throw selErr;

    if (signalRows && signalRows.length > 0) {
      const { processBatchSignalIdentities } = await import(
        "@/lib/knowledge/identity/identity.server"
      );
      await processBatchSignalIdentities(
        supabase,
        userId,
        signalRows.map((row) => ({
          id: row.id as string,
          source: row.source as string,
          external_id: row.external_id as string | null,
          occurred_at: row.occurred_at as string | null,
          summary: row.summary as string | null,
          metadata: (row.metadata ?? {}) as Record<string, unknown>,
        })),
      );
      // Auto-promote is called by the Innboks/Mission pipeline after ingest
      // so status counts stay accurate (one promote pass).
    }
  } catch (err) {
    result.errors.push(errMessage(err));
  }
  return result;
}
