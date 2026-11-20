import { usernameToAuthEmail } from "./authEmail.js";
import { profileRowToSession, saveAuthSession } from "./authSession.js";
import { supabase, isSupabaseConfigured } from "./supabaseClient.js";

export async function signInWithUsername(username, password) {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY." };
  }

  const email = usernameToAuthEmail(username);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) {
    return { error: "Invalid username or password." };
  }

  const userId = authData.user?.id;
  if (!userId) {
    return { error: "Login failed — no user id." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, username, role, bay_id, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    return { error: "Profile not found for this account." };
  }

  if (profile.is_active === false) {
    await supabase.auth.signOut();
    return { error: "This account has been deactivated." };
  }

  const session = profileRowToSession(profile);
  saveAuthSession(session);
  return { session };
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    await supabase.auth.signOut();
  }
  saveAuthSession(null);
}

export async function getAccessToken() {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
