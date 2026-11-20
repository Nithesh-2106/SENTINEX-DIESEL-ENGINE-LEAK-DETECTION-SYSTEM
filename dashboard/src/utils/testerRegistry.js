import { loadAuthSession } from "../lib/authSession.js";
import { loadJson, saveJson, uid } from "../lib/storage.js";

export const REGISTRY_KEY = "cat_tester_registry";
export const REGISTRY_CHANGE_EVENT = "cat_tester_registry_change";

function notifyRegistryChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(REGISTRY_CHANGE_EVENT));
  }
}

export const BUILTIN_TESTERS = [
  { id: "tester", username: "tester", password: "tester123", displayName: "Tester 1", builtin: true },
  { id: "tester2", username: "tester2", password: "tester2123", displayName: "Tester 2", builtin: true },
  { id: "tester3", username: "tester3", password: "tester3123", displayName: "Tester 3", builtin: true },
];

export const HEAD_ACCOUNT = { id: "head", username: "head", password: "head123", displayName: "Test Head" };

export function isHeadRole(role) {
  return role === "head";
}

export function isTesterRole(role) {
  return Boolean(role) && role !== "head";
}

export function loadTesterRegistry() {
  const custom = loadJson(REGISTRY_KEY, []);
  const arr = Array.isArray(custom) ? custom : [];
  const overlays = new Map(arr.filter((t) => t.builtin && t.overlay).map((t) => [t.id, t]));
  const builtins = BUILTIN_TESTERS.map((t) => {
    const ov = overlays.get(t.id);
    if (!ov) return t;
    return {
      ...t,
      displayName: ov.displayName || t.displayName,
      username: ov.username || t.username,
      password: ov.password || t.password,
    };
  });
  const customOnly = arr.filter((t) => !t.builtin);
  return [...builtins, ...customOnly];
}

export function saveCustomTesters(custom) {
  saveJson(REGISTRY_KEY, custom);
}

export function findAccountByUsername(username) {
  const u = (username || "").trim().toLowerCase();
  if (HEAD_ACCOUNT.username === u) return { ...HEAD_ACCOUNT, role: "head" };
  const hit = loadTesterRegistry().find((t) => t.username.toLowerCase() === u);
  if (!hit) return null;
  return { ...hit, role: hit.id };
}

export function validateLogin(username, password) {
  const account = findAccountByUsername(username);
  if (!account || account.password !== password) return null;
  return account;
}

export function getTesterDisplayName(role, registry = null) {
  if (!role) return "—";
  const session = loadAuthSession();
  if (session?.sessionKey === role) return session.displayName || role;
  if (isHeadRole(role)) return session?.displayName || HEAD_ACCOUNT.displayName;
  const list = registry || loadTesterRegistry();
  const hit = list.find((t) => t.id === role || t.username === role);
  return hit?.displayName || role;
}

/** Resolve the logged-in tester bay record (built-in or custom). */
export function getTesterAccount(role, registry = null) {
  if (!role || isHeadRole(role)) return null;
  const list = registry || loadTesterRegistry();
  return list.find((t) => t.id === role) || null;
}

/** Shared test cell facility id (all bays). */
export const TEST_CELL_ID = "TC-03";

const BUILTIN_BAY_IDS = {
  tester: "TC-B1",
  tester2: "TC-B2",
  tester3: "TC-B3",
};

/** Per-bay id within the test cell (e.g. TC-B1 for Tester 1). */
export function getTesterBayId(role, registry = null) {
  if (!role || isHeadRole(role)) return null;
  const session = loadAuthSession();
  if (session?.sessionKey === role && session.bayId) return session.bayId;
  const list = registry || loadTesterRegistry();
  const hit = list.find((t) => t.id === role || t.username === role);
  if (hit?.bayId) return hit.bayId;
  if (BUILTIN_BAY_IDS[role]) return BUILTIN_BAY_IDS[role];
  const idx = list.findIndex((t) => t.id === role || t.username === role);
  if (idx >= 0) return `TC-B${idx + 1}`;
  return null;
}

/** Top-bar cell/bay pill — head shows selected bay; testers show their bay id. */
export function getCellPillLabel({ role, viewingTester = null } = {}) {
  if (isHeadRole(role)) {
    if (viewingTester) {
      const bay = getTesterBayId(viewingTester);
      return bay ? `BAY ${bay}` : `CELL ${TEST_CELL_ID}`;
    }
    return `CELL ${TEST_CELL_ID}`;
  }
  const bay = getTesterBayId(role);
  return bay ? `BAY ${bay}` : `CELL ${TEST_CELL_ID}`;
}

function isUsernameTaken(username, exceptId = null) {
  const u = String(username || "").trim().toLowerCase();
  if (!u) return false;
  return loadTesterRegistry().some((t) => t.id !== exceptId && t.username.toLowerCase() === u);
}

export function addTester(displayNameOrPayload, usernameInput = null, passwordInput = null) {
  const payload = typeof displayNameOrPayload === "object" && displayNameOrPayload !== null
    ? displayNameOrPayload
    : {
        displayName: displayNameOrPayload,
        username: usernameInput,
        password: passwordInput,
      };
  const name = (payload.displayName || "").trim();
  if (!name) return { error: "Name is required" };

  const custom = loadJson(REGISTRY_KEY, []);
  const arr = Array.isArray(custom) ? custom : [];
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "tester";
  let id = `tester_${slug}`;
  let n = 2;
  const allIds = new Set([...BUILTIN_TESTERS.map((t) => t.id), ...arr.map((t) => t.id)]);
  while (allIds.has(id)) {
    id = `tester_${slug}_${n}`;
    n += 1;
  }

  const username = String(payload.username || "").trim().toLowerCase();
  if (!username) return { error: "Username is required." };
  if (isUsernameTaken(username)) return { error: "Username already exists." };

  const password = String(payload.password || "").trim();
  if (!password) return { error: "Password is required." };

  const entry = {
    id,
    username,
    password,
    displayName: name,
    builtin: false,
    createdAt: Date.now(),
  };
  const next = [...arr, entry];
  saveCustomTesters(next);
  notifyRegistryChange();
  return { tester: entry };
}

export function removeCustomTester(id) {
  if (BUILTIN_TESTERS.some((t) => t.id === id)) {
    return { error: "Built-in tester bays cannot be deleted." };
  }
  const custom = loadJson(REGISTRY_KEY, []);
  const arr = Array.isArray(custom) ? custom : [];
  const next = arr.filter((t) => t.id !== id);
  if (next.length === arr.length) {
    return { error: "Tester not found in registry." };
  }
  saveCustomTesters(next);
  notifyRegistryChange();
  return { ok: true };
}

/** Head-only: rename a tester bay display label (built-in or custom). */
export function updateTesterDisplayNameByHead(id, displayName) {
  const name = (displayName || "").trim();
  if (!name) return { error: "Display name is required." };

  const isBuiltin = BUILTIN_TESTERS.some((t) => t.id === id);
  const custom = loadJson(REGISTRY_KEY, []);
  const arr = Array.isArray(custom) ? custom : [];

  if (isBuiltin) {
    const base = BUILTIN_TESTERS.find((t) => t.id === id);
    const overlayIdx = arr.findIndex((t) => t.id === id && t.builtin);
    let next;
    if (overlayIdx >= 0) {
      next = [...arr];
      next[overlayIdx] = { ...next[overlayIdx], displayName: name };
    } else {
      next = [
        ...arr,
        {
          id,
          displayName: name,
          username: base.username,
          password: base.password,
          builtin: true,
          overlay: true,
        },
      ];
    }
    saveCustomTesters(next);
    notifyRegistryChange();
    return { tester: loadTesterRegistry().find((t) => t.id === id) };
  }

  const idx = arr.findIndex((t) => t.id === id);
  if (idx < 0) return { error: "Tester not found." };
  const next = [...arr];
  next[idx] = { ...next[idx], displayName: name };
  saveCustomTesters(next);
  notifyRegistryChange();
  return { tester: next[idx] };
}

/** Tester self-service: update login username/password (not display name). */
export function updateTesterCredentialsByTester(role, { username, password, currentPassword } = {}) {
  if (!role || isHeadRole(role)) return { error: "Invalid tester role." };

  const current = loadTesterRegistry().find((t) => t.id === role);
  if (!current) return { error: "Tester account not found." };

  const curPass = String(currentPassword ?? "").trim();
  if (!curPass || current.password !== curPass) {
    return { error: "Current password is incorrect." };
  }

  const nextUsername = String(username ?? current.username).trim().toLowerCase();
  const nextPassword = String(password ?? current.password).trim();
  if (!nextUsername) return { error: "Username is required." };
  if (!nextPassword) return { error: "Password is required." };
  if (isUsernameTaken(nextUsername, role)) return { error: "Username already exists." };

  const isBuiltin = BUILTIN_TESTERS.some((t) => t.id === role);
  const custom = loadJson(REGISTRY_KEY, []);
  const arr = Array.isArray(custom) ? custom : [];

  if (isBuiltin) {
    const base = BUILTIN_TESTERS.find((t) => t.id === role);
    const overlayIdx = arr.findIndex((t) => t.id === role && t.builtin);
    const overlay = overlayIdx >= 0 ? arr[overlayIdx] : null;
    const entry = {
      id: role,
      displayName: overlay?.displayName || base.displayName,
      username: nextUsername,
      password: nextPassword,
      builtin: true,
      overlay: true,
    };
    const next = overlayIdx >= 0
      ? arr.map((t, i) => (i === overlayIdx ? { ...t, username: nextUsername, password: nextPassword } : t))
      : [...arr, entry];
    saveCustomTesters(next);
  } else {
    const idx = arr.findIndex((t) => t.id === role);
    if (idx < 0) return { error: "Tester not found in registry." };
    const next = [...arr];
    next[idx] = { ...next[idx], username: nextUsername, password: nextPassword };
    saveCustomTesters(next);
  }

  notifyRegistryChange();
  return { tester: loadTesterRegistry().find((t) => t.id === role) };
}

export function defaultOpsReadAt() {
  const map = { head: 0 };
  loadTesterRegistry().forEach((t) => { map[t.id] = 0; });
  return map;
}

export function defaultMessagesReadAt() {
  return defaultOpsReadAt();
}

export function activityId() {
  return uid("act");
}
