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
  /** List-Unsubscribe / keyword detect — show Meld av on card. */
  hasUnsubscribe?: boolean;
  /** https unsubscribe URL (header or body keyword). */
  unsubscribeUrl?: string | null;
  /** mailto unsubscribe address. */
  unsubscribeMailto?: string | null;
  /** Short “what they want” — cleaned / AI / heuristic. */
  intent?: string | null;
  /** What to do after opening CTA (e.g. check property in Search Console). */
  nextStep?: string | null;
  /** Primary action URL for open_link mails. */
  ctaUrl?: string | null;
  ctaLabel?: string | null;
  ctaKind?: "open_link" | "reply" | "fyi" | "other" | null;
};

export type DeskQueueResponse = {
  items: DeskQueueItem[];
  /** Total open signals after noise/action filters */
  totalOpen: number;
  generatedAt: string;
};
