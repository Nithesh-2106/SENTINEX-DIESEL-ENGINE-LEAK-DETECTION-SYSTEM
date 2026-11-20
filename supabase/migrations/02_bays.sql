-- SENTINEX-CAT — Step 2: bays table (empty — bays created when testers are added)
-- Run AFTER 01_extensions_and_helpers.sql

CREATE TABLE IF NOT EXISTS public.bays (
  id text PRIMARY KEY,
  label text NOT NULL,
  test_cell_id text NOT NULL DEFAULT 'TC-03',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.bays IS
  'Test cell bays. Rows are created dynamically (TC-B1, TC-B2, …) when tester profiles are added.';

-- No seed rows — start empty.

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.bays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bays_select_authenticated" ON public.bays;
CREATE POLICY "bays_select_authenticated"
  ON public.bays
  FOR SELECT
  TO authenticated
  USING (true);

-- Bays are inserted by allocate_next_bay() (security definer), not by clients directly.
