-- Scope weekly plans: personal (user) vs org-steered.
-- Existing rows become personal (organization_id null).

ALTER TABLE public.weekly_plans
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.weekly_plans
  DROP CONSTRAINT IF EXISTS weekly_plans_user_id_week_key_key;

ALTER TABLE public.weekly_plans
  DROP CONSTRAINT IF EXISTS weekly_plans_scope_check;

ALTER TABLE public.weekly_plans
  ADD CONSTRAINT weekly_plans_scope_check
  CHECK (
    (scope = 'personal' AND organization_id IS NULL)
    OR (scope = 'org' AND organization_id IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS weekly_plans_personal_uniq
  ON public.weekly_plans (user_id, week_key)
  WHERE organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS weekly_plans_org_uniq
  ON public.weekly_plans (user_id, week_key, organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS weekly_plans_org_idx
  ON public.weekly_plans (organization_id, week_key DESC)
  WHERE organization_id IS NOT NULL;
