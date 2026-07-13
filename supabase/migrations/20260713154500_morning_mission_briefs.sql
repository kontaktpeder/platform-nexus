-- Morning Mission v0: one AI-generated daily brief per user (Europe/Oslo date).

CREATE TABLE public.morning_mission_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brief_date date NOT NULL,
  payload jsonb NOT NULL,
  source_signal_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, brief_date)
);

CREATE INDEX morning_mission_briefs_user_date_idx
  ON public.morning_mission_briefs (user_id, brief_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.morning_mission_briefs TO authenticated;
GRANT ALL ON public.morning_mission_briefs TO service_role;

ALTER TABLE public.morning_mission_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own morning briefs"
  ON public.morning_mission_briefs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER morning_mission_briefs_set_updated_at
  BEFORE UPDATE ON public.morning_mission_briefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Allow "waiting" as a mission metadata state (Morning Mission v0).
ALTER TABLE public.mission_action_states
  DROP CONSTRAINT IF EXISTS mission_action_states_status_check;

ALTER TABLE public.mission_action_states
  ADD CONSTRAINT mission_action_states_status_check
  CHECK (status IN ('dismissed', 'snoozed', 'handled_locally', 'waiting'));
