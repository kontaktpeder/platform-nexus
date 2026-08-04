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
  isDraft: boolean;
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

/** Appointment / booking reminders — keep even from no-reply senders. */
export function isAppointmentMailText(blob: string): boolean {
  return (
    /\bpåminnelse\b.*\b(time|timeavtale|avtale)\b/i.test(blob) ||
    /\b(timeavtale|appointment reminder|booking (confirmation|reminder))\b/i.test(blob) ||
    /\beasypractice\b/i.test(blob) ||
    /\b(vaksinasjon|vaksinering|vaksinepåminnelse)\b/i.test(blob) ||
    /\b(tannlege|lege|klinikk|reisemedisin)\b.*\b(time|påminnelse|avtale)\b/i.test(blob)
  );
}

function detectTags(input: {
  from: string;
  fromEmail: string | null;
  subject: string;
  snippet?: string;
  headers: Header[] | undefined;
  labels: string[];
}): string[] {
  const tags: string[] = [];
  const fromLower = input.from.toLowerCase();
  const emailLower = (input.fromEmail ?? "").toLowerCase();
  const subjectLower = input.subject.toLowerCase();
  const snippetLower = (input.snippet ?? "").toLowerCase();
  const blob = `${fromLower} ${emailLower} ${subjectLower} ${snippetLower}`;

  if (
    fromLower.includes("mailer-daemon") ||
    fromLower.includes("mail delivery") ||
    fromLower.includes("postmaster") ||
    subjectLower.includes("delivery failure") ||
    subjectLower.includes("delivery status notification") ||
    subjectLower.includes("undelivered") ||
    subjectLower.includes("returned mail")
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

  const appointment = isAppointmentMailText(blob);
  if (appointment) {
    tags.push("appointment");
  }

  // Product / security / noreply — not relationship follow-ups.
  // Appointment reminders often come from no-reply — do NOT mark those as noise.
  if (!appointment) {
    const systemPatterns = [
      /\bno-?reply@/i,
      /\bnoreply@/i,
      /\bnotifications?@/i,
      /\bsecurity@/i,
      /\baccounts\.google\.com\b/i,
      /\bgoogle\.com\b.*\b(sikkerhetsvarsel|security alert|verify|confirmation|bekreftet)\b/i,
      /\bsikkerhetsvarsel\b/i,
      /\bsecurity alert\b/i,
      /\bnew sign-?in\b/i,
      /\bsign-?in detected\b/i,
      /\bverify your (email|account|identity)\b/i,
      /\bpassword reset\b/i,
      /\btwo-?factor\b/i,
      /\b2fa\b/i,
      /\blovable found an issue\b/i,
      /\bvercel\.com\b/i,
      /\bgithub\.com\b.*\b(notification|deploy)\b/i,
      /\bstripe\.com\b/i,
      /\bnotion\.so\b/i,
      /\bslack\.com\b.*\b(notification|confirm)\b/i,
      /\bhusk å akseptere\b/i,
      /\bstudieplass\b/i,
      /\bnyhetsbrev\b/i,
      /\bnewsletter\b/i,
      /\bunsubscribe\b/i,
    ];
    if (systemPatterns.some((re) => re.test(blob))) {
      tags.push("system_noise");
    }
  }

  if (input.labels.includes("SENT")) tags.push("sent");
  if (input.labels.includes("UNREAD")) tags.push("unread");
  if (input.labels.includes("DRAFT")) tags.push("draft");

  return tags;
}

function metaToSignal(meta: MessageMeta): GmailRecentSignal {
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
  const isDraft = labels.includes("DRAFT");

  return {
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
    isDraft,
    href: isDraft
      ? `https://mail.google.com/mail/u/0/#drafts/${meta.id}`
      : `https://mail.google.com/mail/u/0/#inbox/${threadId}`,
    tags: detectTags({ from, fromEmail: parsed.email, subject, snippet: meta.snippet ?? "", headers, labels }),
  };
}

async function fetchGmailMessageMetas(
  ids: string[],
  apiKey: string,
  lovableKey: string,
): Promise<MessageMeta[]> {
  const metas = await Promise.all(
    ids.map((id) =>
      gmailFetch<MessageMeta>(
        `/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Auto-Submitted&metadataHeaders=List-Unsubscribe&metadataHeaders=Precedence&metadataHeaders=Message-Id`,
        apiKey,
        lovableKey,
      ).catch(() => null),
    ),
  );
  return metas.filter((m): m is MessageMeta => !!m);
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
    const inboxQ = encodeURIComponent(`newer_than:${days}d -in:drafts`);
    const draftsQ = encodeURIComponent("in:drafts");
    const draftMax = Math.min(15, max);

    const [inboxList, draftsList] = await Promise.all([
      gmailFetch<ListResponse>(
        `/users/me/messages?maxResults=${max}&q=${inboxQ}`,
        apiKey,
        lovableKey,
      ),
      gmailFetch<ListResponse>(
        `/users/me/messages?maxResults=${draftMax}&q=${draftsQ}`,
        apiKey,
        lovableKey,
      ).catch(() => ({ messages: [] as { id: string; threadId: string }[] })),
    ]);

    const idSet = new Set<string>();
    const ids: string[] = [];
    for (const m of [...(inboxList.messages ?? []), ...(draftsList.messages ?? [])]) {
      if (idSet.has(m.id)) continue;
      idSet.add(m.id);
      ids.push(m.id);
    }
    if (ids.length === 0) return [];

    const metas = await fetchGmailMessageMetas(ids, apiKey, lovableKey);
    const byThread = new Map<string, GmailRecentSignal>();

    for (const meta of metas) {
      const signal = metaToSignal(meta);
      // Drafts: keep one card per message id (not collapsed by thread).
      if (signal.isDraft) {
        byThread.set(signal.id, signal);
        continue;
      }
      const prev = byThread.get(signal.threadId);
      if (!prev || (signal.occurredAt ?? "") > (prev.occurredAt ?? "")) {
        byThread.set(signal.threadId, signal);
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
