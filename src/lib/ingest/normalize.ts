// Pure normalization helpers for raw_signals ingest.
// Zero side effects. Client-safe (no server imports).

export type RawSignalSource = "gmail" | "slack" | "manual" | "calendar" | "document" | "other";

export type NormalizedSignal = {
  source: RawSignalSource;
  external_id: string;
  external_thread_id: string | null;
  raw_text: string;
  summary: string | null;
  occurred_at: string | null; // ISO
  metadata: Record<string, unknown>;
};

// ── Gmail ────────────────────────────────────────────────────────────────

export type GmailNormalizeInput = {
  id: string;
  threadId?: string | null;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  subject?: string;
  from?: string;
  to?: string;
};

export function normalizeGmailMessage(msg: GmailNormalizeInput): NormalizedSignal {
  const subject = (msg.subject ?? "").trim();
  const from = (msg.from ?? "").trim();
  const snippet = (msg.snippet ?? "").trim();
  const rawParts = [
    subject ? `Subject: ${subject}` : null,
    from ? `From: ${from}` : null,
    msg.to ? `To: ${msg.to.trim()}` : null,
    snippet ? `\n${snippet}` : null,
  ].filter(Boolean);
  const raw_text = rawParts.join("\n").slice(0, 8000) || "(empty gmail message)";
  const summary = subject ? subject.slice(0, 200) : snippet.slice(0, 200) || null;
  const occurred_at = msg.internalDate
    ? new Date(Number(msg.internalDate)).toISOString()
    : null;
  return {
    source: "gmail",
    external_id: msg.id,
    external_thread_id: msg.threadId ?? null,
    raw_text,
    summary,
    occurred_at,
    metadata: {
      subject: subject || null,
      from: from || null,
      to: msg.to ?? null,
      snippet: snippet || null,
      label_ids: msg.labelIds ?? [],
    },
  };
}

// ── Slack ────────────────────────────────────────────────────────────────

export type SlackNormalizeInput = {
  channel_id: string;
  ts: string; // slack timestamp, unique within channel
  thread_ts?: string | null;
  text?: string;
  user?: string | null;
  user_display_name?: string | null;
  channel_name?: string | null;
  kind: "dm" | "mention" | "channel";
};

export function normalizeSlackMessage(msg: SlackNormalizeInput): NormalizedSignal {
  const external_id = `${msg.channel_id}:${msg.ts}`;
  const external_thread_id = msg.thread_ts ? `${msg.channel_id}:${msg.thread_ts}` : null;
  const text = (msg.text ?? "").trim();
  const raw_text = text.slice(0, 8000) || "(empty slack message)";
  const summary = text ? text.slice(0, 200) : null;
  const occurred_at = tsToIso(msg.ts);
  return {
    source: "slack",
    external_id,
    external_thread_id,
    raw_text,
    summary,
    occurred_at,
    metadata: {
      channel_id: msg.channel_id,
      channel_name: msg.channel_name ?? null,
      ts: msg.ts,
      thread_ts: msg.thread_ts ?? null,
      user_id: msg.user ?? null,
      user_display_name: msg.user_display_name ?? null,
      kind: msg.kind,
    },
  };
}

function tsToIso(ts: string): string | null {
  const seconds = Number(ts.split(".")[0]);
  if (!Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}
