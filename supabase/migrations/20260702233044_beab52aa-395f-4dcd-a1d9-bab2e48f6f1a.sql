CREATE TYPE public.commitment_status AS ENUM ('suggested', 'open', 'done', 'dismissed');
CREATE TYPE public.commitment_confidence AS ENUM ('low', 'medium', 'high');

CREATE TABLE public.user_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL,
  source text NOT NULL,
  source_ref text NOT NULL,
  title text NOT NULL,
  due_date date,
  status public.commitment_status NOT NULL DEFAULT 'suggested',
  confidence public.commitment_confidence NOT NULL DEFAULT 'medium',
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_ref)
);

CREATE INDEX user_commitments_user_status_due_idx
  ON public.user_commitments (user_id, status, due_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_commitments TO authenticated;
GRANT ALL ON public.user_commitments TO service_role;

ALTER TABLE public.user_commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_commitments own rows" ON public.user_commitments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER user_commitments_set_updated_at
  BEFORE UPDATE ON public.user_commitments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();