-- Repair: if a partial run created signal_identities with reserved column name "role",
-- drop and let the main migration recreate with identity_role.
-- Safe when the table is empty (typical after a failed first run).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'signal_identities'
      AND column_name = 'role'
  ) THEN
    DROP TABLE public.signal_identities;
  END IF;
END $$;
