import type { MorningMissionItem } from "@/lib/morning-mission.types";

export function parseInvoiceFromMissionItem(
  item: MorningMissionItem,
): { invoiceId: string; orgSlug: string } | null {
  for (const sid of item.source_ids) {
    const m = sid.match(/^finance:([^:]+):invoice:([0-9a-f-]{36})$/i);
    if (m) return { orgSlug: m[1], invoiceId: m[2] };
  }
  return null;
}

export function isInvoiceMissionItem(item: MorningMissionItem): boolean {
  return parseInvoiceFromMissionItem(item) !== null;
}
