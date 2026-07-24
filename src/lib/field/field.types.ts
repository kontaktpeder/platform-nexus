// Field visits v0 — mobile place board + follow-ups.

export const FIELD_RESULTS = [
  "no_contact",
  "spoke_staff",
  "spoke_decision_maker",
  "interested_demo",
  "mail_sent",
  "waiting_reply",
  "demo_booked",
  "no_not_relevant",
] as const;

export type FieldResult = (typeof FIELD_RESULTS)[number];

export const FIELD_RESULT_LABEL: Record<FieldResult, string> = {
  no_contact: "Ingen treff",
  spoke_staff: "Snakket med ansatt",
  spoke_decision_maker: "Snakket med beslutningstaker",
  interested_demo: "Interessert / demo",
  mail_sent: "Mail sendt",
  waiting_reply: "Venter på svar",
  demo_booked: "Demo avtalt",
  no_not_relevant: "Nei / ikke relevant",
};

export const FOLLOW_UP_PRESETS = [
  "today",
  "tomorrow",
  "in_2_days",
  "in_3_days",
  "next_week",
  "pick_date",
  "none",
] as const;

export type FollowUpPreset = (typeof FOLLOW_UP_PRESETS)[number];

export const FOLLOW_UP_PRESET_LABEL: Record<FollowUpPreset, string> = {
  today: "I dag",
  tomorrow: "I morgen",
  in_2_days: "Om 2 dager",
  in_3_days: "Om 3 dager",
  next_week: "Neste uke",
  pick_date: "Velg dato",
  none: "Ingen oppfølging",
};

export type FollowUpCondition = "always" | "if_no_reply" | "if_no_new_activity";
export type FollowUpStatus = "open" | "done" | "cancelled";

export type FieldBoardSection = "due" | "upcoming" | "waiting" | "no_plan";

export const FIELD_SECTION_LABEL: Record<FieldBoardSection, string> = {
  due: "Må følges opp",
  upcoming: "Kommende",
  waiting: "Venter",
  no_plan: "Ingen plan",
};

export type FieldActivity = {
  id: string;
  entity_id: string;
  result: FieldResult;
  note: string | null;
  next_action: string | null;
  occurred_at: string;
  created_at: string;
};

export type FieldFollowUp = {
  id: string;
  entity_id: string;
  action: string;
  due_at: string;
  condition_type: FollowUpCondition;
  related_activity_id: string | null;
  status: FollowUpStatus;
  created_at: string;
  updated_at: string;
};

export type FieldPlaceCard = {
  entityId: string;
  name: string;
  slug: string;
  section: FieldBoardSection;
  situation: string | null;
  lastActivityAt: string | null;
  lastResult: FieldResult | null;
  nextAction: string | null;
  followUp: {
    id: string;
    dueAt: string;
    action: string;
    conditionType: FollowUpCondition;
  } | null;
  dueLabel: string | null;
};

export type FieldBoard = {
  sections: Record<FieldBoardSection, FieldPlaceCard[]>;
  counts: Record<FieldBoardSection, number> & { total: number };
  todayKey: string;
};

/** Default follow-up preset per activity result. */
export function defaultPresetForResult(result: FieldResult): FollowUpPreset {
  switch (result) {
    case "no_contact":
      return "in_2_days";
    case "spoke_staff":
      return "in_3_days";
    case "spoke_decision_maker":
      return "in_2_days";
    case "interested_demo":
      return "in_3_days";
    case "mail_sent":
    case "waiting_reply":
      return "in_3_days";
    case "demo_booked":
      return "pick_date";
    case "no_not_relevant":
      return "none";
  }
}

export function defaultConditionForResult(result: FieldResult): FollowUpCondition {
  if (result === "mail_sent" || result === "waiting_reply") return "if_no_reply";
  return "always";
}
