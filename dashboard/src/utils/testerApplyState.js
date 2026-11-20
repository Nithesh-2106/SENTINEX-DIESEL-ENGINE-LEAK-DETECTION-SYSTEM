import { loadJson, saveJson } from "../lib/storage.js";

const APPLIED_REQUESTS_KEY = "cat_applied_request_ids";
const APPLIED_HEAD_OPS_KEY = "cat_applied_head_ops_ids";

export function loadAppliedRequestIds(role) {
  if (!role) return new Set();
  const map = loadJson(APPLIED_REQUESTS_KEY, {});
  const arr = map[role];
  return new Set(Array.isArray(arr) ? arr : []);
}

export function markAppliedRequestId(role, id) {
  if (!role || !id) return;
  const map = loadJson(APPLIED_REQUESTS_KEY, {});
  const prev = Array.isArray(map[role]) ? map[role] : [];
  map[role] = [...prev, id].slice(-80);
  saveJson(APPLIED_REQUESTS_KEY, map);
}

export function loadAppliedHeadOpsIds(role) {
  if (!role) return new Set();
  const map = loadJson(APPLIED_HEAD_OPS_KEY, {});
  const arr = map[role];
  return new Set(Array.isArray(arr) ? arr : []);
}

export function markAppliedHeadOpsId(role, id) {
  if (!role || !id) return;
  const map = loadJson(APPLIED_HEAD_OPS_KEY, {});
  const prev = Array.isArray(map[role]) ? map[role] : [];
  map[role] = [...prev, id].slice(-80);
  saveJson(APPLIED_HEAD_OPS_KEY, map);
}
