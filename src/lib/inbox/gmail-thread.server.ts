// Find Gmail threads for invoice reply (metadata only).
import { parseEmailFrom } from "@/lib/inbox/gmail.server";

const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

type ListResponse = { messages?: { id: string; threadId: string }[] };
type Header = { name: string; value: string };
type MessageMeta = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: Header[] };
};

export type GmailThreadSuggestion = {
  threadId: string;
  messageId: string;
  rfcMessageId: string;
  references: string;
  subject: string;
  participantEmails: string[];
  label: string;
};

function gmailKeys(): { apiKey: string; lovableKey: string } | null {
  const apiKey = process.env.GOOGLE_MAIL_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || !lovableKey) return null;
  return { apiKey, lovableKey };
}

function headerValue(headers: Header[] | undefined, name: string): string {
  return headers?.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function extractEmailsFromHeader(value: string): string[] {
  if (!value) return [];
  const matches = value.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? [];
  return matches.map((e) => e.toLowerCase());
}

async function fetchMessageMeta(
  id: string,
  keys: { apiKey: string; lovableKey: string },
): Promise<MessageMeta | null> {
  const res = await fetch(
    `${GATEWAY}/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Message-Id&metadataHeaders=References&metadataHeaders=In-Reply-To`,
    {
      headers: {
        Authorization: `Bearer ${keys.lovableKey}`,
        "X-Connection-Api-Key": keys.apiKey,
      },
    },
  );
  if (!res.ok) return null;
  return (await res.json()) as MessageMeta;
}

async function fetchUserEmail(keys: { apiKey: string; lovableKey: string }): Promise<string | null> {
  const res = await fetch(`${GATEWAY}/users/me/profile`, {
    headers: {
      Authorization: `Bearer ${keys.lovableKey}`,
      "X-Connection-Api-Key": keys.apiKey,
    },
  });
  if (!res.ok) return null;
  const profile = (await res.json()) as { emailAddress?: string };
  return profile.emailAddress?.toLowerCase() ?? null;
}

function threadLabel(subject: string, participants: string[], date: string | null): string {
  const names = participants
    .map((e) => parseEmailFrom(e).name || e.split("@")[0])
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
  const when = date ? new Date(date).toLocaleDateString("nb-NO") : "";
  const subj = subject.slice(0, 50);
  if (names && when) return `Tråd: ${names} · ${subj} (${when})`;
  if (names) return `Tråd med ${names}`;
  return subj || "Eksisterende tråd";
}

export async function findInvoiceReplyThread(input: {
  anchorEmail: string;
  nameHints?: string[];
}): Promise<GmailThreadSuggestion | null> {
  const keys = gmailKeys();
  if (!keys) return null;

  const anchor = input.anchorEmail.toLowerCase();
  const hints = (input.nameHints ?? []).map((h) => h.toLowerCase()).filter(Boolean);

  const q = encodeURIComponent(`(to:${anchor} OR from:${anchor}) newer_than:365d`);
  const listRes = await fetch(`${GATEWAY}/users/me/messages?maxResults=30&q=${q}`, {
    headers: {
      Authorization: `Bearer ${keys.lovableKey}`,
      "X-Connection-Api-Key": keys.apiKey,
    },
  });
  if (!listRes.ok) return null;

  const list = (await listRes.json()) as ListResponse;
  const byThread = new Map<string, string>();
  for (const m of list.messages ?? []) {
    if (!byThread.has(m.threadId)) byThread.set(m.threadId, m.id);
  }
  if (!byThread.size) return null;

  const userEmail = await fetchUserEmail(keys);
  let best: { score: number; suggestion: GmailThreadSuggestion } | null = null;

  for (const [threadId, messageId] of byThread) {
    const meta = await fetchMessageMeta(messageId, keys);
    if (!meta) continue;

    const headers = meta.payload?.headers;
    const subject = headerValue(headers, "Subject") || "(uten emne)";
    const from = headerValue(headers, "From");
    const to = headerValue(headers, "To");
    const cc = headerValue(headers, "Cc");
    const blob = `${from} ${to} ${cc} ${subject} ${meta.snippet ?? ""}`.toLowerCase();

    const emails = new Set<string>([
      ...extractEmailsFromHeader(from),
      ...extractEmailsFromHeader(to),
      ...extractEmailsFromHeader(cc),
    ]);
    emails.delete(anchor);
    if (userEmail) emails.delete(userEmail);

    const participants = [...emails];
    let score = participants.length >= 1 ? 2 : 0;
    if (participants.length >= 2) score += 2;
    for (const hint of hints) {
      if (blob.includes(hint)) score += 3;
    }
    if (subject.toLowerCase().includes("faktura") || blob.includes("betaling")) score += 1;

    const rfcMessageId = headerValue(headers, "Message-Id");
    const references = [headerValue(headers, "References"), headerValue(headers, "In-Reply-To"), rfcMessageId]
      .filter(Boolean)
      .join(" ")
      .trim();

    const allRecipients = [anchor, ...participants];
    const suggestion: GmailThreadSuggestion = {
      threadId,
      messageId: meta.id,
      rfcMessageId,
      references,
      subject,
      participantEmails: [...new Set(allRecipients)],
      label: threadLabel(subject, allRecipients, meta.internalDate ? new Date(Number(meta.internalDate)).toISOString() : null),
    };

    if (!best || score > best.score) {
      best = { score, suggestion };
    }
  }

  return best?.suggestion ?? null;
}
