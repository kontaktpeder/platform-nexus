import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { InvoiceStoryline } from "@/lib/finance/invoice-storyline.server";

type DB = SupabaseClient<Database>;

export type InvoiceComposeContext = {
  invoice: {
    id: string;
    invoice_number: string | null;
    customer_name: string;
    customer_email: string | null;
    total: number;
    due_date: string | null;
    issue_date: string | null;
  };
  orgName: string;
  orgSlug: string;
  pdfFilename: string;
  storyline: InvoiceStoryline;
  defaultSubject: string;
  defaultTo: string;
};

function defaultSubject(
  invoice: InvoiceComposeContext["invoice"],
  level: number,
): string {
  const nr = invoice.invoice_number ? `#${invoice.invoice_number}` : "";
  if (level >= 3) return `Siste purring – faktura ${nr}`.trim();
  if (level >= 2) return `Purring – faktura ${nr}`.trim();
  return `Betalingspåminnelse – faktura ${nr}`.trim();
}

export async function loadInvoiceComposeContext(input: {
  supabase: DB;
  userId: string;
  invoiceId: string;
  orgSlug: string;
}): Promise<InvoiceComposeContext> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const {
    resolveFinanceConnection,
    fetchFinanceInvoice,
    fetchFinanceInvoicePdf,
  } = await import("@/lib/finance/finance-invoice.server");
  const { buildInvoiceStoryline } = await import("@/lib/finance/invoice-storyline.server");

  const fin = await resolveFinanceConnection({
    supabaseAdmin,
    userId: input.userId,
    orgSlug: input.orgSlug,
  });
  if (!fin) throw new Error("Finance er ikke koblet for denne organisasjonen.");

  const invoice = await fetchFinanceInvoice(fin, input.invoiceId);
  if (!invoice.customer_email) {
    throw new Error("Fakturaen mangler mottaker-e-post i Finance.");
  }

  const ownerSlug =
    /sicily/i.test(invoice.customer_name) || /sicily/i.test(fin.orgName)
      ? "gold-of-sicily"
      : null;

  const storyline = await buildInvoiceStoryline({
    supabase: input.supabase,
    userId: input.userId,
    customerName: invoice.customer_name,
    customerEmail: invoice.customer_email,
    ownerContextSlug: ownerSlug,
  });

  const { filename } = await fetchFinanceInvoicePdf(fin, input.invoiceId);

  const summary = {
    id: invoice.id,
    invoice_number: invoice.invoice_number,
    customer_name: invoice.customer_name,
    customer_email: invoice.customer_email,
    total: invoice.total,
    due_date: invoice.due_date,
    issue_date: invoice.issue_date,
  };

  return {
    invoice: summary,
    orgName: fin.orgName,
    orgSlug: fin.orgSlug,
    pdfFilename: filename,
    storyline,
    defaultSubject: defaultSubject(summary, storyline.escalationLevel),
    defaultTo: invoice.customer_email,
  };
}

export function formatNok(amount: number): string {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount);
}
