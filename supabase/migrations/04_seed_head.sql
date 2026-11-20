-- SENTINEX-CAT — Step 4: Seed default HEAD (username login, no real email)
-- Run AFTER 03_profiles.sql
--
-- FIRST in Dashboard → Authentication → Users → Add user:
--   Email:    CAT_test_head@sentinex.auth   ← internal only, users never type this
--   Password: head1234
--   ✓ Auto Confirm User
--
-- Turn OFF public sign-up: Authentication → Providers → Email → disable sign up
--
-- Users log in with USERNAME + PASSWORD only:
--   username: CAT_test_head
--   password: head1234

INSERT INTO public.profiles (id, display_name, username, role, created_by)
SELECT
  u.id,
  'Test Head',
  'CAT_test_head',
  'head',
  NULL
FROM auth.users u
WHERE lower(u.email) = lower('CAT_test_head@sentinex.auth')
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  bay_id = NULL,
  created_by = NULL;

SELECT id, display_name, username, role, bay_id FROM public.profiles;
