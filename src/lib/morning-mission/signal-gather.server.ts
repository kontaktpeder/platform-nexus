// Gather all signals for Morning Mission v0.
import { fetchRecentGmailSignals } from "@/lib/inbox/gmail-recent.server";
import type { MissionSignal } from "@/lib/morning-mission/signal-prefilter.server";
import { gmailToSignal } from "@/lib/morning-mission/signal-prefilter.server";
import type { WorkspaceAlertsMap } from "@/lib/module-alerts.types";
import { resolveModuleOpenUrl } from "@/lib/module-connections";
import type { ModuleConnectionRow } from "@/lib/module-connections";
import type { FinanceConnectionContext } from "@/lib/finance/finance-invoice.server";

export type MorningWorkspaceInput = {
  orgId: string;
  orgSlug: string;
  orgName: string;
  workspaceId: string;
  wsName: string;
  moduleAlerts: WorkspaceAlertsMap;
};

function formatNok(amount: number): string {
  return new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

async function unpaidInvoiceSignals(input: {
  ws: MorningWorkspaceInput;
  fin: FinanceConnectionContext;
}): Promise<MissionSignal[]> {
  const { listUnpaidFinanceInvoices } = await import("@/lib/finance/finance-invoice.server");
  const invoices = await listUnpaidFinanceInvoices(input.fin);
  const home = resolveModuleOpenUrl(input.fin.connection);

  return invoices.map((inv) => {
    const nr = inv.invoice_number ? `#${inv.invoice_number}` : "uten nummer";
    const due = inv.due_date
      ? ` Forfall ${new Date(inv.due_date).toLocaleDateString("nb-NO")}.`
      : "";
    return {
      id: `finance:${input.ws.orgSlug}:invoice:${inv.id}`,
      source: "finance",
      subject: `Ubetalt faktura ${nr} · ${inv.customer_name}`,
      from: `Finance · ${input.ws.orgName}`,
      snippet: `${formatNok(inv.total)} kr utestående.${due}`,
      occurred_at: inv.issue_date,
      href: home ? `${home.replace(/\/$/, "")}/invoices/${inv.id}` : null,
      tags: ["unpaid_invoice", "finance_invoice", "invoice_action"],
      meta: {
        invoice_id: inv.id,
        org_slug: input.ws.orgSlug,
        org_name: input.ws.orgName,
        customer_name: inv.customer_name,
        customer_email: inv.customer_email,
        invoice_number: inv.invoice_number,
        total: inv.total,
        due_date: inv.due_date,
      },
    };
  });
}

export function moduleAlertsToSignals(input: {
  orgName: string;
  orgSlug: string;
  wsName: string;
  moduleAlerts: WorkspaceAlertsMap;
}): MissionSignal[] {
  const out: MissionSignal[] = [];
  for (const [key, alert] of Object.entries(input.moduleAlerts)) {
    out.push({
      id: `module:${input.orgSlug}:${alert.moduleSlug}:${key}`,
      source: alert.moduleSlug === "work" ? "work" : "finance",
      subject: alert.title,
      from: `${alert.moduleName} · ${input.orgName}`,
      snippet: alert.description ?? "",
      occurred_at: null,
      href: alert.action_url ?? alert.connectionHomeUrl ?? null,
      tags: [alert.severity, "module_alert"],
      meta: {
        org_slug: input.orgSlug,
        ws_name: input.wsName,
        severity: alert.severity,
      },
    });
  }
  return out;
}

export async function gatherMorningSignals(input: {
  workspaces: MorningWorkspaceInput[];
  userId: string;
}): Promise<MissionSignal[]> {
  const gmail = (await fetchRecentGmailSignals({ hours: 72, max: 40 })).map(gmailToSignal);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const moduleSignals: MissionSignal[] = [];
  const financeInvoiceSignals: MissionSignal[] = [];

  for (const ws of input.workspaces) {
    moduleSignals.push(
      ...moduleAlertsToSignals({
        orgName: ws.orgName,
        orgSlug: ws.orgSlug,
        wsName: ws.wsName,
        moduleAlerts: ws.moduleAlerts ?? {},
      }),
    );

    const { resolveFinanceConnection } = await import("@/lib/finance/finance-invoice.server");
    const fin = await resolveFinanceConnection({
      supabaseAdmin,
      userId: input.userId,
      orgSlug: ws.orgSlug,
    }).catch(() => null);

    if (!fin) continue;

    const unpaid = await unpaidInvoiceSignals({ ws, fin }).catch(() => []);
    financeInvoiceSignals.push(...unpaid);
  }

  return [...gmail, ...moduleSignals, ...financeInvoiceSignals];
}
