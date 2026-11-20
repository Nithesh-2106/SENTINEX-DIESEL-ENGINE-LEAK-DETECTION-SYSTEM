-- SENTINEX-CAT — Step 8: bay_live_state (head dashboard + Realtime)
-- Run AFTER 05_test_sessions.sql

CREATE TABLE IF NOT EXISTS public.bay_live_state (
  bay_id text PRIMARY KEY REFERENCES public.bays (id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  session_id text REFERENCES public.test_sessions (id) ON DELETE SET NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.bay_live_state IS
  'Latest live snapshot per bay for head mirroring. Enable Realtime on this table in Dashboard.';

-- Auto-create live_state row when a new bay is created (dynamic testers)
CREATE OR REPLACE FUNCTION public.bays_create_live_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.bay_live_state (bay_id, snapshot)
  VALUES (NEW.id, '{}'::jsonb)
  ON CONFLICT (bay_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bays_create_live_state_after_insert ON public.bays;
CREATE TRIGGER bays_create_live_state_after_insert
  AFTER INSERT ON public.bays
  FOR EACH ROW
  EXECUTE FUNCTION public.bays_create_live_state();

-- Backfill any bays that already exist without live_state
INSERT INTO public.bay_live_state (bay_id, snapshot)
SELECT b.id, '{}'::jsonb
FROM public.bays b
WHERE NOT EXISTS (
  SELECT 1 FROM public.bay_live_state bls WHERE bls.bay_id = b.id
);

DROP TRIGGER IF EXISTS bay_live_state_set_updated_at ON public.bay_live_state;
CREATE TRIGGER bay_live_state_set_updated_at
  BEFORE UPDATE ON public.bay_live_state
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.bay_live_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bay_live_state_select" ON public.bay_live_state;
CREATE POLICY "bay_live_state_select"
  ON public.bay_live_state
  FOR SELECT
  TO authenticated
  USING (
    public.is_head()
    OR public.is_admin()
    OR bay_id = public.current_user_bay_id()
  );

DROP POLICY IF EXISTS "bay_live_state_upsert_tester" ON public.bay_live_state;
CREATE POLICY "bay_live_state_update_tester"
  ON public.bay_live_state
  FOR UPDATE
  TO authenticated
  USING (bay_id = public.current_user_bay_id())
  WITH CHECK (
    bay_id = public.current_user_bay_id()
    AND profile_id = auth.uid()
  );

DROP POLICY IF EXISTS "bay_live_state_insert_tester" ON public.bay_live_state;
CREATE POLICY "bay_live_state_insert_tester"
  ON public.bay_live_state
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bay_id = public.current_user_bay_id()
    AND profile_id = auth.uid()
  );

-- ── Enable Realtime (run once; skip if already added) ─────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bay_live_state;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
