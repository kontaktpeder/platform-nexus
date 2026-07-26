-- Manual weekly control layer: NÅ / VENTER / REGNVÆR / IDÉBANK / LÆRING.
-- One row per user per Oslo week key (e.g. 2026-W30).

CREATE TABLE IF NOT EXISTS public.weekly_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_key)
);

CREATE INDEX IF NOT EXISTS weekly_plans_user_idx
  ON public.weekly_plans (user_id, week_key DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_plans TO authenticated;
GRANT ALL ON public.weekly_plans TO service_role;

ALTER TABLE public.weekly_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own weekly plans" ON public.weekly_plans;
CREATE POLICY "Users manage own weekly plans"
  ON public.weekly_plans
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS weekly_plans_set_updated_at ON public.weekly_plans;
CREATE TRIGGER weekly_plans_set_updated_at
  BEFORE UPDATE ON public.weekly_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
