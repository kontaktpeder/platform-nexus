ALTER TABLE public.entity_signals
  ADD COLUMN IF NOT EXISTS link_source text NOT NULL DEFAULT 'manual'
  CHECK (link_source IN ('manual','auto'));

UPDATE public.entity_signals SET link_source = 'manual' WHERE link_source IS NULL;