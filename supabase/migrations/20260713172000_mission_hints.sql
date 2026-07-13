-- Mission hints v1.1: user teaches Morning Mission what to ignore or how to interpret patterns.

CREATE TABLE public.mission_hints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_kind text NOT NULL CHECK (
    match_kind IN ('from_email', 'to_email', 'subject_contains', 'tag', 'source_id')
  ),
  match_value text NOT NULL,
  hint_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, match_kind, match_value)
);

CREATE INDEX mission_hints_user_idx ON public.mission_hints (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_hints TO authenticated;
GRANT ALL ON public.mission_hints TO service_role;

ALTER TABLE public.mission_hints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own mission hints"
  ON public.mission_hints
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER mission_hints_set_updated_at
  BEFORE UPDATE ON public.mission_hints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
