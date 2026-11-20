import { loadJson, saveJson } from "../lib/storage.js";
import { insertAuditEvent } from "../lib/supabaseAudit.js";
import { SCENARIO_LABELS } from "../simulator.js";
import { activityId } from "./testerRegistry.js";
import {
  decayStaleSnapshot,
  isMirrorLive,
  isSnapshotFresh,
  isSnapshotOnline,
  isSnapshotUsable,
  PRESENCE_STALE_MS,
  SNAPSHOT_LIVE_MS,
} from "./cellSyncCore.js";

export {
  decayStaleSnapshot,
  isMirrorLive,
  isSnapshotOnline,
  isSnapshotUsable,
  PRESENCE_STALE_MS,
  SNAPSHOT_LIVE_MS,
};

export const PRESENCE_KEY = "cat_tester_presence";
export const ACTIVITIES_KEY = "cat_cell_activities";
export const SESSION_PREFIX = "cat_tester_session_";

const STALE_MS = PRESENCE_STALE_MS;
const SNAPSHOT_SESSION_MS = 300000;

export function loadPresenceMap() {
  return loadJson(PRESENCE_KEY, {});
}

export function savePresenceMap(map) {
  saveJson(PRESENCE_KEY, map);
}

export function updatePresence(role, patch, registryName) {
  if (!role) return;
  const map = loadPresenceMap();
  const prev = map[role] || {};
  map[role] = {
    ...prev,
    role,
    displayName: registryName || prev.displayName || role,
    updatedAt: Date.now(),
    ...patch,
  };
  savePresenceMap(map);
  window.dispatchEvent(new CustomEvent("cat-presence-updated", { detail: map[role] }));
}

export function clearPresence(role) {
  if (!role) return;
  const map = loadPresenceMap();
  delete map[role];
  savePresenceMap(map);
  window.dispatchEvent(new CustomEvent("cat-presence-updated", { detail: { role, cleared: true } }));
}

export function getLiveTesters(registry = []) {
  const map = loadPresenceMap();
  const now = Date.now();
  return registry
    .map((t) => {
      const p = map[t.id];
      if (!p || now - (p.updatedAt || 0) > STALE_MS) return null;
      return { ...t, presence: p };
    })
    .filter(Boolean);
}

export function logCellActivity({ role, displayName, type, message, meta = {} }) {
  const item = {
    id: activityId(),
    ts: Date.now(),
    role,
    displayName: displayName || role,
    type,
    message,
    meta,
  };
  void insertAuditEvent({
    type,
    message,
    meta: { ...meta, displayName: item.displayName },
    role,
  }).then((row) => {
    if (row) {
      window.dispatchEvent(new CustomEvent("cat-cell-activity", { detail: toCellActivityRow(row) }));
    }
  });
  window.dispatchEvent(new CustomEvent("cat-cell-activity", { detail: item }));
  return item;
}

function toCellActivityRow(row) {
  return {
    id: row.id,
    ts: row.ts,
    role: row.role,
    displayName: row.displayName,
    type: row.type,
    message: row.message,
    meta: row.meta,
  };
}

export function loadCellActivities() {
  const raw = loadJson(ACTIVITIES_KEY, []);
  return Array.isArray(raw) ? raw : [];
}

export function loadTesterSession(role) {
  if (!role || role === "head") return null;
  return loadJson(`${SESSION_PREFIX}${role}`, null);
}

export function saveTesterSession(role, session) {
  if (!role || role === "head") return;
  saveJson(`${SESSION_PREFIX}${role}`, session);
}

/** Merge presence heartbeat + dashboard snapshots for accurate online/scenario display. */
export function enrichLiveTesters(liveTesters = [], snapshots = {}) {
  return liveTesters.map((t) => {
    const snap = snapshots[t.id];
    if (snap?.offline) {
      return { ...t, online: false, snap: null };
    }
    const useSnap = Boolean(snap && isSnapshotUsable(snap));
    const p = t.presence;
    const streamingLive = useSnap && snap.isStreaming && isSnapshotFresh(snap, SNAPSHOT_LIVE_MS);
    const online = Boolean(t.online || streamingLive);

    if (!online) {
      return { ...t, online: false, snap: null };
    }

    const scenario = useSnap ? snap.currentScenario : p?.scenario;
    const scenarioLabel = SCENARIO_LABELS[scenario] || scenario || "Normal";
    const engine = useSnap ? snap.activeEngine : p?.engine;
    const isStreaming = useSnap ? snap.isStreaming : p?.isStreaming;
    const readingCount = useSnap ? snap.readingCount : p?.readingCount;
    const leakDetected = useSnap ? snap.leakActive : p?.leakDetected;
    const sensorFaultDetected = useSnap
      ? Boolean(snap.sensorFaultActive || snap.latestPrediction?.Sensor_Fault_Isolation?.is_sensor_fault)
      : Boolean(p?.sensorFaultDetected);
    const activeTab = useSnap ? (snap.activeTab || "dashboard") : p?.activeTab;

    let statusLabel = p?.statusLabel;
    if (useSnap) {
      statusLabel = snap.isStreaming
        ? (sensorFaultDetected
          ? `LIVE · ${scenarioLabel} · sensor fault`
          : snap.leakActive
            ? `LIVE · ${scenarioLabel} · leak active`
            : `LIVE · ${scenarioLabel}`)
        : `Ready · ${scenarioLabel}`;
    } else if (!statusLabel) {
      statusLabel = isStreaming ? `LIVE · ${scenarioLabel}` : `Ready · ${scenarioLabel}`;
    }

    return {
      ...t,
      online: true,
      snap: useSnap ? snap : null,
      presence: {
        ...(p || {}),
        role: t.id,
        displayName: t.displayName,
        engine,
        scenario,
        scenarioLabel,
        isStreaming: Boolean(isStreaming),
        readingCount: readingCount || 0,
        leakDetected: Boolean(leakDetected),
        sensorFaultDetected,
        activeTab: activeTab || "dashboard",
        statusLabel,
        opRpm: useSnap ? snap.opRpm : p?.opRpm,
        opLoad: useSnap ? snap.opLoad : p?.opLoad,
        spRpm: useSnap ? snap.spRpm : p?.spRpm,
        spLoad: useSnap ? snap.spLoad : p?.spLoad,
        spAmbient: useSnap ? snap.spAmbient : p?.spAmbient,
        confidence: useSnap ? snap.latestPrediction?.Confidence_Score : p?.confidence,
      },
    };
  });
}
