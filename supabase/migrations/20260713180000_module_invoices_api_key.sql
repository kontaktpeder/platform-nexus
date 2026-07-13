-- Optional separate Finance API key with invoices:read (Mission Composer).
-- Verify key (platform:read + platform:verify) stays on api_key_ciphertext.

ALTER TABLE public.module_connection_secrets
  ADD COLUMN IF NOT EXISTS invoices_api_key_ciphertext text;
