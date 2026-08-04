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

export function parseEmailFrom(from: string | null | undefined): {
  name: string;
  email: string | null;
} {
  if (!from) return { name: "", email: null };
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<\s*([^>]+)\s*>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  const bare = from.match(/([^\s"<>]+@[^\s"<>]+)/);
  if (bare) return { name: from.replace(bare[1], "").trim(), email: bare[1].toLowerCase() };
  return { name: from.trim(), email: null };
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

export type FetchGmailResult = {
  actions: InboxAction[];
  error: string | null;
};

export async function fetchGmailActions(opts?: { max?: number }): Promise<InboxAction[]> {
  const result = await fetchGmailActionsWithMeta(opts);
  return result.actions;
}

export async function fetchGmailActionsWithMeta(opts?: {
  max?: number;
}): Promise<FetchGmailResult> {
  const apiKey = process.env.GOOGLE_MAIL_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || !lovableKey) return { actions: [], error: null };

  const max = opts?.max ?? 15;

  try {
    // Mission inbox only: unread messages in inbox.
    const q = encodeURIComponent("is:unread label:inbox");
    const list = await gmailFetch<ListResponse>(
      `/users/me/messages?maxResults=25&q=${q}`,
      apiKey,
      lovableKey,
    );
    const ids = (list.messages ?? []).map((m) => m.id);
    if (ids.length === 0) return { actions: [], error: null };

    const metas = await Promise.all(
      ids
        .slice(0, 25)
        .map((id) =>
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
      const occurredAt = meta.internalDate
        ? new Date(Number(meta.internalDate)).toISOString()
        : null;
      const threadId = meta.threadId ?? null;
      const parsed = parseEmailFrom(from);
      actions.push({
        key: `gmail:${meta.id}`,
        source: "gmail",
        title: subject.slice(0, 120),
        sender: (parsed.name || parseSender(from)).slice(0, 80),
        senderEmail: parsed.email,
        snippet: (meta.snippet ?? "").slice(0, 160),
        href: threadId
          ? `https://mail.google.com/mail/u/0/#inbox/${threadId}`
          : `https://mail.google.com/mail/u/0/#inbox/${meta.id}`,
        priority,
        tier,
        occurredAt,
        threadId,
      });
    }

    actions.sort((a, b) => a.priority - b.priority);
    return { actions: actions.slice(0, max), error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "gmail fetch failed";
    console.error("[gmail] fetchGmailActions failed:", msg);
    return { actions: [], error: msg };
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

/** Move a message (incl. draft) to Trash. */
export async function trashGmailMessage(messageId: string): Promise<void> {
  const { apiKey, lovableKey } = gmailKeys();
  await gmailPost(
    `/users/me/messages/${encodeURIComponent(messageId)}/trash`,
    apiKey,
    lovableKey,
    {},
  );
}

/** Strip `gmail:` prefix from Desk/Mission signal ids. */
export function gmailMessageIdFromSignalId(signalId: string): string | null {
  const raw = signalId.startsWith("gmail:") ? signalId.slice("gmail:".length) : signalId;
  const id = raw.trim();
  return id.length > 0 ? id : null;
}

// ─── Reply-draft support ────────────────────────────────────────────────────

export type GmailUnsubscribeInfo = {
  /** First mailto: target from List-Unsubscribe, if any. */
  mailto: string | null;
  /** First https? URL from List-Unsubscribe, if any. */
  url: string | null;
  raw: string | null;
};

export type GmailReplyContext = {
  messageId: string;
  threadId: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  snippet: string;
  rfcMessageId: string; // header Message-Id, e.g. <abc@mail>
  references: string;
  unsubscribe: GmailUnsubscribeInfo;
};

export type GmailAttachmentBytes = {
  filename: string;
  mimeType: string;
  data: Uint8Array;
};

/** Parse RFC 2369 List-Unsubscribe header into mailto + http(s) targets. */
export function parseListUnsubscribe(raw: string | null | undefined): GmailUnsubscribeInfo {
  const header = (raw ?? "").trim();
  if (!header) return { mailto: null, url: null, raw: null };
  let mailto: string | null = null;
  let url: string | null = null;
  const re = /<([^>]+)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(header))) {
    const target = m[1].trim();
    if (!mailto && /^mailto:/i.test(target)) {
      mailto = target.replace(/^mailto:/i, "").split("?")[0]?.trim() || null;
    } else if (!url && /^https?:\/\//i.test(target)) {
      url = target;
    }
  }
  if (!mailto && !url) {
    const bareMailto = header.match(/mailto:([^\s>,]+)/i);
    if (bareMailto) mailto = bareMailto[1].split("?")[0]?.trim() || null;
    const bareUrl = header.match(/https?:\/\/[^\s>,]+/i);
    if (bareUrl) url = bareUrl[0].replace(/[>]+$/, "");
  }
  return { mailto, url, raw: header.slice(0, 500) };
}

function parseEmail(from: string): { name: string; email: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: from.trim(), email: from.trim() };
}

export async function getGmailReplyContext(messageId: string): Promise<GmailReplyContext> {
  const { apiKey, lovableKey } = gmailKeys();
  const meta = await gmailFetch<MessageMeta>(
    `/users/me/messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Message-Id&metadataHeaders=References&metadataHeaders=In-Reply-To&metadataHeaders=List-Unsubscribe`,
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
  const references = [prevRefs, inReplyTo, rfcMessageId].filter(Boolean).join(" ").trim();
  return {
    messageId,
    threadId: meta.threadId,
    subject,
    senderName: sender.name.slice(0, 120),
    senderEmail: sender.email.slice(0, 200),
    snippet: (meta.snippet ?? "").slice(0, 500),
    rfcMessageId,
    references,
    unsubscribe: parseListUnsubscribe(headerValue(headers, "List-Unsubscribe")),
  };
}

// ── Assistant helpers: free-form search + full thread reading ──────────────

export type GmailSearchHit = {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  date: string | null;
  snippet: string;
};

/** Search Gmail with full query syntax (from:, to:, subject:, "fritekst", after:YYYY/MM/DD). */
export async function searchGmailMessages(query: string, max = 8): Promise<GmailSearchHit[]> {
  const { apiKey, lovableKey } = gmailKeys();
  const capped = Math.min(Math.max(max, 1), 20);
  const list = await gmailFetch<ListResponse>(
    `/users/me/messages?maxResults=${capped}&q=${encodeURIComponent(query)}`,
    apiKey,
    lovableKey,
  );
  const ids = (list.messages ?? []).map((m) => m.id);
  if (ids.length === 0) return [];

  const metas = await Promise.all(
    ids.map((id) =>
      gmailFetch<MessageMeta>(
        `/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        apiKey,
        lovableKey,
      ).catch(() => null),
    ),
  );

  const seenThreads = new Set<string>();
  const hits: GmailSearchHit[] = [];
  for (const meta of metas) {
    if (!meta) continue;
    // One hit per thread keeps the tool output small for the model.
    if (seenThreads.has(meta.threadId)) continue;
    seenThreads.add(meta.threadId);
    hits.push({
      messageId: meta.id,
      threadId: meta.threadId,
      subject: headerValue(meta.payload?.headers, "Subject") || "(uten emne)",
      from: headerValue(meta.payload?.headers, "From") || "",
      date: meta.internalDate ? new Date(Number(meta.internalDate)).toISOString() : null,
      snippet: (meta.snippet ?? "").slice(0, 300),
    });
  }
  return hits;
}

type MessagePart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: MessagePart[];
};

type FullMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: MessagePart & { headers?: Header[] };
};

function base64UrlDecode(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  if (typeof Buffer !== "undefined") {
    return Buffer.from(b64, "base64").toString("utf-8");
  }
  return decodeURIComponent(escape(atob(b64)));
}

function collectParts(
  part: MessagePart | undefined,
  out: { texts: string[]; htmls: string[]; attachments: string[] },
) {
  if (!part) return;
  if (part.filename && part.filename.trim()) out.attachments.push(part.filename);
  if (part.mimeType === "text/plain" && part.body?.data) {
    out.texts.push(base64UrlDecode(part.body.data));
  } else if (part.mimeType === "text/html" && part.body?.data) {
    out.htmls.push(base64UrlDecode(part.body.data));
  }
  for (const child of part.parts ?? []) collectParts(child, out);
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type GmailThreadMessage = {
  messageId: string;
  from: string;
  to: string;
  date: string | null;
  subject: string;
  body: string;
  attachments: string[];
};

/** Read every message in a thread with decoded plain-text bodies. */
export async function readGmailThread(
  threadId: string,
  opts?: { maxCharsPerMessage?: number },
): Promise<GmailThreadMessage[]> {
  const { apiKey, lovableKey } = gmailKeys();
  const maxChars = opts?.maxCharsPerMessage ?? 4000;
  const thread = await gmailFetch<{ id: string; messages?: FullMessage[] }>(
    `/users/me/threads/${encodeURIComponent(threadId)}?format=full`,
    apiKey,
    lovableKey,
  );
  const out: GmailThreadMessage[] = [];
  for (const msg of thread.messages ?? []) {
    const headers = msg.payload?.headers;
    const collected = {
      texts: [] as string[],
      htmls: [] as string[],
      attachments: [] as string[],
    };
    collectParts(msg.payload, collected);
    let body = collected.texts.join("\n\n").trim();
    if (!body && collected.htmls.length) {
      body = htmlToText(collected.htmls.join("\n"));
    }
    if (!body) body = msg.snippet ?? "";
    out.push({
      messageId: msg.id,
      from: headerValue(headers, "From"),
      to: headerValue(headers, "To"),
      date: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : null,
      subject: headerValue(headers, "Subject"),
      body: body.slice(0, maxChars),
      attachments: collected.attachments,
    });
  }
  return out;
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
  const subject = opts.subject.startsWith("Re:") ? opts.subject : `Re: ${opts.subject}`;
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

function safeAttachmentFilename(name: string): string {
  return name.replace(/[\r\n"]/g, "").trim().slice(0, 180) || "vedlegg";
}

function encodeAttachmentBytes(data: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(data).toString("base64");
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < data.length; i += chunk) {
    binary += String.fromCharCode(...data.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function buildMultipartRaw(opts: {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  attachments: GmailAttachmentBytes[];
  from?: { email: string; displayName?: string | null } | null;
  inReplyTo?: string;
  references?: string;
}): string {
  const boundary = `nexus_${Date.now().toString(36)}`;
  const textPart = [
    `Content-Type: text/plain; charset="UTF-8"`,
    "Content-Transfer-Encoding: 8bit",
    "",
    opts.body,
  ].join("\r\n");

  const fileParts = opts.attachments.map((att) => {
    const filename = safeAttachmentFilename(att.filename);
    const mimeType = (att.mimeType || "application/octet-stream").replace(/[\r\n]/g, "");
    return [
      `Content-Type: ${mimeType}; name="${filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename}"`,
      "",
      encodeAttachmentBytes(att.data),
    ].join("\r\n");
  });

  const subject =
    opts.inReplyTo && !opts.subject.toLowerCase().startsWith("re:")
      ? `Re: ${opts.subject}`
      : opts.subject;
  const fromHeader = formatFromHeader(opts.from ?? null);

  const mime = [
    ...(fromHeader ? [`From: ${fromHeader}`] : []),
    `To: ${opts.to}`,
    ...(opts.cc?.trim() ? [`Cc: ${opts.cc}`] : []),
    `Subject: ${encodeHeaderValue(subject)}`,
    ...(opts.inReplyTo ? [`In-Reply-To: ${opts.inReplyTo}`] : []),
    ...(opts.references ? [`References: ${opts.references}`] : []),
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    textPart,
    ...fileParts.flatMap((part) => [`--${boundary}`, part]),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return base64UrlEncode(mime);
}

export type SentGmailMessage = {
  messageId: string;
  threadId: string;
};

/** @deprecated Prefer sendGmailMessage with attachments[] — kept for invoice PDF path. */
export async function sendGmailWithAttachment(opts: {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  attachment: { filename: string; mimeType: string; data: Uint8Array };
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}): Promise<SentGmailMessage> {
  return sendGmailMessage({
    to: opts.to,
    cc: opts.cc,
    subject: opts.subject,
    body: opts.body,
    attachments: [opts.attachment],
    threadId: opts.threadId,
    inReplyTo: opts.inReplyTo,
    references: opts.references,
  });
}

/** RFC 2047 encode a header value when it contains non-ASCII (æøå etc.). */
function encodeHeaderValue(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  const b64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(value, "utf-8").toString("base64")
      : btoa(unescape(encodeURIComponent(value)));
  return `=?UTF-8?B?${b64}?=`;
}

export type GmailSendAsAlias = {
  email: string;
  displayName: string | null;
  isPrimary: boolean;
  isDefault: boolean;
};

/** List Gmail "Send mail as" aliases (accepted / primary). */
export async function listGmailSendAs(): Promise<GmailSendAsAlias[]> {
  const { apiKey, lovableKey } = gmailKeys();
  const json = await gmailFetch<{
    sendAs?: Array<{
      sendAsEmail?: string;
      displayName?: string;
      isPrimary?: boolean;
      isDefault?: boolean;
      verificationStatus?: string;
    }>;
  }>(`/users/me/settings/sendAs`, apiKey, lovableKey);

  const rows = (json.sendAs ?? [])
    .map((s) => {
      const email = (s.sendAsEmail ?? "").trim().toLowerCase();
      if (!email || !email.includes("@")) return null;
      const status = (s.verificationStatus ?? "accepted").toLowerCase();
      if (status && status !== "accepted") return null;
      return {
        email,
        displayName: s.displayName?.trim() || null,
        isPrimary: !!s.isPrimary,
        isDefault: !!s.isDefault,
      } satisfies GmailSendAsAlias;
    })
    .filter((x): x is GmailSendAsAlias => !!x);

  rows.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.email.localeCompare(b.email);
  });
  return rows;
}

function formatFromHeader(from?: { email: string; displayName?: string | null } | null): string | null {
  const email = from?.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  const name = from?.displayName?.trim();
  if (!name) return email;
  const safeName = name.replace(/[\r\n"]/g, "").slice(0, 80);
  return `"${safeName}" <${email}>`;
}

function buildComposeRaw(opts: {
  to: string;
  subject: string;
  body: string;
  from?: { email: string; displayName?: string | null } | null;
  cc?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: GmailAttachmentBytes[];
}): string {
  const attachments = opts.attachments?.filter((a) => a.data.length > 0) ?? [];
  if (attachments.length > 0) {
    return buildMultipartRaw({
      to: opts.to,
      cc: opts.cc,
      subject: opts.subject,
      body: opts.body,
      from: opts.from,
      inReplyTo: opts.inReplyTo,
      references: opts.references,
      attachments,
    });
  }
  const fromHeader = formatFromHeader(opts.from ?? null);
  const subject =
    opts.inReplyTo && !opts.subject.toLowerCase().startsWith("re:")
      ? `Re: ${opts.subject}`
      : opts.subject;
  const lines = [
    ...(fromHeader ? [`From: ${fromHeader}`] : []),
    `To: ${opts.to}`,
    ...(opts.cc?.trim() ? [`Cc: ${opts.cc}`] : []),
    `Subject: ${encodeHeaderValue(subject)}`,
    ...(opts.inReplyTo ? [`In-Reply-To: ${opts.inReplyTo}`] : []),
    ...(opts.references ? [`References: ${opts.references}`] : []),
    'Content-Type: text/plain; charset="UTF-8"',
    "MIME-Version: 1.0",
    "",
    opts.body,
  ];
  return base64UrlEncode(lines.join("\r\n"));
}

/** Send email (plain or with file/image attachments). */
export async function sendGmailMessage(opts: {
  to: string;
  subject: string;
  body: string;
  from?: { email: string; displayName?: string | null } | null;
  cc?: string;
  attachments?: GmailAttachmentBytes[];
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}): Promise<SentGmailMessage> {
  const { apiKey, lovableKey } = gmailKeys();
  const raw = buildComposeRaw(opts);
  const sent = await gmailPost<{ id: string; threadId: string }>(
    `/users/me/messages/send`,
    apiKey,
    lovableKey,
    { raw, ...(opts.threadId ? { threadId: opts.threadId } : {}) },
  );
  return { messageId: sent.id, threadId: sent.threadId };
}

/** Save email as a Gmail draft (optional attachments). */
export async function createGmailComposeDraft(opts: {
  to: string;
  subject: string;
  body: string;
  from?: { email: string; displayName?: string | null } | null;
  cc?: string;
  attachments?: GmailAttachmentBytes[];
}): Promise<SavedGmailDraft> {
  const { apiKey, lovableKey } = gmailKeys();
  const raw = buildComposeRaw(opts);
  const draft = await gmailPost<{
    id: string;
    message: { id: string; threadId: string };
  }>(`/users/me/drafts`, apiKey, lovableKey, { message: { raw } });
  return {
    draftId: draft.id,
    messageId: draft.message.id,
    threadId: draft.message.threadId,
    openUrl: `https://mail.google.com/mail/u/0/#drafts/${draft.message.id}`,
  };
}

export async function createGmailReplyDraft(opts: {
  context: GmailReplyContext;
  body: string;
  attachments?: GmailAttachmentBytes[];
}): Promise<SavedGmailDraft> {
  const { apiKey, lovableKey } = gmailKeys();
  const raw = buildComposeRaw({
    to: opts.context.senderEmail,
    subject: opts.context.subject,
    body: opts.body,
    inReplyTo: opts.context.rfcMessageId,
    references: opts.context.references,
    attachments: opts.attachments,
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
