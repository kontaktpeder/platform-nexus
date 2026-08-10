-- Fortell conversation history (server) + foundation for continuous personal memory.

CREATE TABLE IF NOT EXISTS public.fortell_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  archived_at timestamptz,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fortell_threads_title_len CHECK (title IS NULL OR char_length(title) <= 200)
);

CREATE INDEX IF NOT EXISTS fortell_threads_user_active_idx
  ON public.fortell_threads (user_id, last_message_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS fortell_threads_user_idx
  ON public.fortell_threads (user_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.fortell_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.fortell_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fortell_messages_role_check CHECK (role IN ('user', 'assistant')),
  CONSTRAINT fortell_messages_content_len CHECK (char_length(content) >= 1 AND char_length(content) <= 12000)
);

CREATE INDEX IF NOT EXISTS fortell_messages_thread_created_idx
  ON public.fortell_messages (thread_id, created_at ASC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fortell_threads TO authenticated;
GRANT ALL ON public.fortell_threads TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fortell_messages TO authenticated;
GRANT ALL ON public.fortell_messages TO service_role;

ALTER TABLE public.fortell_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fortell_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fortell_threads owner access" ON public.fortell_threads;
CREATE POLICY "fortell_threads owner access"
  ON public.fortell_threads FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "fortell_messages owner access" ON public.fortell_messages;
CREATE POLICY "fortell_messages owner access"
  ON public.fortell_messages FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_fortell_threads_updated_at ON public.fortell_threads;
CREATE TRIGGER trg_fortell_threads_updated_at
  BEFORE UPDATE ON public.fortell_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
