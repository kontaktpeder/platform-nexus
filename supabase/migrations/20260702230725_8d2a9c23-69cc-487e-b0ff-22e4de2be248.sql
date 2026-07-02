
-- Enums
DO $$ BEGIN
  CREATE TYPE public.entity_type AS ENUM ('person','company','project','goal','commitment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.entity_relationship_kind AS ENUM ('works_on','customer_of','member_of','owns','blocked_by','related_to');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- entities
CREATE TABLE public.entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.entity_type NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  importance smallint NOT NULL DEFAULT 50 CHECK (importance BETWEEN 0 AND 100),
  summary text,
  last_seen_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entities TO authenticated;
GRANT ALL ON public.entities TO service_role;
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entities_owner_all" ON public.entities FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX entities_user_type_idx ON public.entities(user_id, type);
CREATE TRIGGER entities_set_updated_at BEFORE UPDATE ON public.entities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- entity_relationships
CREATE TABLE public.entity_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  to_entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  kind public.entity_relationship_kind NOT NULL DEFAULT 'related_to',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, from_entity_id, to_entity_id, kind),
  CHECK (from_entity_id <> to_entity_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_relationships TO authenticated;
GRANT ALL ON public.entity_relationships TO service_role;
ALTER TABLE public.entity_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entity_relationships_owner_all" ON public.entity_relationships FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX entity_rel_from_idx ON public.entity_relationships(user_id, from_entity_id);
CREATE INDEX entity_rel_to_idx ON public.entity_relationships(user_id, to_entity_id);

-- entity_signals
CREATE TABLE public.entity_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  source text NOT NULL,
  signal_type text NOT NULL,
  external_ref text NOT NULL,
  occurred_at timestamptz,
  snippet text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_ref),
  CHECK (snippet IS NULL OR char_length(snippet) <= 160)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_signals TO authenticated;
GRANT ALL ON public.entity_signals TO service_role;
ALTER TABLE public.entity_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entity_signals_owner_all" ON public.entity_signals FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX entity_signals_entity_idx ON public.entity_signals(user_id, entity_id);
CREATE INDEX entity_signals_ref_idx ON public.entity_signals(user_id, external_ref);
