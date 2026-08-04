/**
 * Enrich Desk Finance cards with storyline (mail + entity signals)
 * so nextStep / CTA help the user forward — not just “open Finance”.
 */

import type { DeskQueueItem } from "@/lib/desk-queue.types";
import type { InvoiceStoryline } from "@/lib/finance/invoice-storyline.server";

function adviceFromStory(
  story: InvoiceStoryline,
  lane: DeskQueueItem["financeLane"],
  overdueDays: number | null,
): NonNullable<DeskQueueItem["financeAdvice"]> {
  const blob = story.events
    .slice(0, 8)
    .map((e) => `${e.label} ${e.snippet ?? ""}`)
    .join(" ")
    .toLowerCase();
  const conflict =
    /\b(inkasso|advokat|tvist|stans|klage|juridisk|collection)\b/i.test(blob);

  if (
    conflict ||
    story.escalationLevel >= 3 ||
    (overdueDays != null && overdueDays >= 21)
  ) {
    return "escalate";
  }
  if (
    story.escalationLevel >= 2 ||
    lane === "overdue" ||
    (overdueDays != null && overdueDays >= 7)
  ) {
    return "follow_up";
  }
  return "soft_purr";
}

function nextStepFromAdvice(
  advice: NonNullable<DeskQueueItem["financeAdvice"]>,
  story: InvoiceStoryline,
  opts: {
    totalLine: string | null;
    overdueDays: number | null;
    dueLabel: string | null;
  },
): string {
  const age =
    opts.overdueDays != null && opts.overdueDays > 0
      ? `${opts.overdueDays} dager forfalt`
      : opts.dueLabel
        ? `forfall ${opts.dueLabel}`
        : null;
  const facts = [opts.totalLine, age].filter(Boolean).join(" · ");

  const lastMail = story.events.find((e) => e.source === "gmail");
  const lastAt = lastMail?.at
    ? new Date(lastMail.at).toLocaleDateString("nb-NO")
    : null;

  if (advice === "escalate") {
    const hist = lastMail
      ? `Tidligere tråd${lastAt ? ` ${lastAt}` : ""}: «${lastMail.label.slice(0, 60)}».`
      : `${story.escalationLabel}.`;
    return [
      facts || null,
      hist,
      "Ikke mer vennlig purring — send siste tydelige purring, eller lag oppfølging for høyere sak.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (advice === "follow_up") {
    const hist = lastMail
      ? `Dere har allerede vært i kontakt${lastAt ? ` (${lastAt})` : ""}.`
      : "Forfalt / tidligere henvendelse.";
    return [
      facts || null,
      hist,
      "Send en tydelig oppfølgingspurring — referer til forrige mail.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    facts || null,
    "Ingen tidligere purring i mail/historikk.",
    "Start med en vennlig betalingspåminnelse.",
  ]
    .filter(Boolean)
    .join(" ");
}

function ctaForAdvice(
  advice: NonNullable<DeskQueueItem["financeAdvice"]>,
): { ctaLabel: string; ctaKind: NonNullable<DeskQueueItem["ctaKind"]> } {
  switch (advice) {
    case "escalate":
      return { ctaLabel: "Siste purring", ctaKind: "purring" };
    case "follow_up":
      return { ctaLabel: "Purre igjen", ctaKind: "purring" };
    case "soft_purr":
      return { ctaLabel: "Send purring", ctaKind: "purring" };
  }
}

export async function enrichDeskFinanceItems(
  items: DeskQueueItem[],
  opts: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any;
    userId: string;
    maxFetch?: number;
  },
): Promise<DeskQueueItem[]> {
  const max = opts.maxFetch ?? 4;
  const targets = items.filter(
    (i) =>
      i.source === "finance" &&
      i.financeLane &&
      i.financeLane !== "needs_key" &&
      !!i.financeInvoiceId &&
      !!i.fromEmail,
  );
  if (targets.length === 0) return items;

  const { buildInvoiceStoryline } = await import(
    "@/lib/finance/invoice-storyline.server"
  );

  const byId = new Map<string, DeskQueueItem>();
  await Promise.all(
    targets.slice(0, max).map(async (item) => {
      try {
        const dueDays = item.financeDueDays ?? null;
        const story = await buildInvoiceStoryline({
          supabase: opts.supabase,
          userId: opts.userId,
          customerName: item.fromName || "Kunde",
          customerEmail: item.fromEmail ?? null,
          entityId: item.entityId ?? null,
          overdueDays: dueDays,
        });

        const advice = adviceFromStory(story, item.financeLane, dueDays);
        const { ctaLabel, ctaKind } = ctaForAdvice(advice);

        const totalMatch = (item.nextStep || item.subtitle || "").match(
          /([\d\s\u00a0]+)\s*kr/i,
        );
        const totalLine = totalMatch
          ? `${totalMatch[1]!.replace(/[\s\u00a0]/g, "")} kr`
          : null;
        const dueMatch = (item.nextStep || "").match(
          /forfall(?:er)?\s+([^·]+)/i,
        );
        const dueLabel =
          dueDays != null && dueDays > 0
            ? null
            : (dueMatch?.[1]?.trim() ?? null);

        byId.set(item.id, {
          ...item,
          entityId: item.entityId ?? story.entityId,
          financeAdvice: advice,
          financeEscalationLevel: story.escalationLevel,
          purringInstruction: story.suggestedTone,
          nextStep: nextStepFromAdvice(advice, story, {
            totalLine,
            overdueDays: dueDays,
            dueLabel,
          }),
          ctaLabel,
          ctaKind,
        });
      } catch (e) {
        console.warn(
          "[desk-finance]",
          item.id,
          e instanceof Error ? e.message : e,
        );
      }
    }),
  );

  return items.map((i) => byId.get(i.id) ?? i);
}
