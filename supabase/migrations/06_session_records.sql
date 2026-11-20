-- SENTINEX-CAT — Step 6: session_records (events + ML predictions + report pointers)
-- Run AFTER 05_test_sessions.sql

CREATE TABLE IF NOT EXISTS public.session_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL REFERENCES public.test_sessions (id) ON DELETE CASCADE,
  record_type text NOT NULL CHECK (
    record_type IN (
      'prediction',
      'leak',
      'sensor_fault',
      'pipeline',
      'scenario_segment',
      'report',
      'activity'
    )
  ),
  reading_number integer CHECK (reading_number IS NULL OR reading_number >= 0),
  scenario_id text,
  occurred_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.session_records IS
  'Timeline for a test session: ML outputs, leaks, SFI, pipeline, scenarios, report metadata.';

CREATE INDEX IF NOT EXISTS session_records_session_occurred_idx
  ON public.session_records (session_id, occurred_at);

CREATE INDEX IF NOT EXISTS session_records_session_type_idx
  ON public.session_records (session_id, record_type);

CREATE INDEX IF NOT EXISTS session_records_reading_idx
  ON public.session_records (session_id, reading_number)
  WHERE reading_number IS NOT NULL;

-- ── RLS (inherit access via test_sessions) ───────────────────────────────────
ALTER TABLE public.session_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_records_select" ON public.session_records;
CREATE POLICY "session_records_select"
  ON public.session_records
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.test_sessions ts
      WHERE ts.id = session_records.session_id
        AND (
          public.is_head()
          OR public.is_admin()
          OR ts.bay_id = public.current_user_bay_id()
          OR ts.profile_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "session_records_insert" ON public.session_records;
CREATE POLICY "session_records_insert"
  ON public.session_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.test_sessions ts
      WHERE ts.id = session_records.session_id
        AND (
          public.is_head()
          OR public.is_admin()
          OR (ts.bay_id = public.current_user_bay_id() AND ts.profile_id = auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "session_records_update" ON public.session_records;
CREATE POLICY "session_records_update"
  ON public.session_records
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.test_sessions ts
      WHERE ts.id = session_records.session_id
        AND (
          public.is_head()
          OR public.is_admin()
          OR (ts.bay_id = public.current_user_bay_id() AND ts.profile_id = auth.uid())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.test_sessions ts
      WHERE ts.id = session_records.session_id
        AND (
          public.is_head()
          OR public.is_admin()
          OR (ts.bay_id = public.current_user_bay_id() AND ts.profile_id = auth.uid())
        )
    )
  );
