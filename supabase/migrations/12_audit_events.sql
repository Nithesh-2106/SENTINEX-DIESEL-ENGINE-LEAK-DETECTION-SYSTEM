-- SENTINEX-CAT — Step 12: audit_events (ops audit trail + cell activity)
-- Run AFTER 03_profiles.sql

CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  bay_id text REFERENCES public.bays (id) ON DELETE SET NULL,
  event_type text NOT NULL,
  message text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.audit_events IS
  'Cross-console audit trail: requests, head apply, login, scenario changes, etc.';

CREATE INDEX IF NOT EXISTS audit_events_created_idx
  ON public.audit_events (created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_bay_created_idx
  ON public.audit_events (bay_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_events_select" ON public.audit_events;
CREATE POLICY "audit_events_select"
  ON public.audit_events
  FOR SELECT
  TO authenticated
  USING (
    public.is_head()
    OR public.is_admin()
    OR profile_id = auth.uid()
    OR bay_id = public.current_user_bay_id()
  );

DROP POLICY IF EXISTS "audit_events_insert" ON public.audit_events;
CREATE POLICY "audit_events_insert"
  ON public.audit_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    profile_id = auth.uid()
    OR public.is_head()
    OR public.is_admin()
  );
