// Gmail search for invoice storyline (metadata only).
const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

type ListResponse = { messages?: { id: string }[] };
type Header = { name: string; value: string };
type MessageMeta = {
  id: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: { headers?: Header[] };
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

export type GmailSearchHit = {
  subject: string;
  snippet: string;
  occurredAt: string | null;
  direction: "sent" | "received" | "unknown";
};

export async function searchGmailInvolvingEmail(
  email: string,
  max = 10,
): Promise<GmailSearchHit[]> {
  const keys = gmailKeys();
  if (!keys) return [];

  const q = encodeURIComponent(`(to:${email} OR from:${email}) newer_than:180d`);
  const listRes = await fetch(`${GATEWAY}/users/me/messages?maxResults=${max}&q=${q}`, {
    headers: {
      Authorization: `Bearer ${keys.lovableKey}`,
      "X-Connection-Api-Key": keys.apiKey,
    },
  });
  if (!listRes.ok) return [];
  const list = (await listRes.json()) as ListResponse;
  const ids = (list.messages ?? []).map((m) => m.id).slice(0, max);
  if (!ids.length) return [];

  const hits: GmailSearchHit[] = [];
  for (const id of ids) {
    const res = await fetch(
      `${GATEWAY}/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To`,
      {
        headers: {
          Authorization: `Bearer ${keys.lovableKey}`,
          "X-Connection-Api-Key": keys.apiKey,
        },
      },
    );
    if (!res.ok) continue;
    const meta = (await res.json()) as MessageMeta;
    const headers = meta.payload?.headers;
    const subject = headerValue(headers, "Subject") || "(uten emne)";
    const from = headerValue(headers, "From").toLowerCase();
    const to = headerValue(headers, "To").toLowerCase();
    const emailLower = email.toLowerCase();
    let direction: GmailSearchHit["direction"] = "unknown";
    if (from.includes(emailLower)) direction = "received";
    else if (to.includes(emailLower)) direction = "sent";
    if (meta.labelIds?.includes("SENT")) direction = "sent";

    hits.push({
      subject: subject.slice(0, 160),
      snippet: (meta.snippet ?? "").slice(0, 160),
      occurredAt: meta.internalDate
        ? new Date(Number(meta.internalDate)).toISOString()
        : null,
      direction,
    });
  }
  return hits;
}
