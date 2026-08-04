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
  /** List-Unsubscribe present — reply drawer can surface avmelding. */
  hasUnsubscribe?: boolean;
};

export type DeskQueueResponse = {
  items: DeskQueueItem[];
  /** Total open signals after noise/action filters */
  totalOpen: number;
  generatedAt: string;
};
