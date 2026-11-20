-- SENTINEX-CAT — Step 13: chat_messages (Ops Chat)
-- Run AFTER 03_profiles.sql

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id text NOT NULL,
  sender_role text NOT NULL,
  sender_profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  body text NOT NULL DEFAULT '',
  attachment jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.chat_messages IS
  'Ops Chat messages (DM + cell group). sender_role uses UI session keys: head | username.';

CREATE INDEX IF NOT EXISTS chat_messages_thread_created_idx
  ON public.chat_messages (thread_id, created_at);

CREATE OR REPLACE FUNCTION public.chat_thread_participants(thread_id text)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN thread_id = 'group_tc03' THEN
      ARRAY['head']::text[]
      || COALESCE(
        ARRAY(
          SELECT p.username
          FROM public.profiles p
          WHERE p.role = 'tester' AND p.is_active = true
          ORDER BY p.username
        ),
        ARRAY[]::text[]
      )
    WHEN thread_id LIKE 'dm_%' THEN
      string_to_array(substring(thread_id FROM 4), '__')
    ELSE
      ARRAY[]::text[]
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_chat_thread(thread_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin()
    OR public.current_session_key() = ANY(public.chat_thread_participants(thread_id));
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_messages_select" ON public.chat_messages;
CREATE POLICY "chat_messages_select"
  ON public.chat_messages
  FOR SELECT
  TO authenticated
  USING (public.can_access_chat_thread(thread_id));

DROP POLICY IF EXISTS "chat_messages_insert" ON public.chat_messages;
CREATE POLICY "chat_messages_insert"
  ON public.chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_profile_id = auth.uid()
    AND sender_role = public.current_session_key()
    AND public.can_access_chat_thread(thread_id)
  );

-- ── Realtime (optional; safe if already added) ───────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
