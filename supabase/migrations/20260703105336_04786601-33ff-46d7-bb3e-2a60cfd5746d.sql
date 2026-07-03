
-- === Extend entity_relationships for AI/pipeline lifecycle ===
ALTER TABLE public.entity_relationships
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS confidence numeric,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS last_signal_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.entity_relationships
  DROP CONSTRAINT IF EXISTS entity_relationships_status_check;
ALTER TABLE public.entity_relationships
  ADD CONSTRAINT entity_relationships_status_check
  CHECK (status IN ('suggested','confirmed','rejected','archived'));

CREATE INDEX IF NOT EXISTS entity_relationships_status_idx
  ON public.entity_relationships (user_id, status);

DROP TRIGGER IF EXISTS trg_entity_relationships_updated_at ON public.entity_relationships;
CREATE TRIGGER trg_entity_relationships_updated_at
  BEFORE UPDATE ON public.entity_relationships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- === raw_signals: persisted source of truth ===
CREATE TABLE IF NOT EXISTS public.raw_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  source text NOT NULL,
  external_id text,
  external_thread_id text,
  raw_text text NOT NULL,
  summary text,
  status text NOT NULL DEFAULT 'new',
  occurred_at timestamptz,
  parsed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT raw_signals_status_check CHECK (status IN ('new','parsed','reviewed','ignored')),
  CONSTRAINT raw_signals_source_check CHECK (source IN ('gmail','slack','manual','calendar','document','other'))
);

CREATE UNIQUE INDEX IF NOT EXISTS raw_signals_dedupe_idx
  ON public.raw_signals (user_id, source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS raw_signals_status_idx
  ON public.raw_signals (user_id, status, occurred_at DESC);

CREATE INDEX IF NOT EXISTS raw_signals_workspace_idx
  ON public.raw_signals (workspace_id) WHERE workspace_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.raw_signals TO authenticated;
GRANT ALL ON public.raw_signals TO service_role;

ALTER TABLE public.raw_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "raw_signals owner access"
  ON public.raw_signals FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "raw_signals workspace members read"
  ON public.raw_signals FOR SELECT
  USING (
    workspace_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = raw_signals.workspace_id
        AND public.is_org_member(w.org_id, auth.uid())
    )
  );

CREATE TRIGGER trg_raw_signals_updated_at
  BEFORE UPDATE ON public.raw_signals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- === relation_suggestions: review queue for AI-proposed relations ===
CREATE TABLE IF NOT EXISTS public.relation_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_entity_id uuid REFERENCES public.entities(id) ON DELETE CASCADE,
  to_entity_id uuid REFERENCES public.entities(id) ON DELETE CASCADE,
  from_suggestion_id uuid REFERENCES public.entity_suggestions(id) ON DELETE CASCADE,
  to_suggestion_id uuid REFERENCES public.entity_suggestions(id) ON DELETE CASCADE,
  relation_type text NOT NULL,
  confidence numeric,
  status text NOT NULL DEFAULT 'pending',
  raw_signal_id uuid REFERENCES public.raw_signals(id) ON DELETE SET NULL,
  reasoning text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relation_suggestions_status_check CHECK (status IN ('pending','approved','rejected','merged')),
  CONSTRAINT relation_suggestions_from_target_check CHECK (from_entity_id IS NOT NULL OR from_suggestion_id IS NOT NULL),
  CONSTRAINT relation_suggestions_to_target_check CHECK (to_entity_id IS NOT NULL OR to_suggestion_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS relation_suggestions_user_status_idx
  ON public.relation_suggestions (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS relation_suggestions_signal_idx
  ON public.relation_suggestions (raw_signal_id) WHERE raw_signal_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.relation_suggestions TO authenticated;
GRANT ALL ON public.relation_suggestions TO service_role;

ALTER TABLE public.relation_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "relation_suggestions owner access"
  ON public.relation_suggestions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_relation_suggestions_updated_at
  BEFORE UPDATE ON public.relation_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- === entity_signals: link to persisted raw signal ===
ALTER TABLE public.entity_signals
  ADD COLUMN IF NOT EXISTS raw_signal_id uuid REFERENCES public.raw_signals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS entity_signals_raw_signal_idx
  ON public.entity_signals (raw_signal_id) WHERE raw_signal_id IS NOT NULL;
