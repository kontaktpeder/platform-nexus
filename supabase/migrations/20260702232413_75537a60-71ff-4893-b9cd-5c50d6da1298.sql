CREATE TABLE public.entity_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  suggestion_key text NOT NULL,
  proposed_name text NOT NULL,
  proposed_type public.entity_type NOT NULL,
  reason text NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('low','medium','high')),
  example_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','ignored','snoozed','accepted')),
  snoozed_until timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, suggestion_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_suggestions TO authenticated;
GRANT ALL ON public.entity_suggestions TO service_role;

ALTER TABLE public.entity_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own suggestions" ON public.entity_suggestions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX entity_suggestions_user_status_idx
  ON public.entity_suggestions (user_id, status);

CREATE TRIGGER entity_suggestions_set_updated_at
  BEFORE UPDATE ON public.entity_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();