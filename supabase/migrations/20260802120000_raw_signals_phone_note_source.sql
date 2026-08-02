-- Allow phone/meeting note capture as a first-class raw_signals source.
ALTER TABLE public.raw_signals
  DROP CONSTRAINT IF EXISTS raw_signals_source_check;

ALTER TABLE public.raw_signals
  ADD CONSTRAINT raw_signals_source_check
  CHECK (source IN ('gmail','slack','manual','calendar','document','other','phone_note'));
