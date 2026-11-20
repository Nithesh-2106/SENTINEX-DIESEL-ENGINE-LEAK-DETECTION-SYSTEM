import { useSyncExternalStore } from "react";
import { loadTesterRegistry } from "./testerRegistry.js";
import {
  SNAPSHOT_PREFIX,
  SYNC_CHANNEL,
  loadAllTesterSnapshots,
} from "./testerSnapshot.js";

export const SNAPSHOT_INDEX_KEY = "cat_snapshot_index";
export { SNAPSHOT_LIVE_MS, isSnapshotFresh } from "./cellSyncCore.js";

let syncChannel = null;
let cachedSnapshots = {};
let cachedRevision = "";
let emitTimer = null;

function getSyncChannel() {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!syncChannel) {
    syncChannel = new BroadcastChannel(SYNC_CHANNEL);
  }
  return syncChannel;
}

export function loadSnapshotIndex() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_INDEX_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function touchSnapshotIndex(role, updatedAt = Date.now()) {
  try {
    const prev = loadSnapshotIndex();
    localStorage.setItem(
      SNAPSHOT_INDEX_KEY,
      JSON.stringify({ ...prev, [role]: updatedAt }),
    );
  } catch {
    // ignore quota errors
  }
}

/** Lightweight revision — index only, no full snapshot parse per tick. */
export function buildSnapshotRevision(registry = loadTesterRegistry()) {
  const index = loadSnapshotIndex();
  return registry.map((t) => `${t.id}:${index[t.id] ?? 0}`).join("|");
}

export function readAllSnapshots() {
  const rev = buildSnapshotRevision();
  if (rev === cachedRevision) return cachedSnapshots;
  cachedRevision = rev;
  cachedSnapshots = loadAllTesterSnapshots(loadTesterRegistry());
  return cachedSnapshots;
}

function invalidateCache() {
  cachedRevision = "";
}

const listeners = new Set();

function emitChange() {
  if (emitTimer) return;
  emitTimer = window.setTimeout(() => {
    emitTimer = null;
    invalidateCache();
    listeners.forEach((fn) => fn());
  }, 150);
}

export function notifySnapshotStore() {
  emitChange();
}

function subscribe(onStoreChange) {
  listeners.add(onStoreChange);

  const onStorage = (e) => {
    if (
      e.key?.startsWith(SNAPSHOT_PREFIX) ||
      e.key === SNAPSHOT_INDEX_KEY ||
      e.key === "cat_tester_presence"
    ) {
      onStoreChange();
    }
  };

  const onSnap = () => onStoreChange();
  const onVisibility = () => {
    if (document.visibilityState === "visible") onStoreChange();
  };

  const channel = getSyncChannel();
  const onMessage = (ev) => {
    if (ev.data?.type === "snapshot") onStoreChange();
  };
  channel?.addEventListener("message", onMessage);

  window.addEventListener("storage", onStorage);
  window.addEventListener("cat-tester-snapshot", onSnap);
  window.addEventListener("cat-presence-updated", onSnap);
  window.addEventListener("focus", onSnap);
  document.addEventListener("visibilitychange", onVisibility);

  // Fallback poll — events handle live updates; slow poll catches edge cases.
  const poll = window.setInterval(onStoreChange, 1200);

  return () => {
    listeners.delete(onStoreChange);
    clearInterval(poll);
    if (emitTimer) {
      clearTimeout(emitTimer);
      emitTimer = null;
    }
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("cat-tester-snapshot", onSnap);
    window.removeEventListener("cat-presence-updated", onSnap);
    window.removeEventListener("focus", onSnap);
    document.removeEventListener("visibilitychange", onVisibility);
    channel?.removeEventListener("message", onMessage);
  };
}

/** React hook — reads localStorage snapshots with reliable cross-tab invalidation. */
export function useTesterSnapshotStore(enabled = true) {
  return useSyncExternalStore(
    enabled ? subscribe : () => () => {},
    readAllSnapshots,
    readAllSnapshots,
  );
}
