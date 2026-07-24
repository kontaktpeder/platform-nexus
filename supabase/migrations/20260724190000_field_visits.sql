-- Field visits v0 — mobile besøkslogg + oppfølging.
-- Places are Knowledge company entities (metadata.field_place = true).
-- Activities are append-only; follow_ups drive the board sort order.

CREATE TABLE public.field_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  result text NOT NULL,
  note text,
  next_action text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT field_activities_result_check CHECK (
    result IN (
      'no_contact',
      'spoke_staff',
      'spoke_decision_maker',
      'interested_demo',
      'mail_sent',
      'waiting_reply',
      'demo_booked',
      'no_not_relevant'
    )
  ),
  CONSTRAINT field_activities_note_len CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT field_activities_next_action_len CHECK (next_action IS NULL OR char_length(next_action) <= 300)
);

CREATE INDEX field_activities_user_entity_idx
  ON public.field_activities (user_id, entity_id, occurred_at DESC);
CREATE INDEX field_activities_user_occurred_idx
  ON public.field_activities (user_id, occurred_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_activities TO authenticated;
GRANT ALL ON public.field_activities TO service_role;
ALTER TABLE public.field_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "field_activities_owner_all" ON public.field_activities FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.field_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  action text NOT NULL,
  due_at timestamptz NOT NULL,
  condition_type text NOT NULL DEFAULT 'always',
  related_activity_id uuid REFERENCES public.field_activities(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT field_follow_ups_condition_check CHECK (
    condition_type IN ('always', 'if_no_reply', 'if_no_new_activity')
  ),
  CONSTRAINT field_follow_ups_status_check CHECK (
    status IN ('open', 'done', 'cancelled')
  ),
  CONSTRAINT field_follow_ups_action_len CHECK (char_length(action) <= 300)
);

CREATE INDEX field_follow_ups_user_status_due_idx
  ON public.field_follow_ups (user_id, status, due_at);
CREATE INDEX field_follow_ups_entity_open_idx
  ON public.field_follow_ups (user_id, entity_id)
  WHERE status = 'open';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_follow_ups TO authenticated;
GRANT ALL ON public.field_follow_ups TO service_role;
ALTER TABLE public.field_follow_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "field_follow_ups_owner_all" ON public.field_follow_ups FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER field_follow_ups_set_updated_at
  BEFORE UPDATE ON public.field_follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
