export type DeskQueueSource =
  | "gmail"
  | "finance"
  | "work"
  | "slack"
  | "field"
  | "manual"
  | "calendar";

export type DeskQueueKind =
  | "mail"
  | "draft"
  | "appointment"
  | "follow_up"
  | "no_plan"
  | "manual"
  | "work_session"
  | "signal";

export type DeskQueueItem = {
  id: string;
  kind: DeskQueueKind;
  title: string;
  subtitle: string | null;
  source: DeskQueueSource;
  sourceLabel: string;
  href: string | null;
  sourceIds: string[];
  occurredAt: string | null;
  /** Parsed Gmail sender — for contact / reply actions. */
  fromName?: string | null;
  fromEmail?: string | null;
  /** Linked Nexus entity when known via email identity. */
  entityId?: string | null;
  /** Gmail message id without `gmail:` prefix (inbox / drafts). */
  gmailMessageId?: string | null;
  /**
   * Soft mailbox orientation for AI (not a hard rule).
   * sent = user wrote it; inbox = typically to the user; draft = unfinished.
   */
  gmailLane?: "inbox" | "sent" | "draft" | "spam" | "trash" | "other" | null;
  /** Recipients (useful when lane is sent). */
  toEmail?: string | null;
  /**
   * Soft Finance orientation (not a hard rule).
   * overdue / due_soon / open unpaid; needs_key = widget fallback without invoices:read.
   */
  financeLane?: "overdue" | "due_soon" | "open" | "needs_key" | null;
  /** Finance invoice UUID (without finance:… prefix). */
  financeInvoiceId?: string | null;
  /** Platform org slug for invoice compose / Finance API. */
  financeOrgSlug?: string | null;
  /** Days past due (negative = before due). */
  financeDueDays?: number | null;
  /**
   * Recommended next move from mail/entity storyline.
   * soft_purr = first friendly reminder; follow_up = already contacted; escalate = higher case.
   */
  financeAdvice?: "soft_purr" | "follow_up" | "escalate" | null;
  financeEscalationLevel?: 1 | 2 | 3 | null;
  /** Prefill for InvoiceComposeSheet AI draft. */
  purringInstruction?: string | null;
  /** List-Unsubscribe / keyword detect — show Meld av on card. */
  hasUnsubscribe?: boolean;
  /** Browser-safe https unsubscribe (body link preferred). */
  unsubscribeUrl?: string | null;
  /** One-click List-Unsubscribe endpoint (POST, not open in browser). */
  unsubscribeOneClickUrl?: string | null;
  /** mailto unsubscribe address. */
  unsubscribeMailto?: string | null;
  /** Short “what they want” — cleaned / AI / heuristic. */
  intent?: string | null;
  /** What to do after opening CTA (e.g. check property in Search Console). */
  nextStep?: string | null;
  /** Primary action URL for open_link mails. */
  ctaUrl?: string | null;
  ctaLabel?: string | null;
  ctaKind?: "open_link" | "reply" | "fyi" | "purring" | "other" | null;
};

export type DeskQueueResponse = {
  items: DeskQueueItem[];
  /** Total open signals after noise/action filters */
  totalOpen: number;
  generatedAt: string;
};
