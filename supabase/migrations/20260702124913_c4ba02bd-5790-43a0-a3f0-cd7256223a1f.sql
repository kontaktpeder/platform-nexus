ALTER TABLE public.modules
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.module_connections
  ADD COLUMN IF NOT EXISTS module_info_snapshot jsonb;

UPDATE public.modules SET
  default_url = COALESCE(default_url, 'https://financecore.lovable.app'),
  config = jsonb_build_object('key_prefix', 'fc_live_', 'contract_version', '1.0')
WHERE slug = 'finance';

UPDATE public.modules SET
  default_url = COALESCE(default_url, 'https://work-heart-engine.lovable.app'),
  config = jsonb_build_object('key_prefix', 'wc_live_', 'contract_version', '1.0')
WHERE slug = 'work';