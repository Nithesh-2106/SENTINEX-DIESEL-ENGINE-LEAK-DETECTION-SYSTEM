-- SENTINEX-CAT — Run NOW (after 02, before 03)
-- Removes static TC-B1/B2/B3 seed and enables dynamic bay creation per tester.
-- Paste whole file → Run once in SQL Editor.

-- 1) Remove pre-seeded demo bays (safe if you have not run step 03+ yet)
DELETE FROM public.bays
WHERE id IN ('TC-B1', 'TC-B2', 'TC-B3');

-- 2) Next helper: create TC-B1, TC-B2, TC-B3… as testers are added
CREATE OR REPLACE FUNCTION public.allocate_next_bay(p_test_cell_id text DEFAULT 'TC-03')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
  v_bay_id text;
BEGIN
  SELECT COALESCE(MAX(sort_order), 0) + 1
  INTO v_next
  FROM public.bays;

  v_bay_id := 'TC-B' || v_next;

  INSERT INTO public.bays (id, label, test_cell_id, sort_order)
  VALUES (v_bay_id, 'Bay ' || v_next, p_test_cell_id, v_next);

  RETURN v_bay_id;
END;
$$;

COMMENT ON TABLE public.bays IS
  'Test cell bays. Created automatically when a tester profile is added (TC-B1, TC-B2, …).';

COMMENT ON FUNCTION public.allocate_next_bay IS
  'Returns new bay id (TC-B{n}). Called by profiles trigger for role=tester.';

-- 3) Verify empty bays table
SELECT COUNT(*) AS bay_count FROM public.bays;
