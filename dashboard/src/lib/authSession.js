const SESSION_KEY = "sentinex_auth_session";
export const AUTH_SESSION_CHANGE_EVENT = "sentinex-auth-session-change";

/** @typedef {{ userId: string, username: string, displayName: string, role: 'head'|'tester'|'admin', bayId: string|null, sessionKey: string }} AuthSession */

/** App routing key: head → 'head'; testers → username */
export function profileToSessionKey(profile) {
  if (!profile) return null;
  if (profile.role === "head") return "head";
  return profile.username;
}

/** @param {Record<string, unknown>} row profiles table row */
export function profileRowToSession(row) {
  if (!row?.id) return null;
  const role = row.role;
  return {
    userId: row.id,
    username: row.username,
    displayName: row.display_name,
    role,
    bayId: row.bay_id ?? null,
    sessionKey: role === "head" ? "head" : row.username,
  };
}

/** @returns {AuthSession|null} */
export function loadAuthSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** @param {AuthSession|null} session */
export function saveAuthSession(session) {
  try {
    if (!session) sessionStorage.removeItem(SESSION_KEY);
    else sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_SESSION_CHANGE_EVENT, { detail: session }));
  }
}

export function getAppRole() {
  return loadAuthSession()?.sessionKey ?? null;
}

export function isHeadSession() {
  return loadAuthSession()?.role === "head";
}

export function clearAuthSession() {
  saveAuthSession(null);
}
