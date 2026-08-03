-- Register Control Core as a Platform module (Module Contract v1)
INSERT INTO public.modules (slug, name, description, icon, version, status, default_url, config, sort_order)
VALUES (
  'control',
  'Control Core',
  'Governance, obligations, evidence and control confidence.',
  'shield',
  '0.1.0',
  'beta',
  NULL,
  '{"key_prefix":"cc_live_","contract_version":"1.0"}'::jsonb,
  25
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  version = EXCLUDED.version,
  status = EXCLUDED.status,
  config = EXCLUDED.config,
  sort_order = EXCLUDED.sort_order;
