-- Run this ONCE if you already seeded the old head@sentinex.cat account.
-- Then create the new Auth user in Dashboard (see 04_seed_head.sql) and run 04_seed_head.sql.

-- Remove old profile if linked to wrong email (safe if no sessions yet)
DELETE FROM public.profiles
WHERE username IN ('head', 'CAT_test_head');

-- Optional: delete old Auth user in Dashboard → Authentication → Users manually
