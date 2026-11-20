import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    "[SENTINEX] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in dashboard/.env"
  );
}

// sessionStorage keeps auth per browser tab/window so head + tester can run in parallel.
export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: sessionStorage,
          persistSession: true,
        },
      })
    : null;

export function isSupabaseConfigured() {
  return Boolean(supabase);
}
