import {
  ALL_SENSOR_KEYS,
  AIR_PATH_SEQUENCE,
  COMPONENT_SENSOR_MAP,
  SENSOR_DEFINITIONS,
} from "../constants/sensorDefinitions.js";

const C7_EXCLUDED = new Set([
  "Post_SCR_Pressure_kPa",
  "Post_SCR_Temp_C",
]);

/** Matrix groups derived from canonical sensor definitions. */
export function buildSensorGroups() {
  const groups = {};
  for (const compId of AIR_PATH_SEQUENCE) {
    const comp = COMPONENT_SENSOR_MAP[compId];
    if (!comp) continue;
    groups[comp.displayName.toUpperCase()] = comp.sensors.map((s) => s.key);
  }
  return groups;
}

export function buildSensorShortLabels() {
  const labels = {};
  for (const [key, def] of Object.entries(SENSOR_DEFINITIONS)) {
    labels[key] = def.shortLabel;
  }
  return labels;
}

const LEGACY_KEY_MAP = {
  DPF_Differential_Pressure_kPa: "DPF_Delta_Pressure_kPa",
  Tailpipe_Backpressure_kPa: "Tailpipe_BackPressure_kPa",
  Engine_Load_Pct: "Engine_Load_Actual_Pct",
  Fuel_Flow_Rate_lph: "Fuel_Flow_Rate_kgph",
  Oil_Pressure_kPa: "Engine_Oil_Pressure_bar",
  Coolant_Temp_C: "Engine_Coolant_Temp_C",
  Intake_Ambient_Pressure_kPa: "Ambient_Pressure_kPa",
};

function normalizeApiSensors(apiSensors = {}) {
  const out = {};
  for (const [key, val] of Object.entries(apiSensors)) {
    const canonical = LEGACY_KEY_MAP[key] || key;
    if (!out[canonical] || key === canonical) out[canonical] = val;
  }
  return out;
}

function defaultSensorRecord(key, baseline) {
  return {
    status: "OK",
    current_value: baseline,
    baseline,
    current_drift_pct: 0,
    rolling_drift_pct: 0,
    peak_drift_pct: 0,
    fault_count: 0,
    last_fault_type: null,
    calibration_age_days: 0,
    calibration_schedule_days: 14,
    drift_history: [],
    reading_count: 0,
    is_excluded: false,
  };
}

/** Merge API payload with all 42 canonical sensors (C7 excludes SCR). */
export function mergeSensorHealthData(healthData, engineId = "CAT_C13") {
  if (!healthData) return null;

  const merged = { ...healthData, sensors: normalizeApiSensors(healthData.sensors) };
  const counts = { OK: 0, WATCH: 0, FAULT: 0, STALE: 0, LEAK_SIGNAL: 0 };

  for (const key of ALL_SENSOR_KEYS) {
    const excluded = engineId === "CAT_C7" && C7_EXCLUDED.has(key);
    const def = SENSOR_DEFINITIONS[key];
    const baseline = def?.baseline ?? 0;

    if (merged.sensors[key]) {
      merged.sensors[key] = {
        ...defaultSensorRecord(key, merged.sensors[key].baseline ?? baseline),
        ...merged.sensors[key],
        is_excluded: excluded || merged.sensors[key].is_excluded,
      };
    } else {
      merged.sensors[key] = {
        ...defaultSensorRecord(key, baseline),
        is_excluded: excluded,
      };
    }

    if (merged.sensors[key].is_excluded) continue;
    const st = merged.sensors[key].status || "OK";
    if (counts[st] != null) counts[st] += 1;
  }

  const activeTotal = Object.values(merged.sensors).filter((s) => !s.is_excluded).length;
  merged.total_sensors = activeTotal;
  merged.status_counts = counts;
  if (merged.health_score == null) merged.health_score = 100;

  return merged;
}

/** Active sensor count per engine variant. */
export function getActiveSensorCount(engineId) {
  if (engineId === "CAT_C7") return ALL_SENSOR_KEYS.length - C7_EXCLUDED.size;
  return ALL_SENSOR_KEYS.length;
}
