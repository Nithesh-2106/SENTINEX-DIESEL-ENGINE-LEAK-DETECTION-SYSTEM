-- SENTINEX-CAT — Step 3: profiles
-- Run AFTER 02_bays.sql
--
-- HOW USERS WORK:
--   • Password lives in Supabase Auth (NOT in this table)
--   • This table stores: username, role, bay, display name
--   • ONE head is seeded in step 10 (username: head)
--   • Head adds testers later → each gets bay TC-B1, TC-B2, …

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text NOT NULL,
  username text NOT NULL,
  role text NOT NULL CHECK (role IN ('head', 'tester', 'admin')),
  bay_id text REFERENCES public.bays (id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT profiles_username_unique UNIQUE (username),
  CONSTRAINT profiles_role_bay_check CHECK (
    (role = 'head' AND bay_id IS NULL)
    OR (role = 'tester' AND bay_id IS NOT NULL)
    OR (role = 'admin')
  )
);

-- Only one active head
CREATE UNIQUE INDEX IF NOT EXISTS profiles_one_active_head_idx
  ON public.profiles ((1))
  WHERE role = 'head' AND is_active = true;

CREATE INDEX IF NOT EXISTS profiles_bay_id_idx ON public.profiles (bay_id);
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles (role);

COMMENT ON TABLE public.profiles IS
  'One head (seeded in step 10). Head adds testers. Password is in Auth, not here.';

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── Auto bay for new testers ─────────────────────────────────────────────────
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
  SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_next FROM public.bays;
  v_bay_id := 'TC-B' || v_next;
  INSERT INTO public.bays (id, label, test_cell_id, sort_order)
  VALUES (v_bay_id, 'Bay ' || v_next, p_test_cell_id, v_next);
  RETURN v_bay_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.profiles_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'tester' AND NEW.bay_id IS NULL THEN
    NEW.bay_id := public.allocate_next_bay('TC-03');
  END IF;
  IF NEW.role = 'head' THEN
    NEW.bay_id := NULL;
  END IF;
  IF NEW.role = 'tester' AND NEW.created_by IS NULL AND public.is_head() THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_assign_bay_before_insert ON public.profiles;
DROP TRIGGER IF EXISTS profiles_set_created_by_before_insert ON public.profiles;
DROP TRIGGER IF EXISTS profiles_before_insert ON public.profiles;
CREATE TRIGGER profiles_before_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_before_insert();

-- ── RLS helpers ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.profiles WHERE id = auth.uid(); $$;

CREATE OR REPLACE FUNCTION public.current_user_bay_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT bay_id FROM public.profiles WHERE id = auth.uid(); $$;

CREATE OR REPLACE FUNCTION public.is_head()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'head' AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  );
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own_or_head" ON public.profiles;
CREATE POLICY "profiles_select_own_or_head"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_head() OR public.is_admin());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    AND bay_id IS NOT DISTINCT FROM (SELECT p.bay_id FROM public.profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS "profiles_update_head_admin" ON public.profiles;
CREATE POLICY "profiles_update_head_admin"
  ON public.profiles FOR UPDATE TO authenticated
  USING ((public.is_head() OR public.is_admin()) AND role <> 'head')
  WITH CHECK ((public.is_head() OR public.is_admin()) AND role = 'tester');

DROP POLICY IF EXISTS "profiles_insert_head_creates_tester" ON public.profiles;
CREATE POLICY "profiles_insert_head_creates_tester"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_head() AND role = 'tester' AND created_by = auth.uid());
