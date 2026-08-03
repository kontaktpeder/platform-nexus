-- Personal dossier: curated "who I am" context for AI agents.
-- Distinct from Knowledge (world around the user) and context_summaries (scan-derived).

CREATE TABLE IF NOT EXISTS public.user_personal_context (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  schema_version text NOT NULL DEFAULT '1.0',
  dossier jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_markdown text NOT NULL DEFAULT '',
  source text,
  generated_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_personal_context_markdown_len CHECK (char_length(raw_markdown) <= 50000),
  CONSTRAINT user_personal_context_source_len CHECK (source IS NULL OR char_length(source) <= 200)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_personal_context TO authenticated;
GRANT ALL ON public.user_personal_context TO service_role;

ALTER TABLE public.user_personal_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_personal_context owner access" ON public.user_personal_context;
CREATE POLICY "user_personal_context owner access"
  ON public.user_personal_context FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_user_personal_context_updated_at ON public.user_personal_context;
CREATE TRIGGER trg_user_personal_context_updated_at
  BEFORE UPDATE ON public.user_personal_context
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
