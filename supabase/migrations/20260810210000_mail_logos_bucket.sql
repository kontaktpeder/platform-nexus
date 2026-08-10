-- Dedicated public bucket for email signature logos (small, resized client-side).
-- Path convention: {user_id}/mail-logo-*.{jpg|png}

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'mail-logos',
  'mail-logos',
  true,
  1048576, -- 1 MiB (logos are resized before upload)
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "mail_logos public read" ON storage.objects;
CREATE POLICY "mail_logos public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'mail-logos');

DROP POLICY IF EXISTS "mail_logos owner insert" ON storage.objects;
CREATE POLICY "mail_logos owner insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'mail-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "mail_logos owner update" ON storage.objects;
CREATE POLICY "mail_logos owner update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'mail-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'mail-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "mail_logos owner delete" ON storage.objects;
CREATE POLICY "mail_logos owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'mail-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
