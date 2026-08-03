-- User-managed email signatures (casual / professional) for Nexus compose.
-- Senders still come from Gmail sendAs; signatures live in Nexus.

CREATE TABLE IF NOT EXISTS public.mail_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  tone text NOT NULL CHECK (tone IN ('casual', 'professional')),
  body text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  preferred_from_email text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mail_signatures_name_len CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT mail_signatures_body_len CHECK (char_length(body) BETWEEN 1 AND 4000)
);

CREATE INDEX IF NOT EXISTS mail_signatures_user_idx
  ON public.mail_signatures (user_id, sort_order, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS mail_signatures_one_default_per_user
  ON public.mail_signatures (user_id)
  WHERE is_default;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_signatures TO authenticated;
GRANT ALL ON public.mail_signatures TO service_role;

ALTER TABLE public.mail_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mail_signatures owner access" ON public.mail_signatures;
CREATE POLICY "mail_signatures owner access"
  ON public.mail_signatures FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_mail_signatures_updated_at ON public.mail_signatures;
CREATE TRIGGER trg_mail_signatures_updated_at
  BEFORE UPDATE ON public.mail_signatures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
