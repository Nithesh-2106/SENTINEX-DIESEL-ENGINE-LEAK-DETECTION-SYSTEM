-- SENTINEX-CAT — Step 14: Cell Board cross-bay read access
-- Testers need to read every bay_live_state row for the Cell Community Dashboard.
-- Writes remain restricted to each tester's own bay (existing insert/update policies).

DROP POLICY IF EXISTS "bay_live_state_select" ON public.bay_live_state;

CREATE POLICY "bay_live_state_select"
  ON public.bay_live_state
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);
