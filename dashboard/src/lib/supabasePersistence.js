import { loadAuthSession } from "./authSession.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

function activeTester() {
  const session = loadAuthSession();
  if (!session?.userId || !session?.bayId || session.role !== "tester") {
    return null;
  }
  return session;
}

export function canPersistToSupabase() {
  return isSupabaseConfigured() && Boolean(activeTester());
}

/** Build full bay_live_state.snapshot payload (mirrors publishTesterSnapshot shape). */
export function buildBayLiveSnapshot(fields) {
  const now = Date.now();
  return {
    role: fields.role,
    sessionKey: fields.role,
    displayName: fields.displayName,
    activeTab: fields.activeTab || "dashboard",
    activeEngine: fields.activeEngine,
    currentScenario: fields.currentScenario,
    faultInjectionActive: Boolean(fields.faultInjectionActive),
    isStreaming: Boolean(fields.isStreaming),
    offline: Boolean(fields.offline),
    readingCount: fields.readingCount ?? 0,
    latestReading: fields.latestReading ?? null,
    latestPrediction: fields.latestPrediction ?? null,
    latestRca: fields.latestRca ?? null,
    latestMultiRca: fields.latestMultiRca ?? [],
    chartBuffer: (fields.chartBuffer || []).slice(-12),
    recentReadings: (fields.recentReadings || []).slice(-5),
    opRpm: fields.opRpm,
    opLoad: fields.opLoad,
    opAmbientPressure: fields.opAmbientPressure,
    spRpm: fields.spRpm,
    spLoad: fields.spLoad,
    spAmbient: fields.spAmbient,
    targetRpm: fields.targetRpm ?? fields.spRpm,
    targetLoad: fields.targetLoad ?? fields.spLoad,
    targetAmbientPressure: fields.targetAmbientPressure ?? fields.spAmbient,
    leakStartMs: fields.leakStartMs ?? null,
    leakAtReadingNo: fields.leakAtReadingNo ?? null,
    leakActive: Boolean(fields.leakActive),
    sensorFaultActive: Boolean(fields.sensorFaultActive),
    engineBaselines: fields.engineBaselines ?? null,
    apiOnline: fields.apiOnline !== false,
    pipelineStats: fields.pipelineStats ?? null,
    sessionId: fields.sessionId ?? null,
    updatedAt: fields.updatedAt ?? now,
    // snake_case aliases (legacy readers)
    scenario_id: fields.currentScenario,
    is_streaming: Boolean(fields.isStreaming),
    leak_present: Boolean(fields.leakActive),
    leak_location: fields.latestPrediction?.Leak_Location ?? null,
    reading_number: fields.readingCount ?? 0,
    setpoints: {
      rpm: fields.spRpm,
      load: fields.spLoad,
      p: fields.spAmbient,
    },
  };
}

let persistTimer = null;
let pendingSnapshot = null;

/** Debounced upsert — avoids hammering Supabase on 1 Hz stream ticks. */
export function queueBayLiveStatePersist(fields) {
  if (!canPersistToSupabase()) return;
  pendingSnapshot = buildBayLiveSnapshot(fields);
  if (persistTimer) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    const snap = pendingSnapshot;
    pendingSnapshot = null;
    if (snap) void updateBayLiveStateInDb(snap);
  }, 700);
}

/** Immediate upsert (logout, stream stop). */
export function flushBayLiveStatePersist(fields) {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
    pendingSnapshot = null;
  }
  if (!canPersistToSupabase()) return;
  void updateBayLiveStateInDb(buildBayLiveSnapshot(fields));
}

/** @param {Record<string, unknown>} log */
export async function startTestSessionInDb(log) {
  const tester = activeTester();
  if (!tester || !log?.sessionId) return;

  const { error } = await supabase.from("test_sessions").insert({
    id: log.sessionId,
    bay_id: tester.bayId,
    profile_id: tester.userId,
    engine_id: log.engineId || "CAT_C13",
    engine_serial: log.engineSerial || null,
    model_id: log.activeModelId || null,
    model_name: log.activeModelName || null,
    model_accuracy: log.activeModelAccuracy ?? null,
    started_at: log.startTime ? new Date(log.startTime).toISOString() : new Date().toISOString(),
    status: "running",
    total_readings: 0,
  });

  if (error) console.warn("[SENTINEX] startTestSession:", error.message);
}

/** @param {Record<string, unknown>} log */
export async function endTestSessionInDb(log) {
  const tester = activeTester();
  if (!tester || !log?.sessionId) return;

  const { error } = await supabase
    .from("test_sessions")
    .update({
      ended_at: log.endTime ? new Date(log.endTime).toISOString() : new Date().toISOString(),
      total_readings: log.totalReadings ?? 0,
      status: "completed",
      summary: {
        leak_event_count: log.leakEvents?.length ?? 0,
        sensor_fault_count: log.sensorFaults?.length ?? 0,
        scenario_count: log.scenarioSegments?.length ?? 0,
      },
    })
    .eq("id", log.sessionId)
    .eq("profile_id", tester.userId);

  if (error) console.warn("[SENTINEX] endTestSession:", error.message);
}

export async function appendSessionRecord({
  sessionId,
  recordType,
  readingNumber = null,
  scenarioId = null,
  payload = {},
}) {
  const tester = activeTester();
  if (!tester || !sessionId) return;

  const { error } = await supabase.from("session_records").insert({
    session_id: sessionId,
    record_type: recordType,
    reading_number: readingNumber,
    scenario_id: scenarioId,
    payload,
  });

  if (error) console.warn("[SENTINEX] session_record:", error.message);
}

export async function updateBayLiveStateInDb(snapshot) {
  const tester = activeTester();
  if (!tester) return;

  const { error } = await supabase.from("bay_live_state").upsert(
    {
      bay_id: tester.bayId,
      profile_id: tester.userId,
      session_id: snapshot.sessionId ?? null,
      snapshot,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "bay_id" }
  );

  if (error) console.warn("[SENTINEX] bay_live_state:", error.message);
}
