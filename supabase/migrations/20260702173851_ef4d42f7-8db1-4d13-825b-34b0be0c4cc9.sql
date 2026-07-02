CREATE TABLE public.mission_action_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('dismissed', 'snoozed', 'handled_locally')),
  snoozed_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, action_key)
);

CREATE INDEX mission_action_states_user_idx ON public.mission_action_states (user_id);
CREATE INDEX mission_action_states_snooze_idx ON public.mission_action_states (user_id, snoozed_until);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_action_states TO authenticated;
GRANT ALL ON public.mission_action_states TO service_role;

ALTER TABLE public.mission_action_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own mission states"
  ON public.mission_action_states
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_mission_action_states_updated_at
  BEFORE UPDATE ON public.mission_action_states
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();