-- raw_signals: unique constraint PostgREST can use for ON CONFLICT.
-- Replaces the partial unique index (which breaks supabase .upsert onConflict).

DROP INDEX IF EXISTS public.raw_signals_dedupe_idx;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'raw_signals_user_source_external_unique'
  ) THEN
    ALTER TABLE public.raw_signals
      ADD CONSTRAINT raw_signals_user_source_external_unique
      UNIQUE (user_id, source, external_id);
  END IF;
END $$;
