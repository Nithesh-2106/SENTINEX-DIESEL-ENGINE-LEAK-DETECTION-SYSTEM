// User preference persistence backed by Supabase Storage with local cache fallback.
import { loadAuthSession } from "./authSession.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

const PREF_CACHE_KEY = "sentinex_user_prefs_cache";
export const PREFS_CHANGED_EVENT = "sentinex-user-prefs-changed";

function readCacheMap() {
  try {
    const raw = localStorage.getItem(PREF_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCacheMap(map) {
  try {
    localStorage.setItem(PREF_CACHE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function cacheKeyForUser(userId) {
  return userId || "anonymous";
}

function emitPrefsChanged(detail) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT, { detail }));
  }
}

export function getCachedUserPreferences(userId = loadAuthSession()?.userId) {
  const map = readCacheMap();
  return map[cacheKeyForUser(userId)] || {};
}

export function getCachedPreference(key, fallback = null, userId = loadAuthSession()?.userId) {
  const prefs = getCachedUserPreferences(userId);
  return prefs[key] ?? fallback;
}

export function setCachedPreference(key, value, userId = loadAuthSession()?.userId) {
  if (!userId || !key) return;
  const map = readCacheMap();
  const cacheKey = cacheKeyForUser(userId);
  map[cacheKey] = {
    ...(map[cacheKey] || {}),
    [key]: value,
    updatedAt: Date.now(),
  };
  writeCacheMap(map);
  emitPrefsChanged({ userId, prefs: map[cacheKey] });
}

function prefsPath(userId) {
  return `preferences/${userId}/prefs.json`;
}

export async function loadUserPreferences() {
  const session = loadAuthSession();
  if (!session?.userId) return getCachedUserPreferences();

  if (!isSupabaseConfigured()) {
    return getCachedUserPreferences(session.userId);
  }

  const path = prefsPath(session.userId);
  const { data, error } = await supabase.storage.from("sentinex-files").download(path);
  if (error) {
    const missing = error.statusCode === "404" || /not found/i.test(error.message || "");
    if (!missing) {
      console.warn("[SENTINEX] prefs download:", error);
    }
    return getCachedUserPreferences(session.userId);
  }

  try {
    const text = await data.text();
    const prefs = text ? JSON.parse(text) : {};
    const map = readCacheMap();
    map[cacheKeyForUser(session.userId)] = {
      ...(prefs || {}),
      updatedAt: Date.now(),
    };
    writeCacheMap(map);
    emitPrefsChanged({ userId: session.userId, prefs: map[cacheKeyForUser(session.userId)] });
    return map[cacheKeyForUser(session.userId)];
  } catch (parseError) {
    console.warn("[SENTINEX] prefs parse:", parseError);
    return getCachedUserPreferences(session.userId);
  }
}

export async function saveUserPreferencesPatch(patch) {
  const session = loadAuthSession();
  if (!session?.userId || !patch || typeof patch !== "object") return null;

  const next = {
    ...getCachedUserPreferences(session.userId),
    ...patch,
    updatedAt: Date.now(),
  };
  const map = readCacheMap();
  map[cacheKeyForUser(session.userId)] = next;
  writeCacheMap(map);
  emitPrefsChanged({ userId: session.userId, prefs: next });

  if (!isSupabaseConfigured()) return next;

  const body = JSON.stringify(next, null, 2);
  const { error } = await supabase.storage.from("sentinex-files").upload(
    prefsPath(session.userId),
    new Blob([body], { type: "application/json" }),
    {
      contentType: "application/json",
      upsert: true,
    },
  );

  if (error) {
    console.warn("[SENTINEX] prefs upload:", error);
  }

  return next;
}
