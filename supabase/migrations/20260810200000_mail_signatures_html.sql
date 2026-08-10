-- HTML signature + logo for Nexus compose (Hakone-style).
ALTER TABLE public.mail_signatures
  ADD COLUMN IF NOT EXISTS html_body text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS meta jsonb;

ALTER TABLE public.mail_signatures
  DROP CONSTRAINT IF EXISTS mail_signatures_html_body_len;
ALTER TABLE public.mail_signatures
  ADD CONSTRAINT mail_signatures_html_body_len
  CHECK (html_body IS NULL OR char_length(html_body) <= 20000);

ALTER TABLE public.mail_signatures
  DROP CONSTRAINT IF EXISTS mail_signatures_logo_url_len;
ALTER TABLE public.mail_signatures
  ADD CONSTRAINT mail_signatures_logo_url_len
  CHECK (logo_url IS NULL OR char_length(logo_url) <= 2000);
