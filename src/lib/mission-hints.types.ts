export type MissionHintMatchKind =
  | "from_email"
  | "to_email"
  | "subject_contains"
  | "tag"
  | "source_id";

export type MissionHint = {
  match_kind: MissionHintMatchKind;
  match_value: string;
  hint_text: string;
};

export type MissionHintInput = MissionHint;
