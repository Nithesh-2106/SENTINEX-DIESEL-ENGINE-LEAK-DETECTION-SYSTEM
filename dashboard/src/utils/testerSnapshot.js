import { loadJson, saveJson } from "../lib/storage.js";
import { SCENARIO_LABELS } from "../simulator.js";
import { getTesterDisplayName } from "./testerRegistry.js";
import { loadTesterSession, saveTesterSession, updatePresence } from "./testerPresence.js";
import { notifySnapshotStore, touchSnapshotIndex } from "./testerSnapshotStore.js";

export const SNAPSHOT_PREFIX = "cat_tester_snapshot_";
export const SYNC_CHANNEL = "cat-tester-sync";
const LEAN_CHART_POINTS = 12;
const LEAN_RECENT_READINGS = 5;

let broadcastChannel = null;

function getBroadcastChannel() {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel(SYNC_CHANNEL);
  }
  return broadcastChannel;
}

function broadcastSnapshotUpdate(role, updatedAt) {
  try {
    getBroadcastChannel()?.postMessage({ type: "snapshot", role, updatedAt });
  } catch {
    // BroadcastChannel unavailable — storage event + poll still apply
  }
}

export function snapshotKey(role) {
  return `${SNAPSHOT_PREFIX}${role}`;
}

function leanSnapshot(role, snapshot) {
  return {
    role,
    displayName: snapshot.displayName || getTesterDisplayName(role),
    updatedAt: Date.now(),
    offline: Boolean(snapshot.offline),
    activeTab: snapshot.activeTab || "dashboard",
    activeEngine: snapshot.activeEngine,
    currentScenario: snapshot.currentScenario,
    isStreaming: snapshot.isStreaming,
    readingCount: snapshot.readingCount,
    leakActive: snapshot.leakActive,
    sensorFaultActive: snapshot.sensorFaultActive,
    latestPrediction: snapshot.latestPrediction,
    latestReading: snapshot.latestReading,
    latestRca: snapshot.latestRca,
    latestMultiRca: snapshot.latestMultiRca || [],
    opRpm: snapshot.opRpm,
    opLoad: snapshot.opLoad,
    opAmbientPressure: snapshot.opAmbientPressure,
    spRpm: snapshot.spRpm,
    spLoad: snapshot.spLoad,
    spAmbient: snapshot.spAmbient,
    leakStartMs: snapshot.leakStartMs,
    leakAtReadingNo: snapshot.leakAtReadingNo,
    apiOnline: snapshot.apiOnline,
    pipelineStats: snapshot.pipelineStats,
    engineBaselines: snapshot.engineBaselines,
    chartBuffer: (snapshot.chartBuffer || []).slice(-LEAN_CHART_POINTS),
    recentReadings: (snapshot.recentReadings || []).slice(-LEAN_RECENT_READINGS),
  };
}

export function publishTesterSnapshot(role, snapshot) {
  if (!role) return;
  const payload = {
    ...snapshot,
    role,
    displayName: snapshot.displayName || getTesterDisplayName(role),
    updatedAt: Date.now(),
    chartBuffer: (snapshot.chartBuffer || []).slice(-LEAN_CHART_POINTS),
    recentReadings: (snapshot.recentReadings || []).slice(-LEAN_RECENT_READINGS),
  };
  const saved = saveJson(snapshotKey(role), payload);
  if (!saved) {
    const lean = leanSnapshot(role, snapshot);
    saveJson(snapshotKey(role), lean);
    touchSnapshotIndex(role, lean.updatedAt);
  } else {
    touchSnapshotIndex(role, payload.updatedAt);
  }
  broadcastSnapshotUpdate(role, payload.updatedAt);
  notifySnapshotStore();
  window.dispatchEvent(new CustomEvent("cat-tester-snapshot", { detail: { role, updatedAt: payload.updatedAt } }));

  if (!snapshot.offline) {
    const scenarioLabel = SCENARIO_LABELS[snapshot.currentScenario] || snapshot.currentScenario || "Normal";
    const sensorFault = Boolean(snapshot.sensorFaultActive);
    updatePresence(role, {
      displayName: payload.displayName,
      activeTab: snapshot.activeTab || "dashboard",
      engine: snapshot.activeEngine,
      scenario: snapshot.currentScenario,
      isStreaming: snapshot.isStreaming,
      readingCount: snapshot.readingCount,
      leakDetected: snapshot.leakActive,
      sensorFaultDetected: sensorFault,
      opRpm: snapshot.opRpm,
      opLoad: snapshot.opLoad,
      spRpm: snapshot.spRpm,
      spLoad: snapshot.spLoad,
      spAmbient: snapshot.spAmbient,
      confidence: snapshot.latestPrediction?.Confidence_Score,
      statusLabel: snapshot.isStreaming
        ? (sensorFault
          ? `LIVE · ${scenarioLabel} · sensor fault`
          : snapshot.leakActive
            ? `LIVE · ${scenarioLabel} · leak`
            : `LIVE · ${scenarioLabel}`)
        : `Ready · ${scenarioLabel}`,
    }, payload.displayName);
  }
}

/** Publish an offline snapshot so head console stops mirroring immediately. */
export function publishOfflineSnapshot(role) {
  if (!role) return;
  const payload = {
    role,
    displayName: getTesterDisplayName(role),
    updatedAt: Date.now(),
    offline: true,
    isStreaming: false,
    readingCount: 0,
    latestReading: null,
    latestPrediction: null,
    latestRca: null,
    leakActive: false,
    chartBuffer: [],
    recentReadings: [],
  };
  saveJson(snapshotKey(role), leanSnapshot(role, payload));
  touchSnapshotIndex(role, payload.updatedAt);
  broadcastSnapshotUpdate(role, payload.updatedAt);
  notifySnapshotStore();
  window.dispatchEvent(new CustomEvent("cat-tester-snapshot", { detail: { role, updatedAt: payload.updatedAt } }));
}

export function loadTesterSnapshot(role) {
  if (!role) return null;
  return loadJson(snapshotKey(role), null);
}

export function loadAllTesterSnapshots(registry = []) {
  const map = {};
  registry.forEach((t) => {
    map[t.id] = loadTesterSnapshot(t.id);
  });
  return map;
}

export function isSnapshotFresh(snapshot, maxAgeMs = 20000) {
  if (!snapshot?.updatedAt) return false;
  return Date.now() - snapshot.updatedAt < maxAgeMs;
}

/**
 * Push setpoint changes into a tester snapshot so head / cell board views
 * stay in sync even when that tester tab is not open.
 */
export function applySetpointsToTesterSnapshot(role, to, { mode = "step", rampSeconds = 5 } = {}) {
  if (!role || !to) return;

  const existing = loadTesterSnapshot(role) || {};
  const curOpRpm = Number(existing.opRpm ?? existing.spRpm ?? 1800);
  const curOpLoad = Number(existing.opLoad ?? existing.spLoad ?? 75);
  const curOpP = Number(existing.opAmbientPressure ?? existing.spAmbient ?? 101.3);

  let opRpm = to.rpm;
  let opLoad = to.load;
  let opP = to.p;

  if (mode === "ramp") {
    const alpha = Math.min(0.45, 3 / Math.max(rampSeconds, 2));
    opRpm = curOpRpm + (to.rpm - curOpRpm) * alpha;
    opLoad = curOpLoad + (to.load - curOpLoad) * alpha;
    opP = curOpP + (to.p - curOpP) * alpha;
  }

  const payload = {
    ...existing,
    role,
    displayName: existing.displayName || getTesterDisplayName(role),
    spRpm: to.rpm,
    spLoad: to.load,
    spAmbient: to.p,
    opRpm,
    opLoad,
    opAmbientPressure: opP,
    targetRpm: to.rpm,
    targetLoad: to.load,
    targetAmbientPressure: to.p,
    updatedAt: Date.now(),
  };

  const saved = saveJson(snapshotKey(role), {
    ...payload,
    chartBuffer: (existing.chartBuffer || []).slice(-LEAN_CHART_POINTS),
    recentReadings: (existing.recentReadings || []).slice(-LEAN_RECENT_READINGS),
  });
  if (!saved) {
    saveJson(snapshotKey(role), leanSnapshot(role, payload));
  }
  touchSnapshotIndex(role, payload.updatedAt);
  window.dispatchEvent(new CustomEvent("cat-tester-snapshot", { detail: { role, updatedAt: payload.updatedAt } }));
  broadcastSnapshotUpdate(role, payload.updatedAt);
  notifySnapshotStore();

  const scenarioLabel = SCENARIO_LABELS[payload.currentScenario] || payload.currentScenario || "Normal";
  updatePresence(role, {
    displayName: payload.displayName,
    activeTab: payload.activeTab || "dashboard",
    engine: payload.activeEngine,
    scenario: payload.currentScenario,
    isStreaming: payload.isStreaming,
    readingCount: payload.readingCount,
    leakDetected: payload.leakActive,
    opRpm,
    opLoad,
    spRpm: to.rpm,
    spLoad: to.load,
    spAmbient: to.p,
    confidence: payload.latestPrediction?.Confidence_Score,
    statusLabel: payload.isStreaming
      ? (payload.leakActive ? `LIVE · ${scenarioLabel} · leak` : `LIVE · ${scenarioLabel}`)
      : `Ready · ${scenarioLabel}`,
  }, payload.displayName);

  const sess = loadTesterSession(role) || {};
  saveTesterSession(role, {
    ...sess,
    targetRpm: to.rpm,
    targetLoad: to.load,
    targetAmbientPressure: to.p,
    spRpm: to.rpm,
    spLoad: to.load,
    spAmbient: to.p,
    opRpm,
    opLoad,
    opAmbientPressure: opP,
    updatedAt: Date.now(),
  });
}
