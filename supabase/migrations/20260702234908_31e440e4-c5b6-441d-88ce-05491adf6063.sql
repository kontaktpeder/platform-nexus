
CREATE TYPE public.context_scope_type AS ENUM ('global','entity','project','workspace');

CREATE TABLE public.context_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES public.entities(id) ON DELETE CASCADE,
  scope_type public.context_scope_type NOT NULL,
  scope_ref text,
  summary text NOT NULL,
  key_facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  open_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_next_focus text,
  source_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_scanned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, scope_type, scope_ref, entity_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.context_summaries TO authenticated;
GRANT ALL ON public.context_summaries TO service_role;

ALTER TABLE public.context_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own context summaries"
  ON public.context_summaries FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX context_summaries_user_scope_idx
  ON public.context_summaries (user_id, scope_type, last_scanned_at DESC);

CREATE TRIGGER context_summaries_set_updated_at
  BEFORE UPDATE ON public.context_summaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
