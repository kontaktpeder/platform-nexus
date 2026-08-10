-- Daily Vision Board / alignment: one row per user per Oslo calendar day.

CREATE TABLE IF NOT EXISTS public.daily_alignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_key text NOT NULL,
  identity_energy text NOT NULL DEFAULT '',
  north_star text NOT NULL DEFAULT '',
  service_focus text NOT NULL DEFAULT '',
  win_today text NOT NULL DEFAULT '',
  tomorrow_priorities text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, day_key),
  CONSTRAINT daily_alignments_day_key_format CHECK (day_key ~ '^\d{4}-\d{2}-\d{2}$'),
  CONSTRAINT daily_alignments_identity_len CHECK (char_length(identity_energy) <= 4000),
  CONSTRAINT daily_alignments_north_star_len CHECK (char_length(north_star) <= 500),
  CONSTRAINT daily_alignments_service_len CHECK (char_length(service_focus) <= 4000),
  CONSTRAINT daily_alignments_win_len CHECK (char_length(win_today) <= 4000),
  CONSTRAINT daily_alignments_tomorrow_len CHECK (char_length(tomorrow_priorities) <= 2000)
);

CREATE INDEX IF NOT EXISTS daily_alignments_user_day_idx
  ON public.daily_alignments (user_id, day_key DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_alignments TO authenticated;
GRANT ALL ON public.daily_alignments TO service_role;

ALTER TABLE public.daily_alignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_alignments owner access" ON public.daily_alignments;
CREATE POLICY "daily_alignments owner access"
  ON public.daily_alignments FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_daily_alignments_updated_at ON public.daily_alignments;
CREATE TRIGGER trg_daily_alignments_updated_at
  BEFORE UPDATE ON public.daily_alignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
