-- SENTINEX-CAT — Step 5: test_sessions
-- Run AFTER 04_seed_head.sql

CREATE TABLE IF NOT EXISTS public.test_sessions (
  id text PRIMARY KEY,
  bay_id text NOT NULL REFERENCES public.bays (id) ON DELETE RESTRICT,
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  engine_id text NOT NULL DEFAULT 'CAT_C13',
  engine_serial text,
  model_id text,
  model_name text,
  model_accuracy numeric(6, 4),
  started_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  ended_at timestamptz,
  total_readings integer NOT NULL DEFAULT 0 CHECK (total_readings >= 0),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'aborted')),
  summary jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT test_sessions_end_after_start CHECK (
    ended_at IS NULL OR ended_at >= started_at
  )
);

COMMENT ON TABLE public.test_sessions IS 'One row per streaming test run on a bay.';

CREATE INDEX IF NOT EXISTS test_sessions_bay_status_idx
  ON public.test_sessions (bay_id, status);

CREATE INDEX IF NOT EXISTS test_sessions_profile_started_idx
  ON public.test_sessions (profile_id, started_at DESC);

DROP TRIGGER IF EXISTS test_sessions_set_updated_at ON public.test_sessions;
CREATE TRIGGER test_sessions_set_updated_at
  BEFORE UPDATE ON public.test_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.test_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "test_sessions_select_own_bay_or_head" ON public.test_sessions;
CREATE POLICY "test_sessions_select_own_bay_or_head"
  ON public.test_sessions
  FOR SELECT
  TO authenticated
  USING (
    public.is_head()
    OR public.is_admin()
    OR bay_id = public.current_user_bay_id()
    OR profile_id = auth.uid()
  );

DROP POLICY IF EXISTS "test_sessions_insert_tester" ON public.test_sessions;
CREATE POLICY "test_sessions_insert_tester"
  ON public.test_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    profile_id = auth.uid()
    AND bay_id = public.current_user_bay_id()
    AND NOT public.is_head()
  );

DROP POLICY IF EXISTS "test_sessions_insert_head" ON public.test_sessions;
CREATE POLICY "test_sessions_insert_head"
  ON public.test_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_head() OR public.is_admin());

-- Postgres RLS: UPDATE needs SELECT policy (above) + UPDATE policy
DROP POLICY IF EXISTS "test_sessions_update_policy" ON public.test_sessions;
CREATE POLICY "test_sessions_update_policy"
  ON public.test_sessions
  FOR UPDATE
  TO authenticated
  USING (
    public.is_head()
    OR public.is_admin()
    OR (bay_id = public.current_user_bay_id() AND profile_id = auth.uid())
  )
  WITH CHECK (
    public.is_head()
    OR public.is_admin()
    OR (bay_id = public.current_user_bay_id() AND profile_id = auth.uid())
  );
