-- SENTINEX-CAT — Step 10 (optional): Verify schema after all migrations
-- Run AFTER 09_storage_bucket.sql

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'bays',
    'profiles',
    'test_sessions',
    'session_records',
    'change_requests',
    'bay_live_state',
    'head_ops_events',
    'audit_events',
    'chat_messages'
  )
ORDER BY table_name;

SELECT id, label, test_cell_id FROM public.bays ORDER BY sort_order;

SELECT id, name, public FROM storage.buckets WHERE id = 'sentinex-files';

-- Expect 9 tables + 1 storage bucket row above.
