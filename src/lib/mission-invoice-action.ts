import type { DeskQueueItem } from "@/lib/desk-queue.types";
import type { MorningMissionItem } from "@/lib/morning-mission.types";

export function parseFinanceInvoiceId(
  sourceId: string,
): { invoiceId: string; orgSlug: string } | null {
  const m = sourceId.match(/^finance:([^:]+):invoice:([0-9a-f-]{36})$/i);
  if (m) return { orgSlug: m[1], invoiceId: m[2] };
  return null;
}

export function parseInvoiceFromMissionItem(
  item: MorningMissionItem,
): { invoiceId: string; orgSlug: string } | null {
  for (const sid of item.source_ids) {
    const parsed = parseFinanceInvoiceId(sid);
    if (parsed) return parsed;
  }
  return null;
}

export function isInvoiceMissionItem(item: MorningMissionItem): boolean {
  return parseInvoiceFromMissionItem(item) !== null;
}

export function parseInvoiceFromDeskItem(
  item: DeskQueueItem,
): { invoiceId: string; orgSlug: string } | null {
  if (item.financeInvoiceId && item.financeOrgSlug) {
    return { invoiceId: item.financeInvoiceId, orgSlug: item.financeOrgSlug };
  }
  for (const sid of item.sourceIds) {
    const parsed = parseFinanceInvoiceId(sid);
    if (parsed) return parsed;
  }
  return parseFinanceInvoiceId(item.id);
}

export function isFinanceInvoiceDeskItem(item: DeskQueueItem): boolean {
  return (
    item.source === "finance" &&
    (parseInvoiceFromDeskItem(item) !== null || item.financeLane === "needs_key")
  );
}
