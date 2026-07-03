DO $$ BEGIN
  CREATE TYPE public.owner_context AS ENUM ('personal','peder-enk','gold-of-sicily','unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.entities
  ADD COLUMN IF NOT EXISTS owner_context public.owner_context NOT NULL DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS entities_user_owner_context_idx
  ON public.entities (user_id, owner_context);