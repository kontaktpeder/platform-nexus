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

function scoreLink(
  url: string,
  fromEmail: string | null,
  subject: string,
  label?: string | null,
): number {
  const u = url.toLowerCase();
  const from = (fromEmail ?? "").toLowerCase();
  const subj = subject.toLowerCase();
  const lab = (label ?? "").toLowerCase();
  const hay = `${u} ${lab}`;
  let score = 1;

  // Hard reject leftover assets (CSS/fonts) if any slip through.
  if (/\.(?:css|js|png|jpe?g|gif|svg|woff2?|ttf)(?:$|\?)|\/custom-fonts\//i.test(u)) {
    return -100;
  }

  if (/verify|confirm|activate|bekreft|aktiver|fullf[øo]r/i.test(hay)) score += 45;
  if (/verify|confirm|activate|bekreft/i.test(lab)) score += 25;

  if (/search\.google\.com\/search-console|google\.com\/webmasters/i.test(u)) score += 40;
  if (/myaccount\.google\.com|accounts\.google\.com/i.test(u) && /sikkerhet|security|alert|varsel/i.test(subj + from)) {
    score += 35;
  }
  if (/accounts\.google\.com/i.test(u) && /search console|søk/i.test(subj)) score += 20;
  if (/github\.com|linear\.app|notion\.so|stripe\.com|vercel\.com|vimeo\.com/i.test(u)) score += 15;
  if (/docs\.google\.com|drive\.google\.com|calendar\.google\.com/i.test(u)) score += 12;
  if (/native\.no|ads?\./i.test(u) && from.includes("native")) score += 10;

  // Prefer same registrable domain as sender (vimeo@vimeo.com → vimeo.com).
  const domain = from.includes("@") ? from.split("@")[1]! : "";
  if (domain && u.includes(domain)) score += 20;

  if (/\/unsubscribe|opt[-_]?out|email-preferences/i.test(u)) score -= 50;
  if (/\/view\/|click\.|track\.|redirect/i.test(u)) score += 3;
  if (u.length > 180) score -= 2;
  return score;
}

function pickBestLink(
  links: string[],
  fromEmail: string | null,
  subject: string,
  linkLabels?: Record<string, string>,
): string | null {
  if (!links.length) return null;
  const ranked = [...links].sort(
    (a, b) =>
      scoreLink(b, fromEmail, subject, linkLabels?.[b]) -
      scoreLink(a, fromEmail, subject, linkLabels?.[a]),
  );
  const best = ranked[0]!;
  if (scoreLink(best, fromEmail, subject, linkLabels?.[best]) < 1) return null;
  return best;
}

/** CTA only — no boilerplate intent/nextStep. */
function heuristicCta(input: {
  subject: string;
  fromEmail: string | null;
  snippet: string;
  bodyText: string;
  links: string[];
  linkLabels?: Record<string, string>;
  hasUnsubscribe?: boolean;
}): HeuristicCta {
  const subject = cleanMailText(input.subject);
  const snippet = cleanMailText(input.snippet);
  const fromEmail = input.fromEmail?.toLowerCase() ?? null;
  const blob = `${subject} ${snippet} ${input.bodyText}`.toLowerCase();
  const labels = input.linkLabels ?? {};
  const ctaUrl = pickBestLink(input.links, fromEmail, subject, labels);

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

  // Verify / confirm account emails (Vimeo etc.)
  if (/bekreft e-post|verify your email|confirm your email|aktiver konto|fullføre oppsettet/i.test(blob)) {
    const url =
      input.links.find((l) =>
        /verify|confirm|activate|bekreft/i.test(`${l} ${labels[l] ?? ""}`),
      ) ?? ctaUrl;
    return {
      ctaUrl: url,
      ctaLabel: url ? "Bekreft e-post" : null,
      ctaKind: url ? "open_link" : "fyi",
    };
  }

  if (ctaUrl) {
    const anchor = labels[ctaUrl]?.trim();
    let label = "Åpne lenke";
    if (anchor && anchor.length <= 28) label = anchor;
    else if (/verify|confirm|bekreft/i.test(`${ctaUrl} ${anchor ?? ""}`)) label = "Bekreft e-post";
    else if (input.hasUnsubscribe || /nyhetsbrev|newsletter|proud to launch/i.test(blob)) {
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
    to: string | null;
    mailLane: string;
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
    to: r.to,
    mailLane: r.mailLane,
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
        "You write short Norwegian queue-card copy for the user's personal OS.",
        "Return ONLY a JSON array. Each item:",
        "id, intent (max 85 chars — what this mail means for the USER right now),",
        "nextStep (max 100 chars — the user's likely next move, or null),",
        "ctaUrl (use preferredCtaUrl if set and in links[], else best link from links[], else null),",
        "ctaLabel (short Norwegian button, or preferredCtaLabel),",
        "ctaKind: open_link | reply | fyi | other.",
        "mailLane is a soft orientation signal only — interpret neutrally from the full facts:",
        "- inbox: often addressed to the user.",
        "- sent: the user already wrote/sent this; requests in the body ('se over', 'gi innspill') are often for the recipient (to:), not for the user. Waiting on a reply may fit — but only if the content supports it.",
        "- draft: unfinished compose by the user.",
        "- spam/trash: usually low value; archive/delete unless clearly important.",
        "Do not invent waiting/purring or force a lane stereotype. Prefer content + from/to + mailLane together.",
        "NEVER use generic lines like 'Klikk lenken og gjør det mailen ber om'.",
        "Never invent URLs not in links[] / preferredCtaUrl.",
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
    to: string | null;
    mailLane: string;
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
    const linkLabels = brief?.linkLabels ?? {};
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
      linkLabels,
      hasUnsubscribe: hasUnsub,
    });

    // Always prefer AI for copy; heuristic CTA as hint + fallback.
    byId.set(item.id, fallbackFromHeuristic(subject, cta));

    if (brief) {
      needAi.push({
        id: item.id,
        subject,
        from: `${item.fromName ?? ""} <${item.fromEmail ?? ""}>`,
        to: item.toEmail ?? null,
        mailLane: item.gmailLane ?? (item.kind === "draft" ? "draft" : "inbox"),
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
    const unsubUrl = unsub?.url ?? null;
    const unsubOneClick = unsub?.oneClickUrl ?? null;
    const unsubFields = {
      hasUnsubscribe: unsub?.has ?? item.hasUnsubscribe,
      unsubscribeUrl: unsubUrl,
      unsubscribeOneClickUrl: unsubOneClick,
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
    // Never use unsubscribe endpoints as “neste steg”.
    let ctaUrl = enrich.ctaUrl;
    if (
      ctaUrl &&
      (ctaUrl === unsubUrl ||
        ctaUrl === unsubOneClick ||
        /unsubscribe|opt[-_]?out|email_unsubscribe/i.test(ctaUrl))
    ) {
      ctaUrl = null;
    }
    return {
      ...item,
      title,
      subtitle:
        [enrich.intent, enrich.nextStep].filter(Boolean).join(" — ").slice(0, 220) ||
        item.subtitle,
      intent: enrich.intent,
      nextStep: enrich.nextStep,
      ctaUrl,
      ctaLabel: ctaUrl ? enrich.ctaLabel : null,
      ctaKind: ctaUrl ? enrich.ctaKind : enrich.ctaKind === "open_link" ? "fyi" : enrich.ctaKind,
      ...unsubFields,
    };
  });
}
