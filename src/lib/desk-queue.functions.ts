/**
 * Desk queue — raw signals, no AI ranking.
 * User completes / snoozes / removes; next items fill the visible slots.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MissionActionState } from "@/lib/mission-action-state";
import type { MissionSignal } from "@/lib/morning-mission/signal-prefilter.server";
import type { DeskQueueItem, DeskQueueResponse, DeskQueueSource } from "@/lib/desk-queue.types";

const POOL = 24;

function isHidden(signalId: string, states: MissionActionState[]): boolean {
  const now = Date.now();
  const keys = [signalId, `brief:${signalId}`];
  for (const key of keys) {
    const s = states.find((x) => x.action_key === key);
    if (!s) continue;
    if (s.status === "dismissed" || s.status === "handled_locally") return true;
    if (s.status === "snoozed" && s.snoozed_until) {
      if (new Date(s.snoozed_until).getTime() > now) return true;
    }
  }
  return false;
}

function sourceLabel(source: DeskQueueSource): string {
  switch (source) {
    case "gmail":
      return "Gmail";
    case "finance":
      return "Finance";
    case "work":
      return "Work";
    case "slack":
      return "Slack";
    case "field":
      return "Field";
    case "manual":
      return "Manuelt";
    case "calendar":
      return "Kalender";
  }
}

function isDraftSignal(signal: MissionSignal): boolean {
  return signal.tags.includes("draft") || signal.meta?.is_draft === true;
}

function isAppointmentSignal(signal: MissionSignal): boolean {
  return signal.tags.includes("appointment") || signal.source === "calendar";
}

function appointmentTitle(signal: MissionSignal): string {
  if (signal.source === "calendar") {
    return signal.subject.trim() || "Kalender";
  }
  const text = `${signal.subject} ${signal.snippet}`;
  const m = text.match(/(?:klokken|kl\.?)\s*(\d{1,2})[:.](\d{2})/i);
  if (m) {
    const hh = m[1].padStart(2, "0");
    const mm = m[2];
    if (/\bi\s*morgen\b/i.test(text)) return `I morgen · ${hh}:${mm}`;
    return `Time · ${hh}:${mm}`;
  }
  if (/\bi\s*morgen\b/i.test(text)) return "I morgen · avtale";
  return "Timeavtale";
}

function rank(signal: MissionSignal): number {
  if (signal.tags.includes("unpaid_invoice")) return 100;
  if (signal.tags.includes("invoice_action")) return 95;
  if (signal.tags.includes("overdue")) return 94;
  if (isAppointmentSignal(signal)) return 92;
  if (signal.tags.includes("follow_up") || signal.tags.includes("due")) return 91;
  if (signal.source === "finance") return 90;
  if (signal.tags.includes("no_plan")) return 78;
  if (signal.source === "manual") return 75;
  if (isDraftSignal(signal)) return 72;
  if (signal.tags.includes("unread")) return 70;
  if (signal.source === "slack") return 55;
  if (signal.source === "work") return 50;
  return 40;
}

function gmailLaneOf(
  signal: MissionSignal,
): NonNullable<DeskQueueItem["gmailLane"]> {
  if (signal.tags.includes("draft") || signal.meta?.is_draft === true) return "draft";
  if (signal.tags.includes("spam") || signal.meta?.is_spam === true) return "spam";
  if (signal.tags.includes("trash") || signal.meta?.is_trash === true) return "trash";
  if (signal.tags.includes("sent") || signal.meta?.is_sent === true) return "sent";
  return "inbox";
}

function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function financeLaneOf(
  signal: MissionSignal,
): NonNullable<DeskQueueItem["financeLane"]> {
  if (signal.tags.includes("finance_widget") || signal.meta?.needs_invoices_read === true) {
    return "needs_key";
  }
  const dueRaw = signal.meta?.due_date;
  if (typeof dueRaw !== "string" || !dueRaw) return "open";
  const due = new Date(dueRaw.includes("T") ? dueRaw : `${dueRaw}T12:00:00.000Z`);
  if (Number.isNaN(due.getTime())) return "open";
  const today = startOfUtcDay(new Date());
  const dueDay = startOfUtcDay(due);
  const dayMs = 86_400_000;
  if (dueDay < today) return "overdue";
  if (dueDay <= today + 7 * dayMs) return "due_soon";
  return "open";
}

function financeLaneLabel(lane: NonNullable<DeskQueueItem["financeLane"]>): string {
  switch (lane) {
    case "overdue":
      return "Forfalt";
    case "due_soon":
      return "Forfaller snart";
    case "needs_key":
      return "Finance";
    case "open":
      return "Ubetalt";
  }
}

function formatFinanceDue(dueRaw: string | null | undefined): string | null {
  if (!dueRaw || typeof dueRaw !== "string") return null;
  const due = new Date(dueRaw.includes("T") ? dueRaw : `${dueRaw}T12:00:00.000Z`);
  if (Number.isNaN(due.getTime())) return null;
  return due.toLocaleDateString("nb-NO");
}

function financeDueDaysOf(dueRaw: string | null | undefined): number | null {
  if (!dueRaw || typeof dueRaw !== "string") return null;
  const due = new Date(dueRaw.includes("T") ? dueRaw : `${dueRaw}T12:00:00.000Z`);
  if (Number.isNaN(due.getTime())) return null;
  const today = startOfUtcDay(new Date());
  const dueDay = startOfUtcDay(due);
  return Math.floor((today - dueDay) / 86_400_000);
}

function financeToItem(
  signal: MissionSignal,
  entityByEmail: Map<string, string>,
): DeskQueueItem {
  const lane = financeLaneOf(signal);
  const customerName =
    typeof signal.meta?.customer_name === "string" ? signal.meta.customer_name.trim() : "";
  const customerEmail =
    typeof signal.meta?.customer_email === "string" &&
    signal.meta.customer_email.includes("@")
      ? signal.meta.customer_email.toLowerCase()
      : null;
  const invoiceId =
    typeof signal.meta?.invoice_id === "string" ? signal.meta.invoice_id : null;
  const orgSlug =
    typeof signal.meta?.org_slug === "string" ? signal.meta.org_slug : null;
  const invNr =
    typeof signal.meta?.invoice_number === "string" && signal.meta.invoice_number
      ? `#${signal.meta.invoice_number}`
      : null;
  const total =
    typeof signal.meta?.total === "number"
      ? new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(
          Math.round(signal.meta.total),
        )
      : null;
  const dueRaw =
    typeof signal.meta?.due_date === "string" ? signal.meta.due_date : null;
  const dueLabel = formatFinanceDue(dueRaw);
  const dueDays = financeDueDaysOf(dueRaw);
  const canPurr = lane !== "needs_key" && !!invoiceId && !!orgSlug;

  let intent: string;
  let nextStep: string;
  if (lane === "needs_key") {
    intent = signal.subject.trim() || "Ubetalte fakturaer";
    nextStep =
      "Dette er et oppsett-gap, ikke en sak. Koble invoices:read under Moduler → Finance for å se hver faktura, sende purring og få anbefaling ut fra tidligere mail.";
  } else if (lane === "overdue") {
    intent = customerName
      ? `Ubetalt faktura${invNr ? ` ${invNr}` : ""} · ${customerName}`
      : signal.subject.trim();
    nextStep = [
      total ? `${total} kr utestående` : null,
      dueDays != null && dueDays > 0
        ? `${dueDays} dager forfalt`
        : dueLabel
          ? `forfalt ${dueLabel}`
          : "forfalt",
      "Sjekker mailhistorikk for anbefaling…",
    ]
      .filter(Boolean)
      .join(" · ");
  } else if (lane === "due_soon") {
    intent = customerName
      ? `Faktura${invNr ? ` ${invNr}` : ""} forfaller snart · ${customerName}`
      : signal.subject.trim();
    nextStep = [
      total ? `${total} kr` : null,
      dueLabel ? `forfall ${dueLabel}` : null,
      "Sjekker mailhistorikk for anbefaling…",
    ]
      .filter(Boolean)
      .join(" · ");
  } else {
    intent = customerName
      ? `Ubetalt faktura${invNr ? ` ${invNr}` : ""} · ${customerName}`
      : signal.subject.trim();
    nextStep = [
      total ? `${total} kr utestående` : null,
      dueLabel ? `forfall ${dueLabel}` : null,
      "Sjekker mailhistorikk for anbefaling…",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return {
    id: signal.id,
    kind: "signal",
    title: signal.subject.trim() || intent,
    subtitle: signal.snippet || null,
    source: "finance",
    sourceLabel: financeLaneLabel(lane),
    href: signal.href,
    sourceIds: [signal.id],
    occurredAt: signal.occurred_at,
    fromName: customerName || null,
    fromEmail: customerEmail,
    entityId: customerEmail ? (entityByEmail.get(customerEmail) ?? null) : null,
    financeLane: lane,
    financeInvoiceId: invoiceId,
    financeOrgSlug: orgSlug,
    financeDueDays: dueDays,
    intent,
    nextStep,
    ctaLabel: canPurr
      ? "Send purring"
      : lane === "needs_key"
        ? "Koble Finance"
        : null,
    ctaKind: canPurr ? "purring" : lane === "needs_key" ? "open_link" : null,
    ctaUrl: lane === "needs_key" ? "/modules" : null,
  };
}

function gmailFields(signal: MissionSignal): Pick<
  DeskQueueItem,
  "fromName" | "fromEmail" | "gmailMessageId" | "hasUnsubscribe" | "gmailLane" | "toEmail"
> {
  if (signal.source !== "gmail") {
    return {
      fromName: null,
      fromEmail: null,
      gmailMessageId: null,
      hasUnsubscribe: false,
      gmailLane: null,
      toEmail: null,
    };
  }
  const fromEmail =
    typeof signal.meta?.from_email === "string" && signal.meta.from_email.includes("@")
      ? signal.meta.from_email.toLowerCase()
      : null;
  const toRaw = typeof signal.meta?.to === "string" ? signal.meta.to : "";
  const toMatch = toRaw.match(/[^\s"<>]+@[^\s"<>]+/);
  const toEmail = toMatch ? toMatch[0]!.toLowerCase() : null;
  const messageId = signal.id.startsWith("gmail:") ? signal.id.slice("gmail:".length) : null;
  const lane = gmailLaneOf(signal);
  return {
    fromName: signal.from?.trim() || null,
    fromEmail,
    gmailMessageId: messageId,
    hasUnsubscribe: signal.tags.includes("has_unsubscribe"),
    gmailLane: lane,
    toEmail,
  };
}

function toItem(signal: MissionSignal, entityByEmail: Map<string, string>): DeskQueueItem {
  const source = signal.source as DeskQueueSource;
  const draft = isDraftSignal(signal);
  const appointment = isAppointmentSignal(signal);
  const subject = signal.subject.trim() || "(uten emne)";
  const gmail = gmailFields(signal);
  const entityId = gmail.fromEmail ? (entityByEmail.get(gmail.fromEmail) ?? null) : null;

  if (draft) {
    return {
      id: signal.id,
      kind: "draft",
      title: "Fortsett der du slapp",
      subtitle: [subject, signal.snippet].filter(Boolean).join(" · ").slice(0, 160) || null,
      source,
      sourceLabel: "Utkast",
      href: signal.href,
      sourceIds: [signal.id],
      occurredAt: signal.occurred_at,
      ...gmail,
      gmailLane: "draft",
      entityId,
    };
  }
  if (appointment) {
    return {
      id: signal.id,
      kind: "appointment",
      title: appointmentTitle(signal),
      subtitle:
        signal.source === "calendar"
          ? signal.snippet || null
          : [subject, signal.from].filter(Boolean).join(" · ").slice(0, 160) || null,
      source,
      sourceLabel: signal.source === "calendar" ? "Kalender" : "Avtale",
      href: signal.href,
      sourceIds: [signal.id],
      occurredAt: signal.occurred_at,
      ...gmail,
      entityId,
    };
  }
  if (signal.tags.includes("follow_up")) {
    return {
      id: signal.id,
      kind: "follow_up",
      title: subject,
      subtitle: signal.snippet || null,
      source: "field",
      sourceLabel: "Oppfølging",
      href: signal.href,
      sourceIds: [signal.id],
      occurredAt: signal.occurred_at,
      entityId: signal.href?.startsWith("/kontakter/")
        ? signal.href.slice("/kontakter/".length).split("?")[0] || null
        : null,
    };
  }
  if (signal.tags.includes("no_plan")) {
    return {
      id: signal.id,
      kind: "no_plan",
      title: subject,
      subtitle: signal.snippet || null,
      source: "field",
      sourceLabel: "Field",
      href: signal.href,
      sourceIds: [signal.id],
      occurredAt: signal.occurred_at,
      entityId: signal.href?.startsWith("/kontakter/")
        ? signal.href.slice("/kontakter/".length).split("?")[0] || null
        : null,
    };
  }
  if (signal.source === "manual") {
    return {
      id: signal.id,
      kind: "manual",
      title: subject,
      subtitle: signal.from !== "Manuelt" ? signal.from : signal.snippet || null,
      source: "manual",
      sourceLabel: "Manuelt",
      href: signal.href,
      sourceIds: [signal.id],
      occurredAt: signal.occurred_at,
    };
  }
  if (signal.source === "finance" && signal.tags.includes("unpaid_invoice")) {
    return financeToItem(signal, entityByEmail);
  }
  const laneLabel =
    source === "gmail" && gmail.gmailLane === "sent"
      ? "Sendt"
      : source === "gmail" && gmail.gmailLane === "spam"
        ? "Spam"
        : source === "gmail" && gmail.gmailLane === "trash"
          ? "Papirkurv"
          : sourceLabel(source);

  return {
    id: signal.id,
    kind: source === "gmail" ? "mail" : "signal",
    title: subject,
    subtitle:
      source === "gmail" && gmail.gmailLane === "sent" && gmail.toEmail
        ? [`Til ${gmail.toEmail}`, signal.snippet].filter(Boolean).join(" · ").slice(0, 160)
        : [signal.from, signal.snippet].filter(Boolean).join(" · ").slice(0, 160) || null,
    source,
    sourceLabel: laneLabel,
    href: signal.href,
    sourceIds: [signal.id],
    occurredAt: signal.occurred_at,
    ...gmail,
    entityId,
  };
}

export const getDeskQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DeskQueueResponse> => {
    const { supabase, userId, claims } = context;
    const claimsRec = claims as Record<string, unknown>;
    const userEmail = (claimsRec.email as string | undefined) ?? null;
    const { gatherMorningSignals } = await import("@/lib/morning-mission/signal-gather.server");
    const { listMissionActionStates } = await import("@/lib/mission-action-state.server");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: memberships } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", userId);
    const orgIds = (memberships ?? []).map((m) => m.org_id as string);

    let workspaces: Array<{
      orgId: string;
      workspaceId: string;
      orgSlug: string;
      orgName: string;
      wsName: string;
      moduleAlerts: import("@/lib/module-alerts.types").WorkspaceAlertsMap;
    }> = [];

    if (orgIds.length) {
      const { data: orgs } = await supabaseAdmin
        .from("organizations")
        .select("id, name, slug")
        .in("id", orgIds);
      const { data: wsRows } = await supabaseAdmin
        .from("workspaces")
        .select("id, name, slug, org_id")
        .in("org_id", orgIds);
      const orgById = new Map((orgs ?? []).map((o) => [o.id as string, o]));
      const { fetchWorkspaceModuleAlerts } = await import("@/lib/module-alerts.server");
      workspaces = await Promise.all(
        (wsRows ?? []).map(async (ws) => {
          const org = orgById.get(ws.org_id as string);
          const alertsRes = await fetchWorkspaceModuleAlerts({
            supabaseAdmin,
            orgId: ws.org_id as string,
            workspaceId: ws.id as string,
          }).catch(() => ({ alerts: {}, errors: {} }));
          return {
            orgId: ws.org_id as string,
            workspaceId: ws.id as string,
            orgSlug: (org?.slug as string) ?? "",
            orgName: (org?.name as string) ?? "",
            wsName: ws.name as string,
            moduleAlerts: alertsRes.alerts,
          };
        }),
      );
    }

    const [{ signals: allSignals }, actionStates] = await Promise.all([
      gatherMorningSignals({ workspaces, userId, supabase }),
      listMissionActionStates(supabase, userId),
    ]);

    // Desk: do not hide newsletter/system "noise" — same actions for all mail.
    // Still drop dismissed items and own-account noise.
    const { isOwnNoiseMail } = await import(
      "@/lib/morning-mission/morning-mission-trust.server"
    );
    const seen = new Set<string>();
    const open = allSignals
      .filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        if (isHidden(s.id, actionStates)) return false;
        if (isOwnNoiseMail(s, userEmail)) return false;
        return true;
      })
      .sort((a, b) => {
        const rd = rank(b) - rank(a);
        if (rd !== 0) return rd;
        const at = a.occurred_at ? new Date(a.occurred_at).getTime() : 0;
        const bt = b.occurred_at ? new Date(b.occurred_at).getTime() : 0;
        return bt - at;
      });

    const emails = [
      ...new Set(
        open
          .flatMap((s) => {
            const keys: string[] = [];
            if (typeof s.meta?.from_email === "string") keys.push(s.meta.from_email);
            if (typeof s.meta?.customer_email === "string") keys.push(s.meta.customer_email);
            return keys;
          })
          .map((e) => e.toLowerCase())
          .filter((e) => e.includes("@")),
      ),
    ].slice(0, 80);

    const entityByEmail = new Map<string, string>();
    if (emails.length > 0) {
      const { data: identities } = await supabase
        .from("known_identities")
        .select("entity_id, external_key")
        .eq("user_id", userId)
        .eq("identity_type", "email_address")
        .in("external_key", emails)
        .not("entity_id", "is", null);
      for (const row of identities ?? []) {
        const key = String(row.external_key ?? "").toLowerCase();
        const eid = row.entity_id as string | null;
        if (key && eid) entityByEmail.set(key, eid);
      }
    }

    const baseItems = open.slice(0, POOL).map((s) => toItem(s, entityByEmail));
    const { enrichDeskGmailItems } = await import("@/lib/desk-mail-intent.server");
    const { enrichDeskFinanceItems } = await import("@/lib/desk-finance-context.server");
    const withMail = await enrichDeskGmailItems(baseItems, { maxFetch: 6 });
    const items = await enrichDeskFinanceItems(withMail, {
      supabase,
      userId,
      maxFetch: 4,
    });

    return {
      items,
      totalOpen: open.length,
      generatedAt: new Date().toISOString(),
    };
  });

/** Quick manual intake for Desk queue (oral / WhatsApp / no API). */
export const createDeskManualSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        text: z.string().min(1).max(4000),
        channel: z.string().max(40).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { insertManualDeskSignal } = await import(
      "@/lib/morning-mission/manual-signals.server"
    );
    const row = await insertManualDeskSignal({
      supabase: context.supabase,
      userId: context.userId,
      text: data.text,
      channel: data.channel ?? "manual",
    });
    return { ok: true as const, id: row.id };
  });

/** RFC 8058 one-click unsubscribe (POST) — used when no browser-safe body link. */
export const oneClickUnsubscribe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ url: z.string().url().max(4000) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { performOneClickUnsubscribe } = await import("@/lib/inbox/gmail.server");
    await performOneClickUnsubscribe(data.url);
    return { ok: true as const };
  });
