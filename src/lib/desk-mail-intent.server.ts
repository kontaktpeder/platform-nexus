/**
 * Desk queue: short intent + primary CTA for Gmail cards.
 * Heuristics pick CTA URL/label; flash-lite always writes intent/nextStep.
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

type HeuristicCta = {
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
  if (/myaccount\.google\.com|accounts\.google\.com/i.test(u) && /sikkerhet|security|alert|varsel/i.test(subj + from)) {
    score += 35;
  }
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

/** CTA only — no boilerplate intent/nextStep. */
function heuristicCta(input: {
  subject: string;
  fromEmail: string | null;
  snippet: string;
  bodyText: string;
  links: string[];
  hasUnsubscribe?: boolean;
}): HeuristicCta {
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
      ctaUrl: url,
      ctaLabel: url ? "Åpne Search Console" : null,
      ctaKind: url ? "open_link" : "fyi",
    };
  }

  if (
    fromEmail?.includes("accounts.google.com") ||
    fromEmail?.includes("no-reply@accounts.google") ||
    /sikkerhetsvarsel|security alert|new sign-?in|ny innlogging/i.test(blob)
  ) {
    const url =
      input.links.find((l) => /myaccount\.google|accounts\.google/i.test(l)) ?? ctaUrl;
    return {
      ctaUrl: url,
      ctaLabel: url ? "Sjekk Google-konto" : null,
      ctaKind: url ? "open_link" : "fyi",
    };
  }

  if (ctaUrl) {
    let label = "Åpne lenke";
    if (input.hasUnsubscribe || /nyhetsbrev|newsletter|proud to launch/i.test(blob)) {
      label = "Åpne";
    }
    return { ctaUrl, ctaLabel: label, ctaKind: "open_link" };
  }

  if (input.hasUnsubscribe) {
    return { ctaUrl: null, ctaLabel: null, ctaKind: "fyi" };
  }

  return { ctaUrl: null, ctaLabel: null, ctaKind: "other" };
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
    hintCtaUrl: string | null;
    hintCtaLabel: string | null;
    hintCtaKind: DeskMailCtaKind;
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
    preferredCtaUrl: r.hintCtaUrl,
    preferredCtaLabel: r.hintCtaLabel,
  }));

  try {
    const { text } = await generateText({
      model: getGeminiModel("flash-lite"),
      system: [
        "You write short Norwegian queue-card copy for inbox emails.",
        "Return ONLY a JSON array. Each item:",
        "id, intent (max 85 chars — concrete: what this mail is about / asks of the user),",
        "nextStep (max 100 chars — specific action, e.g. 'Bekreft om innloggingen var deg' or 'Les Native Ads-lansering hvis relevant, ellers arkiver'),",
        "ctaUrl (use preferredCtaUrl if set and in links[], else best link from links[], else null),",
        "ctaLabel (short Norwegian button, or preferredCtaLabel),",
        "ctaKind: open_link | reply | fyi | other.",
        "Rules:",
        "- NEVER use generic lines like 'Klikk lenken og gjør det mailen ber om' or 'Skum produktet via lenken'.",
        "- Security alerts: say what to verify (new login, device, location) if present in body/snippet.",
        "- Newsletters/product launches: name the product/topic; nextStep = read if relevant else archive.",
        "- Search Console: name the domain/property if present.",
        "- Never invent URLs not in links[] / preferredCtaUrl.",
      ].join(" "),
      prompt: JSON.stringify(payload),
    });
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start < 0 || end <= start) return out;
    const parsed = JSON.parse(text.slice(start, end + 1)) as AiRow[];
    for (const row of parsed) {
      if (!row?.id || !row.intent) continue;
      const src = rows.find((p) => p.id === row.id);
      const allowed = new Set(src?.links ?? []);
      let resolved: string | null = null;
      const preferred = src?.hintCtaUrl ?? null;
      if (preferred && (allowed.has(preferred) || allowed.size === 0)) {
        resolved = preferred;
      } else if (row.ctaUrl) {
        if (allowed.has(row.ctaUrl)) resolved = row.ctaUrl;
        else {
          resolved =
            [...allowed].find(
              (l) => l === row.ctaUrl || l.includes(row.ctaUrl!) || row.ctaUrl!.includes(l),
            ) ?? null;
        }
      }
      if (!resolved && preferred) resolved = preferred;

      const intent = cleanMailText(row.intent).slice(0, 120);
      const nextStep = row.nextStep ? cleanMailText(row.nextStep).slice(0, 140) : null;
      // Reject leftover generic boilerplate if model ignores instructions.
      const badNext =
        nextStep &&
        /klikk lenken og gjør det|skum produktet via lenken|åpne lenken for å se hva/i.test(
          nextStep,
        );

      out.set(row.id, {
        intent,
        nextStep: badNext ? null : nextStep,
        ctaUrl: resolved,
        ctaLabel:
          (row.ctaLabel ? cleanMailText(row.ctaLabel).slice(0, 40) : null) ||
          src?.hintCtaLabel ||
          (resolved ? "Åpne lenke" : null),
        ctaKind:
          row.ctaKind === "open_link" ||
          row.ctaKind === "reply" ||
          row.ctaKind === "fyi" ||
          row.ctaKind === "other"
            ? row.ctaKind
            : src?.hintCtaKind ?? (resolved ? "open_link" : "other"),
      });
    }
  } catch (err) {
    console.warn("[desk-mail-intent] AI enrich failed", err);
  }
  return out;
}

function fallbackFromHeuristic(
  subject: string,
  cta: HeuristicCta,
): DeskMailEnrichment {
  return {
    intent: subject.slice(0, 120) || "E-post",
    nextStep: null,
    ctaUrl: cta.ctaUrl,
    ctaLabel: cta.ctaLabel,
    ctaKind: cta.ctaKind,
  };
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
  const unsubById = new Map<
    string,
    {
      url: string | null;
      oneClickUrl: string | null;
      mailto: string | null;
      has: boolean;
    }
  >();
  const needAi: Array<{
    id: string;
    subject: string;
    from: string;
    snippet: string;
    body: string;
    links: string[];
    hintCtaUrl: string | null;
    hintCtaLabel: string | null;
    hintCtaKind: DeskMailCtaKind;
  }> = [];

  for (const { item, brief } of briefs) {
    const subject = cleanMailText(brief?.subject ?? item.title);
    const snippet = cleanMailText(brief?.snippet ?? item.subtitle ?? "");
    const links = brief?.links ?? [];
    const unsub = brief?.unsubscribe;
    const hasUnsub = !!(
      unsub?.url ||
      unsub?.oneClickUrl ||
      unsub?.mailto ||
      item.hasUnsubscribe
    );
    unsubById.set(item.id, {
      url: unsub?.url ?? null,
      oneClickUrl: unsub?.oneClickUrl ?? null,
      mailto: unsub?.mailto ?? null,
      has: hasUnsub,
    });

    const cta = heuristicCta({
      subject,
      fromEmail: item.fromEmail ?? null,
      snippet,
      bodyText: brief?.bodyText ?? "",
      links,
      hasUnsubscribe: hasUnsub,
    });

    // Always prefer AI for copy; heuristic CTA as hint + fallback.
    byId.set(item.id, fallbackFromHeuristic(subject, cta));

    if (brief) {
      needAi.push({
        id: item.id,
        subject,
        from: `${item.fromName ?? ""} <${item.fromEmail ?? ""}>`,
        snippet,
        body: brief.bodyText,
        links,
        hintCtaUrl: cta.ctaUrl,
        hintCtaLabel: cta.ctaLabel,
        hintCtaKind: cta.ctaKind,
      });
    }
  }

  const aiMap = await aiEnrichBatch(needAi.slice(0, 6));
  for (const [id, enrich] of aiMap) {
    const prev = byId.get(id);
    byId.set(id, {
      intent: enrich.intent,
      nextStep: enrich.nextStep,
      // Prefer heuristic CTA URL/label when present (trusted for Search Console / security).
      ctaUrl: prev?.ctaUrl || enrich.ctaUrl,
      ctaLabel: prev?.ctaLabel || enrich.ctaLabel,
      ctaKind:
        prev?.ctaUrl || enrich.ctaUrl
          ? "open_link"
          : enrich.ctaKind !== "other"
            ? enrich.ctaKind
            : (prev?.ctaKind ?? "other"),
    });
  }

  return items.map((item) => {
    const enrich = byId.get(item.id);
    const unsub = unsubById.get(item.id);
    const title = cleanMailText(item.title) || item.title;
    const unsubFields = {
      hasUnsubscribe: unsub?.has ?? item.hasUnsubscribe,
      unsubscribeUrl: unsub?.url ?? null,
      unsubscribeOneClickUrl: unsub?.oneClickUrl ?? null,
      unsubscribeMailto: unsub?.mailto ?? null,
    };
    if (!enrich) {
      return {
        ...item,
        title,
        subtitle: item.subtitle ? cleanMailText(item.subtitle) || item.subtitle : item.subtitle,
        ...unsubFields,
      };
    }
    return {
      ...item,
      title,
      subtitle:
        [enrich.intent, enrich.nextStep].filter(Boolean).join(" — ").slice(0, 220) ||
        item.subtitle,
      intent: enrich.intent,
      nextStep: enrich.nextStep,
      ctaUrl: enrich.ctaUrl,
      ctaLabel: enrich.ctaLabel,
      ctaKind: enrich.ctaKind,
      ...unsubFields,
    };
  });
}
