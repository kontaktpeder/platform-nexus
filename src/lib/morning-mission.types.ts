// Morning Mission v0 — client-safe types.

export type MorningMissionPriority = "high" | "medium" | "low";

export type MorningMissionItem = {
  id: string;
  title: string;
  explanation: string;
  recommended_action: string;
  priority: MorningMissionPriority;
  source_ids: string[];
  source_label?: string | null;
  href?: string | null;
};

export type MorningMissionNoise = {
  label: string;
  source_ids: string[];
};

export type MorningMissionHygiene = {
  label: string;
  senders?: string[];
  count?: number;
  source_ids: string[];
};

export type SlackMissionStatus = {
  connected: boolean;
  read_ok: boolean;
  activity_this_week: number;
  week_number: number | null;
  message: string;
  suggestion: string | null;
};

export type MorningMissionPayload = {
  today: MorningMissionItem[];
  this_week: MorningMissionItem[];
  waiting: MorningMissionItem[];
  closed: MorningMissionItem[];
  noise: MorningMissionNoise[];
  hygiene: MorningMissionHygiene[];
  weekly_summary?: string | null;
  slack_status?: SlackMissionStatus | null;
};

export type MorningMissionResponse = {
  briefDate: string;
  generatedAt: string;
  payload: MorningMissionPayload;
  sourceSignalIds: string[];
  fromCache: boolean;
};

export type MorningBriefItemAction = "done" | "snoozed" | "waiting" | "ignored";

export type MorningBriefActionOptions = {
  sourceIds?: string[];
  hint?: import("@/lib/mission-hints.types").MissionHintInput;
};
