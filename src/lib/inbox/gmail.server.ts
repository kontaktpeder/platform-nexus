// Server-only Gmail inbox fetcher.
// Reads unread + recent starred/important messages via the Lovable connector
// gateway. Returns actionable Mission cards. Never persists email content.
import type { InboxAction } from "./types";

const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

type ListResponse = { messages?: { id: string; threadId: string }[] };
type Header = { name: string; value: string };
type MessageMeta = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: Header[] };
};

async function gmailFetch<T>(path: string, apiKey: string, lovableKey: string): Promise<T> {
  const res = await fetch(`${GATEWAY}${path}`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": apiKey,
    },
  });
  if (!res.ok) {
    throw new Error(`gmail ${path} -> ${res.status}`);
  }
  return (await res.json()) as T;
}

function headerValue(headers: Header[] | undefined, name: string): string {
  const h = headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

function parseSender(from: string): string {
  // Formats: "Name <mail@x>" or "mail@x"
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  if (m) return m[1].trim();
  return from.trim();
}

function classify(labels: string[]): { priority: number; tier: InboxAction["tier"] } {
  const isImportant = labels.includes("IMPORTANT");
  const isStarred = labels.includes("STARRED");
  const isUnread = labels.includes("UNREAD");
  if (isUnread && isImportant) return { priority: 1, tier: "urgent" };
  if (isUnread) return { priority: 4, tier: "important" };
  if (isStarred) return { priority: 5, tier: "important" };
  return { priority: 8, tier: "later" };
}

export async function fetchGmailActions(opts?: { max?: number }): Promise<InboxAction[]> {
  const apiKey = process.env.GOOGLE_MAIL_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || !lovableKey) return [];

  const max = opts?.max ?? 5;

  try {
    // One combined query: unread OR starred/important within 7 days
    const q = encodeURIComponent(
      "(is:unread label:inbox) OR (is:starred newer_than:7d) OR (is:important newer_than:7d)",
    );
    const list = await gmailFetch<ListResponse>(
      `/users/me/messages?maxResults=15&q=${q}`,
      apiKey,
      lovableKey,
    );
    const ids = (list.messages ?? []).map((m) => m.id);
    if (ids.length === 0) return [];

    const metas = await Promise.all(
      ids.slice(0, 15).map((id) =>
        gmailFetch<MessageMeta>(
          `/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
          apiKey,
          lovableKey,
        ).catch(() => null),
      ),
    );

    const actions: InboxAction[] = [];
    for (const meta of metas) {
      if (!meta) continue;
      const labels = meta.labelIds ?? [];
      const { priority, tier } = classify(labels);
      const subject = headerValue(meta.payload?.headers, "Subject") || "(no subject)";
      const from = headerValue(meta.payload?.headers, "From") || "Unknown sender";
      actions.push({
        key: `gmail:${meta.id}`,
        source: "gmail",
        title: subject.slice(0, 120),
        sender: parseSender(from).slice(0, 80),
        snippet: (meta.snippet ?? "").slice(0, 160),
        href: `https://mail.google.com/mail/u/0/#inbox/${meta.id}`,
        priority,
        tier,
      });
    }

    actions.sort((a, b) => a.priority - b.priority);
    return actions.slice(0, max);
  } catch {
    return [];
  }
}

// ─── Mutators (server-only) ─────────────────────────────────────────────────

async function gmailPost<T>(
  path: string,
  apiKey: string,
  lovableKey: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${GATEWAY}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`gmail ${path} -> ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

function gmailKeys(): { apiKey: string; lovableKey: string } {
  const apiKey = process.env.GOOGLE_MAIL_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || !lovableKey) {
    throw new Error("Gmail is not connected");
  }
  return { apiKey, lovableKey };
}

export async function gmailModify(
  messageId: string,
  changes: { addLabelIds?: string[]; removeLabelIds?: string[] },
): Promise<void> {
  const { apiKey, lovableKey } = gmailKeys();
  await gmailPost(
    `/users/me/messages/${encodeURIComponent(messageId)}/modify`,
    apiKey,
    lovableKey,
    {
      addLabelIds: changes.addLabelIds ?? [],
      removeLabelIds: changes.removeLabelIds ?? [],
    },
  );
}

export async function markGmailMessageRead(messageId: string): Promise<void> {
  await gmailModify(messageId, { removeLabelIds: ["UNREAD"] });
}

export async function archiveGmailMessage(messageId: string): Promise<void> {
  await gmailModify(messageId, { removeLabelIds: ["INBOX", "UNREAD"] });
}

// ─── Reply-draft support ────────────────────────────────────────────────────

export type GmailReplyContext = {
  messageId: string;
  threadId: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  snippet: string;
  rfcMessageId: string; // header Message-Id, e.g. <abc@mail>
  references: string;
};

function parseEmail(from: string): { name: string; email: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: from.trim(), email: from.trim() };
}

export async function getGmailReplyContext(
  messageId: string,
): Promise<GmailReplyContext> {
  const { apiKey, lovableKey } = gmailKeys();
  const meta = await gmailFetch<MessageMeta>(
    `/users/me/messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Message-Id&metadataHeaders=References&metadataHeaders=In-Reply-To`,
    apiKey,
    lovableKey,
  );
  const headers = meta.payload?.headers;
  const subject = headerValue(headers, "Subject") || "(no subject)";
  const from = headerValue(headers, "From") || "";
  const rfcMessageId = headerValue(headers, "Message-Id");
  const prevRefs = headerValue(headers, "References");
  const inReplyTo = headerValue(headers, "In-Reply-To");
  const sender = parseEmail(from);
  const references = [prevRefs, inReplyTo, rfcMessageId]
    .filter(Boolean)
    .join(" ")
    .trim();
  return {
    messageId,
    threadId: meta.threadId,
    subject,
    senderName: sender.name.slice(0, 120),
    senderEmail: sender.email.slice(0, 200),
    snippet: (meta.snippet ?? "").slice(0, 500),
    rfcMessageId,
    references,
  };
}

function base64UrlEncode(input: string): string {
  const b64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(input, "utf-8").toString("base64")
      : btoa(unescape(encodeURIComponent(input)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildReplyRaw(opts: {
  to: string;
  subject: string;
  body: string;
  inReplyTo: string;
  references: string;
}): string {
  const subject = opts.subject.startsWith("Re:")
    ? opts.subject
    : `Re: ${opts.subject}`;
  const lines = [
    `To: ${opts.to}`,
    `Subject: ${subject}`,
    ...(opts.inReplyTo ? [`In-Reply-To: ${opts.inReplyTo}`] : []),
    ...(opts.references ? [`References: ${opts.references}`] : []),
    'Content-Type: text/plain; charset="UTF-8"',
    "MIME-Version: 1.0",
    "",
    opts.body,
  ];
  return base64UrlEncode(lines.join("\r\n"));
}

export type SavedGmailDraft = {
  draftId: string;
  messageId: string;
  threadId: string;
  openUrl: string;
};

export async function createGmailReplyDraft(opts: {
  context: GmailReplyContext;
  body: string;
}): Promise<SavedGmailDraft> {
  const { apiKey, lovableKey } = gmailKeys();
  const raw = buildReplyRaw({
    to: opts.context.senderEmail,
    subject: opts.context.subject,
    body: opts.body,
    inReplyTo: opts.context.rfcMessageId,
    references: opts.context.references,
  });
  const draft = await gmailPost<{
    id: string;
    message: { id: string; threadId: string };
  }>(`/users/me/drafts`, apiKey, lovableKey, {
    message: { raw, threadId: opts.context.threadId },
  });
  return {
    draftId: draft.id,
    messageId: draft.message.id,
    threadId: draft.message.threadId,
    openUrl: `https://mail.google.com/mail/u/0/#drafts/${draft.message.id}`,
  };
}

