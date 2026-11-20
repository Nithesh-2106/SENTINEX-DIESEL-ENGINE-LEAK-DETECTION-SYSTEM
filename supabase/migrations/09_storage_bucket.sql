-- SENTINEX-CAT — Step 9: Storage bucket (PDF reports, prefs JSON, chat txt)
-- Run AFTER 04_seed_head.sql
--
-- Bucket layout:
--   sentinex-files/reports/{profile_id}/{session_id}.pdf
--   sentinex-files/preferences/{profile_id}/prefs.json
--   sentinex-files/chat/{thread_id}/messages.txt

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sentinex-files',
  'sentinex-files',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'application/json',
    'text/plain',
    'text/plain; charset=utf-8'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Helper: parse first folder from object path ──────────────────────────────
CREATE OR REPLACE FUNCTION public.storage_folder(name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT split_part(name, '/', 1);
$$;

CREATE OR REPLACE FUNCTION public.storage_profile_id_from_path(name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT split_part(name, '/', 2);
$$;

-- ── SELECT policies ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sentinex_files_select_reports" ON storage.objects;
CREATE POLICY "sentinex_files_select_reports"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'sentinex-files'
    AND public.storage_folder(name) = 'reports'
    AND (
      public.is_head()
      OR public.is_admin()
      OR public.storage_profile_id_from_path(name) = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "sentinex_files_select_preferences" ON storage.objects;
CREATE POLICY "sentinex_files_select_preferences"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'sentinex-files'
    AND public.storage_folder(name) = 'preferences'
    AND public.storage_profile_id_from_path(name) = auth.uid()::text
  );

DROP POLICY IF EXISTS "sentinex_files_select_chat" ON storage.objects;
CREATE POLICY "sentinex_files_select_chat"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'sentinex-files'
    AND public.storage_folder(name) = 'chat'
    AND (
      public.is_head()
      OR public.is_admin()
      OR name LIKE ('chat/dm_head__' || (SELECT username FROM public.profiles WHERE id = auth.uid()) || '%')
      OR name LIKE ('chat/dm_' || (SELECT username FROM public.profiles WHERE id = auth.uid()) || '__%')
      OR name = 'chat/group_tc03/messages.txt'
    )
  );

-- ── INSERT policies ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sentinex_files_insert_reports" ON storage.objects;
CREATE POLICY "sentinex_files_insert_reports"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'sentinex-files'
    AND public.storage_folder(name) = 'reports'
    AND public.storage_profile_id_from_path(name) = auth.uid()::text
  );

DROP POLICY IF EXISTS "sentinex_files_insert_preferences" ON storage.objects;
CREATE POLICY "sentinex_files_insert_preferences"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'sentinex-files'
    AND public.storage_folder(name) = 'preferences'
    AND public.storage_profile_id_from_path(name) = auth.uid()::text
    AND name = ('preferences/' || auth.uid()::text || '/prefs.json')
  );

DROP POLICY IF EXISTS "sentinex_files_insert_chat" ON storage.objects;
CREATE POLICY "sentinex_files_insert_chat"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'sentinex-files'
    AND public.storage_folder(name) = 'chat'
    AND (
      public.is_head()
      OR name LIKE ('chat/dm_head__' || (SELECT username FROM public.profiles WHERE id = auth.uid()) || '%')
      OR name LIKE ('chat/dm_' || (SELECT username FROM public.profiles WHERE id = auth.uid()) || '__%')
      OR name = 'chat/group_tc03/messages.txt'
    )
  );

-- ── UPDATE policies (required for upsert / append) ───────────────────────────
DROP POLICY IF EXISTS "sentinex_files_update_reports" ON storage.objects;
CREATE POLICY "sentinex_files_update_reports"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'sentinex-files'
    AND public.storage_folder(name) = 'reports'
    AND (
      public.storage_profile_id_from_path(name) = auth.uid()::text
      OR public.is_head()
    )
  )
  WITH CHECK (
    bucket_id = 'sentinex-files'
    AND public.storage_folder(name) = 'reports'
  );

DROP POLICY IF EXISTS "sentinex_files_update_preferences" ON storage.objects;
CREATE POLICY "sentinex_files_update_preferences"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'sentinex-files'
    AND name = ('preferences/' || auth.uid()::text || '/prefs.json')
  )
  WITH CHECK (
    bucket_id = 'sentinex-files'
    AND name = ('preferences/' || auth.uid()::text || '/prefs.json')
  );

DROP POLICY IF EXISTS "sentinex_files_update_chat" ON storage.objects;
CREATE POLICY "sentinex_files_update_chat"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'sentinex-files'
    AND public.storage_folder(name) = 'chat'
    AND (
      public.is_head()
      OR name LIKE ('chat/dm_head__' || (SELECT username FROM public.profiles WHERE id = auth.uid()) || '%')
      OR name LIKE ('chat/dm_' || (SELECT username FROM public.profiles WHERE id = auth.uid()) || '__%')
      OR name = 'chat/group_tc03/messages.txt'
    )
  )
  WITH CHECK (
    bucket_id = 'sentinex-files'
    AND public.storage_folder(name) = 'chat'
  );
