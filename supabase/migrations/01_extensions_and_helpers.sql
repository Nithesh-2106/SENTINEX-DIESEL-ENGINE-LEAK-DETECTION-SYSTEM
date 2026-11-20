-- SENTINEX-CAT — Step 1: Extensions & shared helpers
-- Run this FIRST in Supabase Dashboard → SQL Editor → New query → Run
--
-- Order: 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;
