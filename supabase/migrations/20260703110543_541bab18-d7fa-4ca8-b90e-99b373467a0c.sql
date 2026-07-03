
ALTER TABLE public.entity_suggestions
  ADD COLUMN IF NOT EXISTS raw_signal_id uuid REFERENCES public.raw_signals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_context public.owner_context;

CREATE INDEX IF NOT EXISTS entity_suggestions_signal_idx
  ON public.entity_suggestions (raw_signal_id) WHERE raw_signal_id IS NOT NULL;
