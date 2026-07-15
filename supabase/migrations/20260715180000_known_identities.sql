-- Known identities: persistent, deterministic middle layer between signals and entities.
-- See docs/KNOWN_IDENTITIES.v0.md

CREATE TABLE IF NOT EXISTS public.known_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  identity_type text NOT NULL CHECK (
    identity_type IN (
      'email_address',
      'email_domain',
      'slack_user',
      'slack_channel',
      'external_account'
    )
  ),

  provider text NOT NULL,
  external_key text NOT NULL,

  display_name text,
  handle text,
  email text,
  domain text,

  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  seen_count integer NOT NULL DEFAULT 1,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  entity_id uuid,

  ignored_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, provider, identity_type, external_key)
);

CREATE INDEX IF NOT EXISTS known_identities_user_entity_idx
  ON public.known_identities (user_id, entity_id)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS known_identities_user_unlinked_idx
  ON public.known_identities (user_id, last_seen_at DESC)
  WHERE entity_id IS NULL AND ignored_at IS NULL;

CREATE INDEX IF NOT EXISTS known_identities_user_email_idx
  ON public.known_identities (user_id, lower(email))
  WHERE email IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.known_identities TO authenticated;
GRANT ALL ON public.known_identities TO service_role;

ALTER TABLE public.known_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "known_identities owner access" ON public.known_identities;
CREATE POLICY "known_identities owner access"
  ON public.known_identities FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_known_identities_updated_at ON public.known_identities;
CREATE TRIGGER trg_known_identities_updated_at
  BEFORE UPDATE ON public.known_identities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'entities'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'known_identities_entity_id_fkey'
  ) THEN
    ALTER TABLE public.known_identities
      ADD CONSTRAINT known_identities_entity_id_fkey
      FOREIGN KEY (entity_id)
      REFERENCES public.entities(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ─── signal_identities ─────────────────────────────────────────────────────
-- Note: column is identity_role, not "role" (reserved in PostgreSQL).

CREATE TABLE IF NOT EXISTS public.signal_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  signal_id uuid NOT NULL REFERENCES public.raw_signals(id) ON DELETE CASCADE,
  identity_id uuid NOT NULL REFERENCES public.known_identities(id) ON DELETE CASCADE,

  identity_role text NOT NULL,

  confidence numeric(4, 3),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (signal_id, identity_id, identity_role),
  CONSTRAINT signal_identities_identity_role_check CHECK (
    identity_role IN (
      'sender',
      'recipient',
      'cc',
      'mentioned',
      'channel',
      'domain',
      'participant'
    )
  )
);

CREATE INDEX IF NOT EXISTS signal_identities_identity_idx
  ON public.signal_identities (identity_id);

CREATE INDEX IF NOT EXISTS signal_identities_signal_idx
  ON public.signal_identities (signal_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_identities TO authenticated;
GRANT ALL ON public.signal_identities TO service_role;

ALTER TABLE public.signal_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signal_identities owner access" ON public.signal_identities;
CREATE POLICY "signal_identities owner access"
  ON public.signal_identities FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.raw_signals rs
      WHERE rs.id = signal_identities.signal_id
        AND rs.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.raw_signals rs
      WHERE rs.id = signal_identities.signal_id
        AND rs.user_id = auth.uid()
    )
  );

-- ─── entity_suggestions: promotion, not discovery ──────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'entity_suggestions'
  ) THEN
    ALTER TABLE public.entity_suggestions
      ADD COLUMN IF NOT EXISTS known_identity_id uuid;
    ALTER TABLE public.entity_suggestions
      ADD COLUMN IF NOT EXISTS suggestion_reason text;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'entity_suggestions_known_identity_id_fkey'
    ) THEN
      ALTER TABLE public.entity_suggestions
        ADD CONSTRAINT entity_suggestions_known_identity_id_fkey
        FOREIGN KEY (known_identity_id)
        REFERENCES public.known_identities(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'entity_suggestions'
  ) THEN
    CREATE INDEX IF NOT EXISTS entity_suggestions_known_identity_idx
      ON public.entity_suggestions (known_identity_id)
      WHERE known_identity_id IS NOT NULL;
  END IF;
END $$;

-- Backfill (only when entity_suggestions exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'entity_suggestions'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.known_identities (
    user_id, provider, identity_type, external_key, domain, display_name,
    seen_count, first_seen_at, last_seen_at, metadata
  )
  SELECT
    es.user_id, 'gmail', 'email_domain',
    substring(es.suggestion_key FROM 14),
    substring(es.suggestion_key FROM 14),
    es.proposed_name, GREATEST(es.example_count, 1),
    es.created_at, es.updated_at,
    jsonb_build_object('migrated_from_suggestion_key', es.suggestion_key)
  FROM public.entity_suggestions es
  WHERE es.suggestion_key LIKE 'gmail_domain:%'
    AND length(substring(es.suggestion_key FROM 14)) > 0
  ON CONFLICT (user_id, provider, identity_type, external_key) DO NOTHING;

  INSERT INTO public.known_identities (
    user_id, provider, identity_type, external_key, display_name,
    seen_count, first_seen_at, last_seen_at, metadata
  )
  SELECT
    es.user_id, 'slack', 'slack_channel',
    substring(es.suggestion_key FROM 15),
    es.proposed_name, GREATEST(es.example_count, 1),
    es.created_at, es.updated_at,
    jsonb_build_object('migrated_from_suggestion_key', es.suggestion_key)
  FROM public.entity_suggestions es
  WHERE es.suggestion_key LIKE 'slack_channel:%'
    AND length(substring(es.suggestion_key FROM 15)) > 0
  ON CONFLICT (user_id, provider, identity_type, external_key) DO NOTHING;

  INSERT INTO public.known_identities (
    user_id, provider, identity_type, external_key, display_name,
    seen_count, first_seen_at, last_seen_at, metadata
  )
  SELECT
    es.user_id, 'platform', 'external_account',
    substring(es.suggestion_key FROM 15),
    es.proposed_name, GREATEST(es.example_count, 1),
    es.created_at, es.updated_at,
    jsonb_build_object('migrated_from_suggestion_key', es.suggestion_key)
  FROM public.entity_suggestions es
  WHERE es.suggestion_key LIKE 'workspace_org:%'
    AND length(substring(es.suggestion_key FROM 15)) > 0
  ON CONFLICT (user_id, provider, identity_type, external_key) DO NOTHING;

  UPDATE public.entity_suggestions es
  SET known_identity_id = ki.id,
      suggestion_reason = COALESCE(es.suggestion_reason, 'legacy_cluster')
  FROM public.known_identities ki
  WHERE es.known_identity_id IS NULL
    AND es.suggestion_key LIKE 'gmail_domain:%'
    AND ki.user_id = es.user_id
    AND ki.provider = 'gmail'
    AND ki.identity_type = 'email_domain'
    AND ki.external_key = substring(es.suggestion_key FROM 14);

  UPDATE public.entity_suggestions es
  SET known_identity_id = ki.id,
      suggestion_reason = COALESCE(es.suggestion_reason, 'legacy_cluster')
  FROM public.known_identities ki
  WHERE es.known_identity_id IS NULL
    AND es.suggestion_key LIKE 'slack_channel:%'
    AND ki.user_id = es.user_id
    AND ki.provider = 'slack'
    AND ki.identity_type = 'slack_channel'
    AND ki.external_key = substring(es.suggestion_key FROM 15);

  UPDATE public.entity_suggestions es
  SET known_identity_id = ki.id,
      suggestion_reason = COALESCE(es.suggestion_reason, 'legacy_cluster')
  FROM public.known_identities ki
  WHERE es.known_identity_id IS NULL
    AND es.suggestion_key LIKE 'workspace_org:%'
    AND ki.user_id = es.user_id
    AND ki.provider = 'platform'
    AND ki.identity_type = 'external_account'
    AND ki.external_key = substring(es.suggestion_key FROM 15);
END $$;
