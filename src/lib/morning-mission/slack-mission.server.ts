// Slack signals for Morning Mission — current ISO week only (Europe/Oslo).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
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
      : "Legg til SLACK_API_KEY i Lovable Cloud for å lese kanaler og mentions.",
  };
}

export async function fetchSlackMissionSignals(input: {
  supabaseAdmin: SupabaseClient<Database>;
  userId: string;
  orgIds: string[];
}): Promise<{ signals: MissionSignal[]; status: SlackMissionStatus }> {
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

    // Whitelisted org channels — messages since Monday
    let ruleCount = 0;
    if (input.orgIds.length > 0) {
      const { data: rules } = await input.supabaseAdmin
        .from("slack_channel_ingest_rules")
        .select("slack_channel_id, slack_channel_name, organization_id")
        .eq("enabled", true)
        .in("organization_id", input.orgIds);

      ruleCount = rules?.length ?? 0;

      for (const rule of rules ?? []) {
        try {
          const query = new URLSearchParams({
            channel: rule.slack_channel_id,
            limit: "50",
            oldest: String(weekStart),
          });
          const hist = await slackCall<{ messages: HistoryMsg[] }>("conversations.history", {
            ...shared,
            query: query.toString(),
          });
          const ch = channelLabel(rule.slack_channel_name);
          for (const m of hist.messages ?? []) {
            if (!m.ts || !isSlackTsThisWeek(m.ts)) continue;
            const text = (m.text ?? "").trim();
            if (!text) continue;
            const sender = m.user ? await displayName(m.user) : "Ukjent";
            signals.push({
              id: `slack:channel:${rule.slack_channel_id}:${m.ts}`,
              source: "slack",
              subject: `${ch}: ${sender}`,
              from: `Slack · ${ch}`,
              snippet: text.slice(0, 200),
              occurred_at: slackTsToIso(m.ts),
              href: `${teamHome}/archives/${rule.slack_channel_id}/p${m.ts.replace(".", "")}`,
              tags: ["slack_channel", "slack_week"],
              meta: {
                channel_id: rule.slack_channel_id,
                channel_name: rule.slack_channel_name,
                ts: m.ts,
                kind: "channel",
              },
            });
          }
        } catch (err) {
          errors.push(
            err instanceof Error ? err.message : `channel ${rule.slack_channel_name} failed`,
          );
        }
      }
    }

    const activity = signals.length;
    const channels = [
      ...new Set(
        signals
          .map((s) => s.meta?.channel_name as string | null)
          .filter(Boolean)
          .map((n) => channelLabel(n)),
      ),
    ];

    let message: string;
    let suggestion: string | null = null;

    if (activity === 0) {
      message = "Slack: Ingen ny aktivitet denne uken.";
      suggestion =
        ruleCount > 0
          ? "Du har kanskje ikke mottatt ukeplan fra organisasjonen ennå — eller kanalene har vært stille siden mandag."
          : "Du har kanskje ikke mottatt ukeplan fra organisasjonen ennå. Legg til kanaler (f.eks. #drift) under Innstillinger → Slack-kanaler.";
    } else {
      const chPart = channels.length > 0 ? ` fra ${channels.slice(0, 3).join(", ")}` : "";
      message = `Slack: ${activity} ${activity === 1 ? "melding" : "meldinger"} denne uken${chPart}.`;
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
