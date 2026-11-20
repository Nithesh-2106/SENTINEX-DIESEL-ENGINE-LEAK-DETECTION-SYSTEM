-- SENTINEX-CAT — Step 7: change_requests
-- Run AFTER 05_test_sessions.sql

CREATE TABLE IF NOT EXISTS public.change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bay_id text NOT NULL REFERENCES public.bays (id) ON DELETE RESTRICT,
  session_id text REFERENCES public.test_sessions (id) ON DELETE SET NULL,
  requested_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reason text,
  mode text,
  ramp_seconds integer CHECK (ramp_seconds IS NULL OR ramp_seconds >= 0),
  from_setpoints jsonb NOT NULL DEFAULT '{}'::jsonb,
  to_setpoints jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  decided_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.change_requests IS 'Setpoint change approval workflow (tester → head).';

CREATE INDEX IF NOT EXISTS change_requests_bay_status_idx
  ON public.change_requests (bay_id, status);

CREATE INDEX IF NOT EXISTS change_requests_pending_idx
  ON public.change_requests (created_at DESC)
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS change_requests_set_updated_at ON public.change_requests;
CREATE TRIGGER change_requests_set_updated_at
  BEFORE UPDATE ON public.change_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "change_requests_select" ON public.change_requests;
CREATE POLICY "change_requests_select"
  ON public.change_requests
  FOR SELECT
  TO authenticated
  USING (
    public.is_head()
    OR public.is_admin()
    OR bay_id = public.current_user_bay_id()
    OR requested_by = auth.uid()
  );

DROP POLICY IF EXISTS "change_requests_insert_tester" ON public.change_requests;
CREATE POLICY "change_requests_insert_tester"
  ON public.change_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND bay_id = public.current_user_bay_id()
    AND NOT public.is_head()
  );

DROP POLICY IF EXISTS "change_requests_update_head" ON public.change_requests;
CREATE POLICY "change_requests_update_head"
  ON public.change_requests
  FOR UPDATE
  TO authenticated
  USING (public.is_head() OR public.is_admin())
  WITH CHECK (public.is_head() OR public.is_admin());

-- Tester can cancel own pending request
DROP POLICY IF EXISTS "change_requests_update_own_pending" ON public.change_requests;
CREATE POLICY "change_requests_update_own_pending"
  ON public.change_requests
  FOR UPDATE
  TO authenticated
  USING (
    requested_by = auth.uid()
    AND status = 'pending'
  )
  WITH CHECK (
    requested_by = auth.uid()
    AND status IN ('pending', 'rejected')
  );
