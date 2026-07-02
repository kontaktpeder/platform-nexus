// Server-only Slack inbox fetcher.
// Reads DMs with unread messages and recent mentions via the Lovable
// connector gateway. Never persists Slack message content.
import type { InboxAction } from "./types";

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

type Channel = { id: string; user?: string; is_im?: boolean };
type ConvInfo = { channel: { id: string; unread_count_display?: number } };
type HistoryMsg = { text?: string; ts: string; user?: string };
type UserInfo = { user: { id: string; profile?: { display_name?: string; real_name?: string }; name?: string } };
type AuthTest = { user_id: string; team_id: string; url?: string };

export async function fetchSlackActions(opts?: { max?: number }): Promise<InboxAction[]> {
  const apiKey = process.env.SLACK_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || !lovableKey) return [];

  const max = opts?.max ?? 5;
  const shared = { apiKey, lovableKey };

  try {
    const me = await slackCall<AuthTest>("auth.test", shared);
    const teamHome = me.url?.replace(/\/$/, "") ?? "https://slack.com";
    const nameCache = new Map<string, string>();

    async function displayName(userId: string): Promise<string> {
      if (nameCache.has(userId)) return nameCache.get(userId)!;
      try {
        const info = await slackCall<UserInfo>("users.info", {
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

    const actions: InboxAction[] = [];

    // ── DMs with unread messages ────────────────────────────────────────
    try {
      const dms = await slackCall<{ channels: Channel[] }>("conversations.list", {
        ...shared,
        query: "types=im&limit=50",
      });
      const infos = await Promise.all(
        (dms.channels ?? []).slice(0, 15).map((ch) =>
          slackCall<ConvInfo>("conversations.info", {
            ...shared,
            query: `channel=${ch.id}&include_num_members=false`,
          })
            .then((r) => ({ channel: ch, info: r.channel }))
            .catch(() => null),
        ),
      );
      const unreadDms = infos
        .filter((x): x is { channel: Channel; info: ConvInfo["channel"] } => !!x)
        .filter((x) => (x.info.unread_count_display ?? 0) > 0)
        .slice(0, 5);

      for (const { channel, info } of unreadDms) {
        const count = info.unread_count_display ?? 0;
        let snippet = "";
        try {
          const hist = await slackCall<{ messages: HistoryMsg[] }>("conversations.history", {
            ...shared,
            query: `channel=${channel.id}&limit=1`,
          });
          snippet = hist.messages?.[0]?.text?.slice(0, 160) ?? "";
        } catch {
          // ignore, snippet stays empty
        }
        const senderName = channel.user ? await displayName(channel.user) : "Direct message";
        actions.push({
          key: `slack:dm:${channel.id}`,
          source: "slack",
          title: `${count} unread from ${senderName}`,
          sender: senderName,
          snippet,
          href: `${teamHome}/messages/${channel.id}`,
          priority: 1,
          tier: "urgent",
        });
      }
    } catch {
      // DM lookup failed, keep going with mentions
    }

    // ── Mentions ────────────────────────────────────────────────────────
    try {
      const search = await slackCall<{
        results?: {
          messages?: { items?: Array<{ text?: string; ts: string; channel?: { id: string; name?: string }; user?: string }> };
        };
      }>("assistant.search.context", {
        ...shared,
        body: {
          query: `<@${me.user_id}>`,
          content_types: ["messages"],
          channel_types: ["public_channel", "private_channel", "mpim", "im"],
          sort: "timestamp",
          sort_dir: "desc",
          limit: 10,
        },
      });
      const items = search.results?.messages?.items ?? [];
      const uniq = new Map<string, (typeof items)[number]>();
      for (const it of items) {
        const k = `${it.channel?.id ?? ""}:${it.ts}`;
        if (!uniq.has(k)) uniq.set(k, it);
      }
      for (const it of Array.from(uniq.values()).slice(0, 5)) {
        const channelId = it.channel?.id ?? "";
        const channelName = it.channel?.name ? `#${it.channel.name}` : "Slack";
        const senderName = it.user ? await displayName(it.user) : "Someone";
        actions.push({
          key: `slack:mention:${channelId}:${it.ts}`,
          source: "slack",
          title: `Mentioned by ${senderName} in ${channelName}`,
          sender: senderName,
          snippet: (it.text ?? "").slice(0, 160),
          href: channelId ? `${teamHome}/archives/${channelId}/p${it.ts.replace(".", "")}` : teamHome,
          priority: 2,
          tier: "urgent",
        });
      }
    } catch {
      // mention search failed, continue
    }

    actions.sort((a, b) => a.priority - b.priority);
    return actions.slice(0, max);
  } catch {
    return [];
  }
}
