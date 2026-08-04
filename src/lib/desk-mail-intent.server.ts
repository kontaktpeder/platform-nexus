/**
 * Desk queue: short intent + primary CTA for Gmail cards.
 * Heuristics first; flash-lite batch only for visible mail that needs clarity.
 */

import { generateText } from "ai";
import { getGeminiApiKey, getGeminiModel } from "@/lib/ai-gateway.server";
import type { DeskQueueItem } from "@/lib/desk-queue.types";

export type DeskMailCtaKind = "open_link" | "reply" | "fyi" | "other";

export type DeskMailEnrichment = {
  intent: string;
  nextStep: string | null;
  ctaUrl: string | null;
  ctaLabel: string | null;
  ctaKind: DeskMailCtaKind;
};

/** Decode HTML entities + strip ZWSP / soft hyphens from marketing mail. */
export function cleanMailText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/[\u200B-\u200D\uFEFF\u00AD\u2060]/g, "")
    .replace(/͏+/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

function scoreLink(url: string, fromEmail: string | null, subject: string): number {
  const u = url.toLowerCase();
  const from = (fromEmail ?? "").toLowerCase();
  const subj = subject.toLowerCase();
  let score = 1;
  if (/search\.google\.com\/search-console|google\.com\/webmasters/i.test(u)) score += 40;
  if (/accounts\.google\.com/i.test(u) && /search console|søk/i.test(subj)) score += 20;
  if (/github\.com|linear\.app|notion\.so|stripe\.com|vercel\.com/i.test(u)) score += 15;
  if (/docs\.google\.com|drive\.google\.com|calendar\.google\.com/i.test(u)) score += 12;
  if (/native\.no|ads?\./i.test(u) && from.includes("native")) score += 10;
  if (/\/unsubscribe|opt[-_]?out|email-preferences/i.test(u)) score -= 50;
  if (/\/view\/|click\.|track\.|redirect/i.test(u)) score += 3;
  if (u.length > 180) score -= 2;
  return score;
}

function pickBestLink(
  links: string[],
  fromEmail: string | null,
  subject: string,
): string | null {
  if (!links.length) return null;
  const ranked = [...links].sort(
    (a, b) => scoreLink(b, fromEmail, subject) - scoreLink(a, fromEmail, subject),
  );
  const best = ranked[0]!;
  if (scoreLink(best, fromEmail, subject) < 1) return null;
  return best;
}

type HeuristicInput = {
  subject: string;
  fromEmail: string | null;
  snippet: string;
  bodyText: string;
  links: string[];
  hasUnsubscribe?: boolean;
};

function heuristicEnrichment(input: HeuristicInput): DeskMailEnrichment | null {
  const subject = cleanMailText(input.subject);
  const snippet = cleanMailText(input.snippet);
  const fromEmail = input.fromEmail?.toLowerCase() ?? null;
  const blob = `${subject} ${snippet} ${input.bodyText}`.toLowerCase();
  const ctaUrl = pickBestLink(input.links, fromEmail, subject);

  if (
    fromEmail?.includes("sc-noreply@google.com") ||
    /search console|google søk|overvåk google/i.test(blob)
  ) {
    const url =
      input.links.find((l) => /search-console|webmasters/i.test(l)) ?? ctaUrl;
    return {
      intent: subject || "Google Search Console",
      nextStep: "Åpne Search Console og sjekk eiendom / trafikk for domenet.",
      ctaUrl: url,
      ctaLabel: url ? "Åpne Search Console" : null,
      ctaKind: url ? "open_link" : "fyi",
    };
  }

  if (
    ctaUrl &&
    /\b(overvåk|sjekk|bekreft|verify|confirm|view|se her|åpne|monitor)\b/i.test(blob)
  ) {
    return {
      intent: subject.slice(0, 120) || "Åpne lenke fra mailen",
      nextStep: "Klikk lenken og gjør det mailen ber om der.",
      ctaUrl,
      ctaLabel: "Åpne lenke",
      ctaKind: "open_link",
    };
  }

  if (
    input.hasUnsubscribe ||
    /nyhetsbrev|newsletter|we're proud|i dag lanserer|proud to launch/i.test(blob)
  ) {
    return {
      intent: subject.slice(0, 120) || "Nyhetsbrev / produktnyhet",
      nextStep: ctaUrl
        ? "Skum produktet via lenken — eller arkiver/slett hvis irrelevant."
        : "Ingen handling nødvendig med mindre du vil lese mer.",
      ctaUrl,
      ctaLabel: ctaUrl ? "Åpne" : null,
      ctaKind: ctaUrl ? "open_link" : "fyi",
    };
  }

  if (ctaUrl && input.links.length > 0 && input.links.length <= 4) {
    return {
      intent: subject.slice(0, 120),
      nextStep: "Åpne lenken for å se hva de vil at du skal gjøre.",
      ctaUrl,
      ctaLabel: "Åpne lenke",
      ctaKind: "open_link",
    };
  }

  return null;
}

type AiRow = {
  id: string;
  intent: string;
  nextStep: string | null;
  ctaUrl: string | null;
  ctaLabel: string | null;
  ctaKind: DeskMailCtaKind;
};

async function aiEnrichBatch(
  rows: Array<{
    id: string;
    subject: string;
    from: string;
    snippet: string;
    body: string;
    links: string[];
  }>,
): Promise<Map<string, DeskMailEnrichment>> {
  const out = new Map<string, DeskMailEnrichment>();
  if (!rows.length || !getGeminiApiKey()) return out;

  const payload = rows.map((r) => ({
    id: r.id,
    subject: cleanMailText(r.subject).slice(0, 160),
    from: r.from.slice(0, 120),
    snippet: cleanMailText(r.snippet).slice(0, 280),
    body: cleanMailText(r.body).slice(0, 900),
    links: r.links.slice(0, 6),
  }));

  try {
    const { text } = await generateText({
      model: getGeminiModel("flash-lite"),
      system: [
        "You summarize inbox emails for a personal OS queue card.",
        "For each mail return JSON array items: id, intent (max 90 chars, what they want FROM the user),",
        "nextStep (max 110 chars: what to do after opening — or null),",
        "ctaUrl (pick best http link from links[] for open_link, else null),",
        "ctaLabel (short Norwegian button label or null),",
        "ctaKind: open_link | reply | fyi | other.",
        "If the mail is mainly 'go check this link', ctaKind=open_link and intent must say what to verify/do there.",
        "Never invent URLs not in links[]. Norwegian preferred. Return ONLY JSON array.",
      ].join(" "),
      prompt: JSON.stringify(payload),
    });
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start < 0 || end <= start) return out;
    const parsed = JSON.parse(text.slice(start, end + 1)) as AiRow[];
    for (const row of parsed) {
      if (!row?.id || !row.intent) continue;
      const allowed = new Set(payload.find((p) => p.id === row.id)?.links ?? []);
      let resolved: string | null = null;
      if (row.ctaUrl) {
        if (allowed.has(row.ctaUrl)) resolved = row.ctaUrl;
        else {
          resolved =
            [...allowed].find(
              (l) => l === row.ctaUrl || l.includes(row.ctaUrl!) || row.ctaUrl!.includes(l),
            ) ?? null;
        }
      }
      out.set(row.id, {
        intent: cleanMailText(row.intent).slice(0, 120),
        nextStep: row.nextStep ? cleanMailText(row.nextStep).slice(0, 140) : null,
        ctaUrl: resolved,
        ctaLabel: row.ctaLabel ? cleanMailText(row.ctaLabel).slice(0, 40) : null,
        ctaKind:
          row.ctaKind === "open_link" ||
          row.ctaKind === "reply" ||
          row.ctaKind === "fyi" ||
          row.ctaKind === "other"
            ? row.ctaKind
            : resolved
              ? "open_link"
              : "other",
      });
    }
  } catch (err) {
    console.warn("[desk-mail-intent] AI enrich failed", err);
  }
  return out;
}

/** Enrich top Gmail mail items with intent + CTA. */
export async function enrichDeskGmailItems(
  items: DeskQueueItem[],
  opts?: { maxFetch?: number },
): Promise<DeskQueueItem[]> {
  const maxFetch = opts?.maxFetch ?? 6;
  const targets = items
    .filter((i) => i.source === "gmail" && i.kind === "mail" && i.gmailMessageId)
    .slice(0, maxFetch);

  if (!targets.length) {
    return items.map((i) => ({
      ...i,
      title: cleanMailText(i.title) || i.title,
      subtitle: i.subtitle ? cleanMailText(i.subtitle) || i.subtitle : i.subtitle,
    }));
  }

  const { readGmailMessageBrief } = await import("@/lib/inbox/gmail.server");

  const briefs = await Promise.all(
    targets.map(async (item) => {
      try {
        const brief = await readGmailMessageBrief(item.gmailMessageId!, { maxChars: 1800 });
        return { item, brief };
      } catch (err) {
        console.warn("[desk-mail-intent] brief failed", item.gmailMessageId, err);
        return { item, brief: null };
      }
    }),
  );

  const byId = new Map<string, DeskMailEnrichment>();
  const needAi: Array<{
    id: string;
    subject: string;
    from: string;
    snippet: string;
    body: string;
    links: string[];
  }> = [];

  for (const { item, brief } of briefs) {
    const subject = cleanMailText(brief?.subject ?? item.title);
    const snippet = cleanMailText(brief?.snippet ?? item.subtitle ?? "");
    const links = brief?.links ?? [];
    const heur = heuristicEnrichment({
      subject,
      fromEmail: item.fromEmail ?? null,
      snippet,
      bodyText: brief?.bodyText ?? "",
      links,
      hasUnsubscribe: item.hasUnsubscribe,
    });

    // Strong open_link heuristics skip AI.
    if (heur?.ctaKind === "open_link" && heur.ctaUrl) {
      byId.set(item.id, heur);
      continue;
    }

    if (brief) {
      needAi.push({
        id: item.id,
        subject,
        from: `${item.fromName ?? ""} <${item.fromEmail ?? ""}>`,
        snippet,
        body: brief.bodyText,
        links,
      });
      if (heur) byId.set(item.id, heur);
    } else if (heur) {
      byId.set(item.id, heur);
    } else {
      byId.set(item.id, {
        intent: subject.slice(0, 120),
        nextStep: null,
        ctaUrl: null,
        ctaLabel: null,
        ctaKind: "other",
      });
    }
  }

  const aiMap = await aiEnrichBatch(needAi.slice(0, 4));
  for (const [id, enrich] of aiMap) byId.set(id, enrich);

  return items.map((item) => {
    const enrich = byId.get(item.id);
    const title = cleanMailText(item.title) || item.title;
    if (!enrich) {
      return {
        ...item,
        title,
        subtitle: item.subtitle ? cleanMailText(item.subtitle) || item.subtitle : item.subtitle,
      };
    }
    return {
      ...item,
      title,
      subtitle: [enrich.intent, enrich.nextStep].filter(Boolean).join(" — ").slice(0, 220) ||
        item.subtitle,
      intent: enrich.intent,
      nextStep: enrich.nextStep,
      ctaUrl: enrich.ctaUrl,
      ctaLabel: enrich.ctaLabel,
      ctaKind: enrich.ctaKind,
    };
  });
}
