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
};

export type DeskQueueResponse = {
  items: DeskQueueItem[];
  /** Total open signals after noise/action filters */
  totalOpen: number;
  generatedAt: string;
};
