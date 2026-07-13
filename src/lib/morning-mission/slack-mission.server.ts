// Slack signals for Morning Mission — mentions + DMs, current ISO week only (Europe/Oslo).
import type { MissionSignal } from "@/lib/morning-mission/signal-prefilter.server";
import type { SlackMissionStatus } from "@/lib/morning-mission.types";
import { isSameOsloWeek, isSlackTsThisWeek, osloWeekStartUnix, slackTsToIso } from "@/lib/oslo-week";

const GATEWAY = "https://connector-gateway.lovable.dev/slack/api";

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
      : "Legg til SLACK_API_KEY i Lovable Cloud for å lese mentions og DM-er.",
  };
}

export async function fetchSlackMissionSignals(): Promise<{
  signals: MissionSignal[];
  status: SlackMissionStatus;
}> {
  const apiKey = process.env.SLACK_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  const weekNumber = parseInt(
    new Intl.DateTimeFormat("en-US", { week: "numeric", timeZone: "Europe/Oslo" }).format(
      new Date(),
    ),
    10,
  );

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

  try {
    const me = await slackCall<AuthTest>("auth.test", shared);
    const teamHome = me.url?.replace(/\/$/, "") ?? "https://slack.com";
    const nameCache = new Map<string, string>();

    async function displayName(userId: string): Promise<string> {
      if (nameCache.has(userId)) return nameCache.get(userId)!;
      try {
        const info = await slackCall<{
          user: { profile?: { display_name?: string; real_name?: string }; name?: string };
        }>("users.info", {
          ...shared,
          query: `user=${encodeURIComponent(userId)}`,
        });
        const p = info.user.profile;
        const name = p?.display_name || p?.real_name || info.user.name || userId;
        nameCache.set(userId, name);
        return name;
      } catch {
        return userId;
      }
    }

    // Mentions — only this week
    try {
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
          limit: 30,
        },
      });
      const items = search.results?.messages?.items ?? [];
      const seen = new Set<string>();
      for (const it of items) {
        if (!isSlackTsThisWeek(it.ts)) continue;
        const channelId = it.channel?.id ?? "";
        if (!channelId) continue;
        const key = `${channelId}:${it.ts}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const ch = channelLabel(it.channel?.name);
        const sender = it.user ? await displayName(it.user) : "Ukjent";
        const snippet = (it.text ?? "").slice(0, 200);
        signals.push({
          id: `slack:mention:${channelId}:${it.ts}`,
          source: "slack",
          subject: `${ch}: nevnt av ${sender}`,
          from: `Slack · ${ch}`,
          snippet,
          occurred_at: slackTsToIso(it.ts),
          href: `${teamHome}/archives/${channelId}/p${it.ts.replace(".", "")}`,
          tags: ["slack_mention", "slack_week"],
          meta: {
            channel_id: channelId,
            channel_name: it.channel?.name ?? null,
            ts: it.ts,
            kind: "mention",
          },
        });
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "mention search failed");
    }

    // DMs — messages from others this week
    try {
      const dms = await slackCall<{ channels: Channel[] }>("conversations.list", {
        ...shared,
        query: "types=im&limit=50",
      });
      const seenDm = new Set<string>();
      for (const channel of (dms.channels ?? []).slice(0, 20)) {
        try {
          const query = new URLSearchParams({
            channel: channel.id,
            limit: "20",
            oldest: String(weekStart),
          });
          const hist = await slackCall<{ messages: HistoryMsg[] }>("conversations.history", {
            ...shared,
            query: query.toString(),
          });
          const senderName = channel.user ? await displayName(channel.user) : "DM";
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
              meta: {
                channel_id: channel.id,
                ts: m.ts,
                kind: "dm",
              },
            });
          }
        } catch {
          // skip this DM channel
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "dm list failed");
    }

    const activity = signals.length;
    const mentionCount = signals.filter((s) => s.tags.includes("slack_mention")).length;
    const dmCount = signals.filter((s) => s.tags.includes("slack_dm")).length;

    let message: string;
    let suggestion: string | null = null;

    if (activity === 0) {
      message = "Slack: Ingen mentions eller DM-er denne uken.";
      suggestion =
        "Du har kanskje ikke mottatt ukeplan fra organisasjonen ennå — ingen har nevnt deg eller sendt DM siden mandag.";
    } else {
      const parts: string[] = [];
      if (mentionCount > 0) {
        parts.push(`${mentionCount} ${mentionCount === 1 ? "mention" : "mentions"}`);
      }
      if (dmCount > 0) {
        parts.push(`${dmCount} ${dmCount === 1 ? "DM" : "DM-er"}`);
      }
      message = `Slack: ${parts.join(" og ")} denne uken.`;
    }

    if (errors.length > 0 && activity === 0) {
      message = "Slack: Kunne ikke lese aktivitet denne uken.";
      suggestion = errors[0] ?? "Sjekk Slack-tilkoblingen i Lovable Cloud.";
    }

    return {
      signals,
      status: {
        connected: true,
        read_ok: errors.length === 0 || activity > 0,
        activity_this_week: activity,
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

/** Prefer this_week items that actually come from slack signals. */
export function slackSignalsThisWeek(signals: MissionSignal[]): MissionSignal[] {
  return signals.filter(
    (s) => s.source === "slack" && isSameOsloWeek(s.occurred_at),
  );
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
    .slice(0, 8)
    .map((s) => ({
      id: `slack-week:${s.id}`,
      title: s.subject,
      explanation: s.snippet,
      recommended_action: "Les tråden og vurder om det hører til ukeplanen.",
      priority: "medium" as const,
      source_ids: [s.id],
      source_label: s.from,
      href: s.href,
    }));

  if (extras.length === 0) return payload;
  return { ...payload, this_week: [...payload.this_week, ...extras] };
}
