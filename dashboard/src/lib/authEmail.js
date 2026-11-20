/** Internal Auth email — users log in with username only; never shown in UI. */
const AUTH_EMAIL_DOMAIN = "sentinex.auth";

export function usernameToAuthEmail(username) {
  const u = String(username || "").trim();
  if (!u) return "";
  return `${u}@${AUTH_EMAIL_DOMAIN}`;
}

export function authEmailToUsername(email) {
  const e = String(email || "").trim().toLowerCase();
  const suffix = `@${AUTH_EMAIL_DOMAIN}`;
  if (!e.endsWith(suffix)) return null;
  return e.slice(0, -suffix.length);
}

/** Default seeded head — username + password shown on login screen. */
export const DEFAULT_HEAD_USERNAME = "CAT_test_head";
export const DEFAULT_HEAD_PASSWORD = "head1234";
