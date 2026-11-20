-- SENTINEX-CAT — Step 11: head_ops_events (head manual apply / return-to-steady)
-- Run AFTER 05_test_sessions.sql

CREATE TABLE IF NOT EXISTS public.head_ops_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('apply', 'steady')),
  message text NOT NULL,
  setpoints jsonb NOT NULL DEFAULT '{}'::jsonb,
  targets jsonb NOT NULL DEFAULT '[]'::jsonb,
  mode text NOT NULL DEFAULT 'step',
  ramp_seconds integer NOT NULL DEFAULT 5 CHECK (ramp_seconds >= 0),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.head_ops_events IS
  'Head-initiated setpoint commands broadcast to selected tester consoles.';

CREATE INDEX IF NOT EXISTS head_ops_events_created_idx
  ON public.head_ops_events (created_at DESC);

-- Session routing key used in UI threads: head | tester username
CREATE OR REPLACE FUNCTION public.current_session_key()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN role = 'head' THEN 'head'
    ELSE username
  END
  FROM public.profiles
  WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.head_ops_targets_me(targets jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_head()
    OR public.is_admin()
    OR COALESCE(jsonb_array_length(targets), 0) = 0
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(targets) AS t(value)
      WHERE t.value = public.current_session_key()
    );
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.head_ops_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "head_ops_events_select" ON public.head_ops_events;
CREATE POLICY "head_ops_events_select"
  ON public.head_ops_events
  FOR SELECT
  TO authenticated
  USING (
    public.is_head()
    OR public.is_admin()
    OR public.head_ops_targets_me(targets)
  );

DROP POLICY IF EXISTS "head_ops_events_insert_head" ON public.head_ops_events;
CREATE POLICY "head_ops_events_insert_head"
  ON public.head_ops_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_head()
    AND created_by = auth.uid()
  );

-- ── Realtime (optional; safe if already added) ───────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.head_ops_events;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
