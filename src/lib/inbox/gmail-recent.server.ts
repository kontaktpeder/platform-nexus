// Server-only: fetch recent Gmail messages for Morning Mission (read + unread).
import { parseEmailFrom } from "@/lib/inbox/gmail.server";

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

export type GmailRecentSignal = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  fromEmail: string | null;
  to: string;
  snippet: string;
  occurredAt: string | null;
  isUnread: boolean;
  isSent: boolean;
  href: string;
  tags: string[];
};

async function gmailFetch<T>(path: string, apiKey: string, lovableKey: string): Promise<T> {
  const res = await fetch(`${GATEWAY}${path}`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": apiKey,
    },
  });
  if (!res.ok) throw new Error(`gmail ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

function headerValue(headers: Header[] | undefined, name: string): string {
  return headers?.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function detectTags(input: {
  from: string;
  fromEmail: string | null;
  subject: string;
  headers: Header[] | undefined;
  labels: string[];
}): string[] {
  const tags: string[] = [];
  const fromLower = input.from.toLowerCase();
  const subjectLower = input.subject.toLowerCase();

  if (
    fromLower.includes("mailer-daemon") ||
    fromLower.includes("mail delivery") ||
    subjectLower.includes("delivery failure") ||
    subjectLower.includes("undelivered")
  ) {
    tags.push("delivery_failure");
  }

  const autoSubmitted = headerValue(input.headers, "Auto-Submitted");
  if (autoSubmitted || subjectLower.startsWith("automatic reply") || subjectLower.includes("auto-reply")) {
    tags.push("auto_reply");
  }

  if (headerValue(input.headers, "List-Unsubscribe")) {
    tags.push("has_unsubscribe");
  }

  const precedence = headerValue(input.headers, "Precedence").toLowerCase();
  if (precedence === "bulk" || precedence === "list") {
    tags.push("bulk_mail");
  }

  if (input.labels.includes("SENT")) tags.push("sent");
  if (input.labels.includes("UNREAD")) tags.push("unread");

  return tags;
}

export async function fetchRecentGmailSignals(opts?: {
  hours?: number;
  max?: number;
}): Promise<GmailRecentSignal[]> {
  const apiKey = process.env.GOOGLE_MAIL_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || !lovableKey) return [];

  const hours = opts?.hours ?? 72;
  const max = opts?.max ?? 40;
  const days = Math.max(1, Math.ceil(hours / 24));

  try {
    const q = encodeURIComponent(`newer_than:${days}d`);
    const list = await gmailFetch<ListResponse>(
      `/users/me/messages?maxResults=${max}&q=${q}`,
      apiKey,
      lovableKey,
    );
    const ids = (list.messages ?? []).map((m) => m.id);
    if (ids.length === 0) return [];

    const metas = await Promise.all(
      ids.map((id) =>
        gmailFetch<MessageMeta>(
          `/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Auto-Submitted&metadataHeaders=List-Unsubscribe&metadataHeaders=Precedence&metadataHeaders=Message-Id`,
          apiKey,
          lovableKey,
        ).catch(() => null),
      ),
    );

    const byThread = new Map<string, GmailRecentSignal>();

    for (const meta of metas) {
      if (!meta) continue;
      const headers = meta.payload?.headers;
      const labels = meta.labelIds ?? [];
      const subject = headerValue(headers, "Subject") || "(uten emne)";
      const from = headerValue(headers, "From") || "Ukjent avsender";
      const to = headerValue(headers, "To") || "";
      const parsed = parseEmailFrom(from);
      const threadId = meta.threadId ?? meta.id;
      const occurredAt = meta.internalDate
        ? new Date(Number(meta.internalDate)).toISOString()
        : null;

      const signal: GmailRecentSignal = {
        id: `gmail:${meta.id}`,
        threadId,
        subject: subject.slice(0, 200),
        from: (parsed.name || from).slice(0, 120),
        fromEmail: parsed.email,
        to: to.slice(0, 160),
        snippet: (meta.snippet ?? "").slice(0, 300),
        occurredAt,
        isUnread: labels.includes("UNREAD"),
        isSent: labels.includes("SENT"),
        href: `https://mail.google.com/mail/u/0/#inbox/${threadId}`,
        tags: detectTags({ from, fromEmail: parsed.email, subject, headers, labels }),
      };

      const prev = byThread.get(threadId);
      if (!prev || (signal.occurredAt ?? "") > (prev.occurredAt ?? "")) {
        byThread.set(threadId, signal);
      }
    }

    return Array.from(byThread.values()).sort((a, b) =>
      (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""),
    );
  } catch (err) {
    console.error("[gmail-recent] fetch failed", err);
    return [];
  }
}
