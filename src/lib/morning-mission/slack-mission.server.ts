// Slack signals for Morning Mission — mentions + DMs + whitelisted channels (ISO week, Europe/Oslo).
import type { MissionSignal } from "@/lib/morning-mission/signal-prefilter.server";
import type { SlackMissionStatus } from "@/lib/morning-mission.types";
import { isSameOsloWeek, isSlackTsThisWeek, osloWeekNumber, osloWeekStartUnix, slackTsToIso } from "@/lib/oslo-week";
import { summarizeSignalForCard } from "@/lib/morning-mission/relation-summary.server";

const GATEWAY = "https://connector-gateway.lovable.dev/slack/api";
const SLACK_CACHE_MS = 5 * 60_000;
const DM_CHANNEL_LIMIT = 8;
const MENTION_LIMIT = 15;
const WHITELIST_CHANNEL_LIMIT = 12;
const WHITELIST_HISTORY_LIMIT = 25;

/** Nudge Mission when channel posts look like actionable ops asks. */
const ACTION_HINT =
  /\b(timeliste|timesheet|timef[øo]ring|lever\w*|frist|deadline|husk|p[åa]minn)/i;

type SlackFetchResult = { signals: MissionSignal[]; status: SlackMissionStatus };

let slackCache: { at: number; orgKey: string; result: SlackFetchResult } | null = null;

type SlackResp<T> = T & { ok: boolean; error?: string };

async function slackCall<T>(
  method: string,
  init: {
    apiKey: string;
    lovableKey: string;
    query?: string;
    body?: unknown;
  },
): Promise<SlackResp<T>> {
  const url = `${GATEWAY}/${method}${init.query ? `?${init.query}` : ""}`;
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

type AuthTest = { user_id: string; url?: string };
type Channel = { id: string; user?: string };
type HistoryMsg = { text?: string; ts: string; thread_ts?: string; user?: string };

function channelLabel(name: string | null | undefined): string {
  if (!name) return "Slack";
  return name.startsWith("#") ? name : `#${name}`;
}

function slackStatusBase(connected: boolean): SlackMissionStatus {
  return {
    connected,
    read_ok: false,
    activity_this_week: 0,
    week_number: null,
    message: connected ? "Leser Slack …" : "Slack er ikke koblet.",
    suggestion: connected
      ? null
      : "Legg til SLACK_API_KEY i Lovable Cloud for å lese Slack-aktivitet.",
  };
}

function buildStatusMessage(signals: MissionSignal[]): Pick<SlackMissionStatus, "message" | "suggestion"> {
  const activity = signals.length;
  const mentionCount = signals.filter((s) => s.tags.includes("slack_mention")).length;
  const dmCount = signals.filter((s) => s.tags.includes("slack_dm")).length;
  const channelCount = signals.filter((s) => s.tags.includes("slack_channel")).length;

  if (activity === 0) {
    return {
      message: "Slack: Ingen mentions, DM-er eller kanalmeldinger denne uken.",
      suggestion:
        "Mentions/DM plukkes automatisk. Kanaler som #drift må være aktivert under Slack-kanaler for org-en.",
    };
  }

  const parts: string[] = [];
  if (mentionCount > 0) parts.push(`${mentionCount} ${mentionCount === 1 ? "mention" : "mentions"}`);
  if (dmCount > 0) parts.push(`${dmCount} ${dmCount === 1 ? "DM" : "DM-er"}`);
  if (channelCount > 0) {
    parts.push(`${channelCount} ${channelCount === 1 ? "kanalmelding" : "kanalmeldinger"}`);
  }
  return { message: `Slack: ${parts.join(", ")} denne uken.`, suggestion: null };
}

async function resolveDisplayNames(
  userIds: string[],
  shared: { apiKey: string; lovableKey: string },
  cache: Map<string, string>,
): Promise<void> {
  const missing = userIds.filter((id) => id && !cache.has(id));
  await Promise.all(
    missing.map(async (userId) => {
      try {
        const info = await slackCall<{
          user: { profile?: { display_name?: string; real_name?: string }; name?: string };
        }>("users.info", {
          ...shared,
          query: `user=${encodeURIComponent(userId)}`,
        });
        const p = info.user.profile;
        cache.set(userId, p?.display_name || p?.real_name || info.user.name || userId);
      } catch {
        cache.set(userId, userId);
      }
    }),
  );
}

async function fetchWhitelistedChannelSignals(opts: {
  shared: { apiKey: string; lovableKey: string };
  meUserId: string;
  teamHome: string;
  organizationIds: string[];
  weekStart: number;
  nameCache: Map<string, string>;
  errors: string[];
}): Promise<MissionSignal[]> {
  const signals: MissionSignal[] = [];
  if (!opts.organizationIds.length) return signals;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rules, error } = await supabaseAdmin
    .from("slack_channel_ingest_rules")
    .select("id, slack_channel_id, slack_channel_name, ingest_mode")
    .eq("enabled", true)
    .in("organization_id", opts.organizationIds)
    .limit(WHITELIST_CHANNEL_LIMIT);

  if (error) {
    opts.errors.push(`slack channel rules: ${error.message}`);
    return signals;
  }
  const list = rules ?? [];
  if (!list.length) return signals;

  const histories = await Promise.allSettled(
    list.map((rule) =>
      slackCall<{ messages: HistoryMsg[] }>("conversations.history", {
        ...opts.shared,
        query: new URLSearchParams({
          channel: rule.slack_channel_id,
          limit: String(WHITELIST_HISTORY_LIMIT),
          oldest: String(opts.weekStart),
        }).toString(),
      }).then((hist) => ({ rule, hist })),
    ),
  );

  const userIds = new Set<string>();
  for (const result of histories) {
    if (result.status !== "fulfilled") continue;
    for (const m of result.value.hist.messages ?? []) {
      if (m.user) userIds.add(m.user);
    }
  }
  await resolveDisplayNames([...userIds], opts.shared, opts.nameCache);

  const seen = new Set<string>();
  for (const result of histories) {
    if (result.status !== "fulfilled") {
      opts.errors.push(
        result.reason instanceof Error ? result.reason.message : "channel history failed",
      );
      continue;
    }
    const { rule, hist } = result.value;
    const ch = channelLabel(rule.slack_channel_name ?? rule.slack_channel_id);
    const mode = rule.ingest_mode ?? "new_messages";

    for (const m of hist.messages ?? []) {
      if (!m.ts || !isSlackTsThisWeek(m.ts)) continue;
      if (m.user === opts.meUserId) continue;
      const text = (m.text ?? "").trim();
      if (!text) continue;

      if (mode === "mentions_only") {
        if (!text.includes(`<@${opts.meUserId}>`)) continue;
      }
      if (mode === "manual_only") continue;
      // thread_replies: still include top-level + replies from history (history has both)

      const key = `${rule.slack_channel_id}:${m.ts}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const sender = m.user ? (opts.nameCache.get(m.user) ?? "Ukjent") : "Ukjent";
      const action = ACTION_HINT.test(text);
      const tags = ["slack_channel", "slack_week"];
      if (action) tags.push("slack_action", "ops");

      signals.push({
        id: `slack:channel:${rule.slack_channel_id}:${m.ts}`,
        source: "slack",
        subject: action ? `${ch}: ${text.slice(0, 80)}` : `${ch}: melding fra ${sender}`,
        from: `Slack · ${ch}`,
        snippet: text.slice(0, 200),
        occurred_at: slackTsToIso(m.ts),
        href: `${opts.teamHome}/archives/${rule.slack_channel_id}/p${m.ts.replace(".", "")}`,
        tags,
        meta: {
          channel_id: rule.slack_channel_id,
          channel_name: rule.slack_channel_name,
          ts: m.ts,
          kind: "channel",
          action_hint: action,
        },
      });
    }
  }

  return signals;
}

async function fetchSlackMissionSignalsUncached(opts?: {
  organizationIds?: string[];
}): Promise<SlackFetchResult> {
  const apiKey = process.env.SLACK_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  const weekNumber = osloWeekNumber();
  const organizationIds = [...new Set((opts?.organizationIds ?? []).filter(Boolean))];

  if (!apiKey || !lovableKey) {
    return {
      signals: [],
      status: {
        ...slackStatusBase(false),
        week_number: weekNumber,
        message: "Slack er ikke koblet.",
        suggestion: "Legg til SLACK_API_KEY i Lovable Cloud.",
      },
    };
  }

  const shared = { apiKey, lovableKey };
  const signals: MissionSignal[] = [];
  const errors: string[] = [];
  const weekStart = osloWeekStartUnix();
  const nameCache = new Map<string, string>();

  try {
    const me = await slackCall<AuthTest>("auth.test", shared);
    const teamHome = me.url?.replace(/\/$/, "") ?? "https://slack.com";

    const [mentionResult, dmListResult, channelSignals] = await Promise.all([
      slackCall<{
        results?: {
          messages?: {
            items?: Array<{
              text?: string;
              ts: string;
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
          limit: MENTION_LIMIT,
        },
      }).then(
        (v) => ({ status: "fulfilled" as const, value: v }),
        (reason) => ({ status: "rejected" as const, reason }),
      ),
      slackCall<{ channels: Channel[] }>("conversations.list", {
        ...shared,
        query: "types=im&limit=30",
      }).then(
        (v) => ({ status: "fulfilled" as const, value: v }),
        (reason) => ({ status: "rejected" as const, reason }),
      ),
      fetchWhitelistedChannelSignals({
        shared,
        meUserId: me.user_id,
        teamHome,
        organizationIds,
        weekStart,
        nameCache,
        errors,
      }),
    ]);

    signals.push(...channelSignals);

    // Mentions — only this week
    if (mentionResult.status === "fulfilled") {
      const items = mentionResult.value.results?.messages?.items ?? [];
      const weekItems = items.filter((it) => it.ts && isSlackTsThisWeek(it.ts) && it.channel?.id);
      const userIds = weekItems.map((it) => it.user).filter(Boolean) as string[];
      await resolveDisplayNames(userIds, shared, nameCache);

      const seen = new Set<string>();
      for (const it of weekItems) {
        const channelId = it.channel!.id;
        const key = `${channelId}:${it.ts}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ch = channelLabel(it.channel?.name);
        const sender = it.user ? (nameCache.get(it.user) ?? "Ukjent") : "Ukjent";
        signals.push({
          id: `slack:mention:${channelId}:${it.ts}`,
          source: "slack",
          subject: `${ch}: nevnt av ${sender}`,
          from: `Slack · ${ch}`,
          snippet: (it.text ?? "").slice(0, 200),
          occurred_at: slackTsToIso(it.ts),
          href: `${teamHome}/archives/${channelId}/p${it.ts.replace(".", "")}`,
          tags: ["slack_mention", "slack_week"],
          meta: { channel_id: channelId, channel_name: it.channel?.name ?? null, ts: it.ts, kind: "mention" },
        });
      }
    } else {
      errors.push(
        mentionResult.reason instanceof Error ? mentionResult.reason.message : "mention search failed",
      );
    }

    // DMs — parallel history per channel (capped)
    if (dmListResult.status === "fulfilled") {
      const dmChannels = (dmListResult.value.channels ?? []).slice(0, DM_CHANNEL_LIMIT);
      const dmUserIds = dmChannels.map((c) => c.user).filter(Boolean) as string[];
      await resolveDisplayNames(dmUserIds, shared, nameCache);

      const dmHistories = await Promise.allSettled(
        dmChannels.map((channel) =>
          slackCall<{ messages: HistoryMsg[] }>("conversations.history", {
            ...shared,
            query: new URLSearchParams({
              channel: channel.id,
              limit: "10",
              oldest: String(weekStart),
            }).toString(),
          }).then((hist) => ({ channel, hist })),
        ),
      );

      const seenDm = new Set<string>();
      for (const result of dmHistories) {
        if (result.status !== "fulfilled") continue;
        const { channel, hist } = result.value;
        const senderName = channel.user ? (nameCache.get(channel.user) ?? "DM") : "DM";
        for (const m of hist.messages ?? []) {
          if (!m.ts || !isSlackTsThisWeek(m.ts)) continue;
          if (m.user === me.user_id) continue;
          const text = (m.text ?? "").trim();
          if (!text) continue;
          const key = `${channel.id}:${m.ts}`;
          if (seenDm.has(key)) continue;
          seenDm.add(key);
          signals.push({
            id: `slack:dm:${channel.id}:${m.ts}`,
            source: "slack",
            subject: `DM fra ${senderName}`,
            from: "Slack · DM",
            snippet: text.slice(0, 200),
            occurred_at: slackTsToIso(m.ts),
            href: `${teamHome}/messages/${channel.id}`,
            tags: ["slack_dm", "slack_week"],
            meta: { channel_id: channel.id, ts: m.ts, kind: "dm" },
          });
        }
      }
    } else {
      errors.push(dmListResult.reason instanceof Error ? dmListResult.reason.message : "dm list failed");
    }

    const statusMsg = buildStatusMessage(signals);
    let message = statusMsg.message;
    let suggestion = statusMsg.suggestion;

    if (errors.length > 0 && signals.length === 0) {
      message = "Slack: Kunne ikke lese aktivitet denne uken.";
      suggestion = errors[0] ?? "Sjekk Slack-tilkoblingen i Lovable Cloud.";
    } else if (
      organizationIds.length > 0 &&
      !signals.some((s) => s.tags.includes("slack_channel")) &&
      signals.length === 0
    ) {
      suggestion =
        (suggestion ? `${suggestion} ` : "") +
        "Aktiver #drift (eller andre kanaler) under Slack-kanaler for org-en.";
    }

    return {
      signals,
      status: {
        connected: true,
        read_ok: errors.length === 0 || signals.length > 0,
        activity_this_week: signals.length,
        week_number: weekNumber,
        message,
        suggestion,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Slack-feil";
    return {
      signals: [],
      status: {
        connected: true,
        read_ok: false,
        activity_this_week: 0,
        week_number: weekNumber,
        message: "Slack: Kunne ikke lese denne uken.",
        suggestion: msg,
      },
    };
  }
}

export async function fetchSlackMissionSignals(opts?: {
  force?: boolean;
  organizationIds?: string[];
}): Promise<SlackFetchResult> {
  const now = Date.now();
  const orgKey = [...new Set(opts?.organizationIds ?? [])].sort().join(",");
  if (
    !opts?.force &&
    slackCache &&
    slackCache.orgKey === orgKey &&
    now - slackCache.at < SLACK_CACHE_MS
  ) {
    return slackCache.result;
  }
  const result = await fetchSlackMissionSignalsUncached({
    organizationIds: opts?.organizationIds,
  });
  slackCache = { at: now, orgKey, result };
  return result;
}

/** Drop AI items that claim Slack without a matching slack signal id. */
export function stripHallucinatedSlackItems<T extends { source_ids: string[]; source_label?: string | null }>(
  items: T[],
  signals: MissionSignal[],
): T[] {
  const slackIds = new Set(signals.filter((s) => s.source === "slack").map((s) => s.id));
  const hasSlack = slackIds.size > 0;

  return items.filter((item) => {
    const idsClaimSlack = item.source_ids.some((id) => id.startsWith("slack:"));
    const labelClaimsSlack = /slack|#\w/i.test(item.source_label ?? "");
    if (!labelClaimsSlack && !idsClaimSlack) return true;
    if (idsClaimSlack && item.source_ids.some((id) => slackIds.has(id))) return true;
    if (!hasSlack && (labelClaimsSlack || idsClaimSlack)) return false;
    if (labelClaimsSlack && !item.source_ids.some((id) => slackIds.has(id))) return false;
    return true;
  });
}

export function slackSignalsThisWeek(signals: MissionSignal[]): MissionSignal[] {
  return signals.filter((s) => s.source === "slack" && isSameOsloWeek(s.occurred_at));
}

export function ensureSlackWeeklyItems(
  payload: import("@/lib/morning-mission.types").MorningMissionPayload,
  signals: MissionSignal[],
): import("@/lib/morning-mission.types").MorningMissionPayload {
  const slack = slackSignalsThisWeek(signals);
  if (slack.length === 0) return payload;

  const usedIds = new Set(
    [...payload.this_week, ...payload.today, ...payload.waiting].flatMap((i) => i.source_ids),
  );

  const extras = slack
    .filter((s) => !usedIds.has(s.id))
    .slice(0, 12)
    .map((s) => {
      const action = s.tags.includes("slack_action");
      return {
        id: `slack-week:${s.id}`,
        title: s.subject,
        explanation: summarizeSignalForCard(s),
        recommended_action: action
          ? "Følg opp (f.eks. lever timeliste) og kryss av når det er gjort."
          : "Les tråden og vurder om det hører til ukeplanen.",
        priority: action ? ("high" as const) : ("medium" as const),
        source_ids: [s.id],
        source_label: s.from,
        href: s.href,
      };
    });

  if (extras.length === 0) return payload;

  const high = extras.filter((e) => e.priority === "high");
  const rest = extras.filter((e) => e.priority !== "high");
  return {
    ...payload,
    today: high.length ? [...high, ...payload.today] : payload.today,
    this_week: [...payload.this_week, ...rest],
  };
}
