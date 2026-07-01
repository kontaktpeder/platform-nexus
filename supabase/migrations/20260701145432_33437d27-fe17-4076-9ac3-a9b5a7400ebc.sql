ALTER TABLE public.module_connections
  ADD COLUMN IF NOT EXISTS external_org_name text,
  ADD COLUMN IF NOT EXISTS resolved_org_home_url text,
  ADD COLUMN IF NOT EXISTS module_slug text;

CREATE TABLE IF NOT EXISTS public.module_connection_secrets (
  connection_id uuid PRIMARY KEY
    REFERENCES public.module_connections(id) ON DELETE CASCADE,
  api_key_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.module_connection_secrets TO service_role;
-- Intentionally NO grants to authenticated/anon — only service_role reads secrets

ALTER TABLE public.module_connection_secrets ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies — service_role bypasses RLS

DROP TRIGGER IF EXISTS t_module_connection_secrets_updated ON public.module_connection_secrets;
CREATE TRIGGER t_module_connection_secrets_updated
  BEFORE UPDATE ON public.module_connection_secrets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();