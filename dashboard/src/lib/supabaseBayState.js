// Head-side bay mirror loading from public.bay_live_state.
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import { PRESENCE_STALE_MS, SNAPSHOT_LIVE_MS } from "../utils/cellSyncCore.js";
import { isSnapshotFresh } from "../utils/cellSyncCore.js";

function applySnapshotStaleness(snapshot, updatedAt) {
  if (!snapshot) return null;
  if (snapshot.offline) return { ...snapshot, updatedAt };
  const age = updatedAt ? Date.now() - updatedAt : Infinity;
  if (age >= PRESENCE_STALE_MS) {
    return {
      ...snapshot,
      offline: true,
      isStreaming: false,
      is_streaming: false,
      updatedAt,
    };
  }
  if (snapshot.isStreaming && !isSnapshotFresh({ ...snapshot, updatedAt }, SNAPSHOT_LIVE_MS)) {
    return {
      ...snapshot,
      offline: true,
      isStreaming: false,
      is_streaming: false,
      updatedAt,
    };
  }
  return snapshot;
}

function normalizeSnapshot(row) {
  const snapshot = row?.snapshot || {};
  const updatedAt = Math.max(
    row?.updated_at ? new Date(row.updated_at).getTime() : 0,
    snapshot.updatedAt ?? 0,
  );

  const currentScenario =
    snapshot.currentScenario ?? snapshot.scenario_id ?? snapshot.scenario ?? null;
  const isStreaming = Boolean(snapshot.is_streaming ?? snapshot.isStreaming);
  const spRpm =
    snapshot.spRpm ??
    snapshot.targetRpm ??
    snapshot.setpoints?.rpm ??
    null;
  const spLoad =
    snapshot.spLoad ??
    snapshot.targetLoad ??
    snapshot.setpoints?.load ??
    null;
  const spAmbient =
    snapshot.spAmbient ??
    snapshot.targetAmbientPressure ??
    snapshot.setpoints?.p ??
    null;

  return applySnapshotStaleness(
    {
      ...snapshot,
      role: snapshot.role ?? snapshot.sessionKey ?? null,
      bayId: row?.bay_id || snapshot.bayId || null,
      sessionId: row?.session_id || snapshot.sessionId || null,
      profileId: row?.profile_id || snapshot.profileId || null,
      updatedAt: updatedAt || Date.now(),
      offline: Boolean(snapshot.offline),
      activeTab: snapshot.activeTab || "dashboard",
      activeEngine: snapshot.activeEngine ?? snapshot.active_engine ?? snapshot.engine_id ?? null,
      currentScenario,
      faultInjectionActive: Boolean(snapshot.faultInjectionActive ?? snapshot.fault_injection_active),
      isStreaming,
      readingCount: snapshot.reading_number ?? snapshot.readingCount ?? 0,
      leakActive: Boolean(
        snapshot.leak_present ??
          snapshot.leakActive ??
          snapshot.latestPrediction?.Leak_Present === 1,
      ),
      sensorFaultActive: Boolean(
        snapshot.sensorFaultActive ??
          snapshot.sensor_fault_active ??
          snapshot.latestPrediction?.Sensor_Fault_Isolation?.is_sensor_fault,
      ),
      latestPrediction: snapshot.latestPrediction ?? null,
      latestReading: snapshot.latestReading ?? null,
      latestRca: snapshot.latestRca ?? null,
      latestMultiRca: snapshot.latestMultiRca ?? [],
      chartBuffer: snapshot.chartBuffer || [],
      recentReadings: snapshot.recentReadings || [],
      spRpm,
      spLoad,
      spAmbient,
      targetRpm: snapshot.targetRpm ?? spRpm,
      targetLoad: snapshot.targetLoad ?? spLoad,
      targetAmbientPressure: snapshot.targetAmbientPressure ?? spAmbient,
      opRpm: snapshot.opRpm ?? null,
      opLoad: snapshot.opLoad ?? null,
      opAmbientPressure: snapshot.opAmbientPressure ?? null,
      leakStartMs: snapshot.leakStartMs ?? null,
      leakAtReadingNo: snapshot.leakAtReadingNo ?? null,
      apiOnline: snapshot.apiOnline !== false,
      pipelineStats: snapshot.pipelineStats ?? null,
      engineBaselines: snapshot.engineBaselines ?? null,
    },
    updatedAt || Date.now(),
  );
}

function resolveSnapshotRoleKey(row, registry = []) {
  const snapshot = row?.snapshot || {};
  const roleByBayId = new Map(
    (registry || [])
      .filter((tester) => tester?.bayId)
      .map((tester) => [tester.bayId, tester.id]),
  );
  const roleByProfileId = new Map(
    (registry || [])
      .filter((tester) => tester?.userId)
      .map((tester) => [tester.userId, tester.id]),
  );

  return (
    roleByBayId.get(row?.bay_id) ||
    roleByProfileId.get(row?.profile_id) ||
    snapshot.role ||
    snapshot.sessionKey ||
    row?.bay_id
  );
}

export async function fetchBayLiveSnapshots(registry = []) {
  if (!isSupabaseConfigured()) return {};

  const { data, error } = await supabase
    .from("bay_live_state")
    .select("bay_id, profile_id, session_id, snapshot, updated_at");

  if (error) {
    console.warn("[SENTINEX] bay_live_state load:", error);
    return {};
  }

  const map = {};
  (data || []).forEach((row) => {
    if (!row?.bay_id) return;
    const roleKey = resolveSnapshotRoleKey(row, registry);
    if (!roleKey) return;
    map[roleKey] = normalizeSnapshot(row);
  });
  return map;
}
