/**
 * Sensor stream simulator — engine-aware readings with percentage leak deviations.
 */

export const SCENARIO_LABELS = {
  normal: "Normal Operation",
  intake_preturbo: "Intake Leak — Pre Turbo",
  intake_cac: "Intake Leak — Post Turbo / CAC",
  exhaust_preturbine: "Exhaust Leak — Pre Turbine",
  exhaust_postturbine: "Exhaust Leak — Post Turbine",
  egr_leak: "EGR System Leak",
  cac_direct_leak: "CAC Direct Leak",
  minor_intake_leak: "Minor Intake Leak (Early)",
  sensor_fault_demo: "⚡ SFI — Pre-Compressor Fault",
  sensor_fault_exhaust: "⚡ SFI — Exhaust Manifold Fault",
  sensor_fault_egr: "⚡ SFI — EGR Flow Fault",
  sensor_fault_cac: "⚡ SFI — CAC ΔP Fault",
  intake_preturbo_egr: "Multi: Intake Pre-Turbo + EGR",
  intake_postturbo_egr: "Multi: Intake Post-Turbo/CAC + EGR",
  cac_egr_combined: "Multi: CAC Direct + EGR",
  exhaust_post_egr: "Multi: Exhaust Post-Turbine + EGR",
  exhaust_post_intake_pre: "Multi: Exhaust Post + Intake Pre",
  exhaust_post_cac: "Multi: Exhaust Post + CAC Direct",
  minor_intake_egr: "Multi: Minor Intake + EGR",
};

/** All 7 dataset multi-leak combos — merged from single-leak deviation profiles. */
export const MULTI_LEAK_SCENARIOS = [
  {
    id: "intake_preturbo_egr",
    sources: ["intake_preturbo", "egr_leak"],
    combo: "Intake_PreTurbo+EGR_Leak",
  },
  {
    id: "intake_postturbo_egr",
    sources: ["intake_cac", "egr_leak"],
    combo: "Intake_PostTurbo_CAC+EGR_Leak",
  },
  {
    id: "cac_egr_combined",
    sources: ["cac_direct_leak", "egr_leak"],
    combo: "CAC_Direct_Leak+EGR_Leak",
  },
  {
    id: "exhaust_post_egr",
    sources: ["exhaust_postturbine", "egr_leak"],
    combo: "Exhaust_PostTurbine+EGR_Leak",
  },
  {
    id: "exhaust_post_intake_pre",
    sources: ["exhaust_postturbine", "intake_preturbo"],
    combo: "Exhaust_PostTurbine+Intake_PreTurbo",
  },
  {
    id: "exhaust_post_cac",
    sources: ["exhaust_postturbine", "cac_direct_leak"],
    combo: "Exhaust_PostTurbine+CAC_Direct_Leak",
  },
  {
    id: "minor_intake_egr",
    sources: ["minor_intake_leak", "egr_leak"],
    combo: "Minor_Intake_Leak+EGR_Leak",
  },
];

export const MULTI_LEAK_SCENARIO_IDS = new Set(MULTI_LEAK_SCENARIOS.map((s) => s.id));

/** CAT C13 normal — matches src/baseline_contract.py C13_SENSOR_BASELINES. */
const CAT_C13_BASE = {
  Engine_Speed_Setpoint_RPM: 1800.0,
  Engine_Load_Setpoint_Pct: 75.0,
  Engine_Speed_Actual_RPM: 1800.19,
  Engine_Load_Actual_Pct: 75.0,
  Fuel_Flow_Rate_kgph: 42.0,
  Engine_Coolant_Temp_C: 88.0,
  Engine_Oil_Pressure_bar: 4.2,
  Ambient_Temp_C: 32.0,
  Ambient_Pressure_kPa: 101.3,
  Ambient_Humidity_Pct: 68.0,
  Intake_Ambient_Pressure_kPa: 101.3,
  MAF_Sensor_Reading_kgph: 720.0,
  Pre_Compressor_Pressure_kPa: 99.5,
  Pre_Compressor_Temp_C: 38.0,
  Post_Compressor_Pressure_kPa: 218.0,
  Post_Compressor_Temp_C: 167.9,
  Post_CAC_Pressure_kPa: 213.0,
  Post_CAC_Temp_C: 52.0,
  Intake_Manifold_Pressure_kPa: 211.0,
  Intake_Manifold_Temp_C: 55.0,
  Turbocharger_Speed_RPM: 92000.0,
  Boost_Pressure_kPa: 116.7,
  Exhaust_Manifold_Pressure_kPa: 230.0,
  Exhaust_Manifold_Temp_C: 680.0,
  Pre_Turbine_Pressure_kPa: 225.0,
  Pre_Turbine_Temp_C: 670.0,
  Post_Turbine_Pressure_kPa: 112.0,
  Post_Turbine_Temp_C: 480.2,
  Post_DOC_Pressure_kPa: 109.5,
  Post_DOC_Temp_C: 490.0,
  Post_DPF_Pressure_kPa: 106.0,
  Post_DPF_Temp_C: 469.9,
  Post_SCR_Pressure_kPa: 103.5,
  Post_SCR_Temp_C: 420.1,
  Tailpipe_BackPressure_kPa: 102.0,
  EGR_Flow_Rate_kgph: 58.0,
  Intake_Mass_Balance_Error_kgph: 7.4,
  Compressor_Pressure_Ratio: 2.19,
  Turbine_Expansion_Ratio: 2.01,
  CAC_Pressure_Drop_kPa: 5.0,
  DPF_Delta_Pressure_kPa: 3.5,
  Intake_Temp_Rise_Across_CAC_C: -116.0,
};

export const BASELINE_NORMAL = { ...CAT_C13_BASE };

export const ENGINE_BASELINES = {
  CAT_C7: {
    ...CAT_C13_BASE,
    Engine_Speed_Setpoint_RPM: 2000.0,
    Engine_Speed_Actual_RPM: 2000.0,
    Engine_Load_Actual_Pct: 75.0,
    MAF_Sensor_Reading_kgph: 520.0,
    Pre_Compressor_Pressure_kPa: 97.6,
    Post_Compressor_Pressure_kPa: 203.0,
    Post_CAC_Pressure_kPa: 198.3,
    Intake_Manifold_Pressure_kPa: 196.4,
    Boost_Pressure_kPa: 101.7,
    Turbocharger_Speed_RPM: 82000.0,
    Exhaust_Manifold_Pressure_kPa: 214.2,
    Exhaust_Manifold_Temp_C: 640.0,
    Pre_Turbine_Pressure_kPa: 209.5,
    Pre_Turbine_Temp_C: 630.0,
    Post_Turbine_Pressure_kPa: 108.0,
    Post_Turbine_Temp_C: 451.8,
    Post_DOC_Pressure_kPa: 105.6,
    Post_DPF_Pressure_kPa: 102.3,
    Post_SCR_Pressure_kPa: 102.3,
    Post_SCR_Temp_C: 442.0,
    EGR_Flow_Rate_kgph: 40.6,
    Fuel_Flow_Rate_kgph: 30.3,
    Compressor_Pressure_Ratio: 2.08,
    Turbine_Expansion_Ratio: 1.94,
    CAC_Pressure_Drop_kPa: 4.7,
    Intake_Mass_Balance_Error_kgph: 6.2,
  },
  CAT_C13: { ...CAT_C13_BASE },
  CAT_C15: {
    ...CAT_C13_BASE,
    MAF_Sensor_Reading_kgph: 865.0,
    Pre_Compressor_Pressure_kPa: 101.5,
    Post_Compressor_Pressure_kPa: 229.4,
    Post_CAC_Pressure_kPa: 224.1,
    Intake_Manifold_Pressure_kPa: 221.9,
    Boost_Pressure_kPa: 128.1,
    Turbocharger_Speed_RPM: 98000.0,
    Exhaust_Manifold_Pressure_kPa: 242.0,
    Exhaust_Manifold_Temp_C: 710.0,
    Pre_Turbine_Pressure_kPa: 236.7,
    Pre_Turbine_Temp_C: 699.0,
    Post_Turbine_Pressure_kPa: 113.8,
    Post_Turbine_Temp_C: 501.3,
    Post_DOC_Pressure_kPa: 111.3,
    Post_DPF_Pressure_kPa: 107.9,
    Post_SCR_Pressure_kPa: 104.8,
    Post_SCR_Temp_C: 438.6,
    EGR_Flow_Rate_kgph: 71.0,
    Fuel_Flow_Rate_kgph: 50.4,
    Compressor_Pressure_Ratio: 2.26,
    Turbine_Expansion_Ratio: 2.08,
    CAC_Pressure_Drop_kPa: 5.3,
    Intake_Mass_Balance_Error_kgph: 8.9,
  },
};

export const ENGINE_DISPLAY = {
  CAT_C7: "CAT C7 — 7.2L",
  CAT_C13: "CAT C13 — 12.5L",
  CAT_C15: "CAT C15 — 15.2L",
};

export const ENGINE_HAS_SCR = {
  CAT_C7: false,
  CAT_C13: true,
  CAT_C15: true,
};

function gaussianNoise(mean, pct = 0.005) {
  if (mean == null || Number.isNaN(mean)) return mean;
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * mean * pct;
}

/** Merge single-leak deviation maps — stronger deviation wins on overlapping sensors. */
function mergeDeviations(...scenarioKeys) {
  const merged = {};
  const abs = {};
  for (const key of scenarioKeys) {
    const devs = SCENARIO_DEVIATIONS[key] || {};
    for (const [k, v] of Object.entries(devs)) {
      if (k === "_absolute_overrides") {
        Object.assign(abs, v);
        continue;
      }
      if (!(k in merged) || Math.abs(v) > Math.abs(merged[k])) {
        merged[k] = v;
      }
    }
  }
  if (Object.keys(abs).length) merged._absolute_overrides = abs;
  return merged;
}

/** Percentage deviations — consistent leak patterns across engine sizes. */
const SCENARIO_DEVIATIONS = {
  normal: {},
  intake_preturbo: {
    Pre_Compressor_Pressure_kPa: -0.085,
    Pre_Compressor_Temp_C: -0.015,
    Post_Compressor_Pressure_kPa: -0.106,
    Post_Compressor_Temp_C: -0.06,
    Post_CAC_Pressure_kPa: -0.108,
    Post_CAC_Temp_C: -0.038,
    Intake_Manifold_Pressure_kPa: -0.109,
    Turbocharger_Speed_RPM: -0.054,
    Boost_Pressure_kPa: -0.197,
    Intake_Mass_Balance_Error_kgph: 10.5,
    Intake_Temp_Rise_Across_CAC_C: -0.07,
  },
  intake_cac: {
    Post_CAC_Pressure_kPa: -0.085,
    Post_CAC_Temp_C: 0.115,
    Intake_Manifold_Pressure_kPa: -0.09,
    Intake_Manifold_Temp_C: 0.109,
    Intake_Mass_Balance_Error_kgph: 8.5,
    CAC_Pressure_Drop_kPa: 3.6,
    Intake_Temp_Rise_Across_CAC_C: -0.05,
  },
  exhaust_preturbine: {
    Post_Compressor_Pressure_kPa: -0.059,
    Turbocharger_Speed_RPM: -0.043,
    Boost_Pressure_kPa: -0.111,
    Exhaust_Manifold_Pressure_kPa: -0.139,
    Exhaust_Manifold_Temp_C: 0.059,
    Pre_Turbine_Pressure_kPa: -0.156,
    Post_Turbine_Pressure_kPa: -0.036,
    Post_Turbine_Temp_C: -0.042,
    Intake_Mass_Balance_Error_kgph: -0.07,
    Compressor_Pressure_Ratio: -0.059,
    Turbine_Expansion_Ratio: -0.125,
    CAC_Pressure_Drop_kPa: -2.6,
  },
  exhaust_postturbine: {
    Post_Turbine_Pressure_kPa: -0.071,
    Post_Turbine_Temp_C: -0.073,
    Post_DOC_Pressure_kPa: -0.073,
    Post_DOC_Temp_C: -0.071,
    Post_DPF_Pressure_kPa: -0.061,
    Post_DPF_Temp_C: -0.064,
    Post_SCR_Pressure_kPa: -0.053,
    Post_SCR_Temp_C: -0.071,
    Intake_Mass_Balance_Error_kgph: 0.05,
    Turbine_Expansion_Ratio: 0.075,
    DPF_Delta_Pressure_kPa: -0.43,
  },
  egr_leak: {
    Intake_Manifold_Temp_C: 0.073,
    Exhaust_Manifold_Pressure_kPa: -0.026,
    EGR_Flow_Rate_kgph: -0.345,
    Intake_Mass_Balance_Error_kgph: 1.15,
  },
  cac_direct_leak: {
    Post_CAC_Pressure_kPa: -0.099,
    Post_CAC_Temp_C: 0.192,
    Intake_Manifold_Pressure_kPa: -0.102,
    Intake_Manifold_Temp_C: 0.145,
    Boost_Pressure_kPa: -0.13,
    Intake_Mass_Balance_Error_kgph: 9.5,
    CAC_Pressure_Drop_kPa: 4.2,
  },
  minor_intake_leak: {
    Pre_Compressor_Pressure_kPa: -0.029,
    Post_Compressor_Pressure_kPa: -0.039,
    Post_CAC_Pressure_kPa: -0.04,
    Intake_Manifold_Pressure_kPa: -0.038,
    Boost_Pressure_kPa: -0.07,
    Intake_Mass_Balance_Error_kgph: 3.6,
  },
  sensor_fault_demo: {
    _absolute_overrides: {
      Pre_Compressor_Pressure_kPa: 72.0,
    },
  },
  sensor_fault_exhaust: {
    _absolute_overrides: {
      Exhaust_Manifold_Pressure_kPa: 165.0,
    },
  },
  sensor_fault_egr: {
    _absolute_overrides: {
      EGR_Flow_Rate_kgph: 5.0,
    },
  },
  sensor_fault_cac: {
    _absolute_overrides: {
      CAC_Pressure_Drop_kPa: 26.0,
    },
  },
};

for (const multi of MULTI_LEAK_SCENARIOS) {
  SCENARIO_DEVIATIONS[multi.id] = mergeDeviations(...multi.sources);
}

/**
 * On-demand SFI demo overlay — primary sensor pinned bad, correlated stay at baseline.
 * Values match dedicated sensor_fault_* scenarios (see docs/SFI_SENSOR_FAULT_SCENARIOS.md).
 * @type {Record<string, { sensor: string, value: number, label: string, sfiMockId: string }>}
 */
export const SCENARIO_FAULT_INJECTION_MAP = {
  intake_preturbo: {
    sensor: "Pre_Compressor_Pressure_kPa",
    value: 72.0,
    label: "Pre-compressor pressure",
    sfiMockId: "sensor_fault_demo",
  },
  intake_cac: {
    sensor: "CAC_Pressure_Drop_kPa",
    value: 26.0,
    label: "CAC ΔP sensor",
    sfiMockId: "sensor_fault_cac",
  },
  exhaust_preturbine: {
    sensor: "Exhaust_Manifold_Pressure_kPa",
    value: 165.0,
    label: "Exhaust manifold pressure",
    sfiMockId: "sensor_fault_exhaust",
  },
  exhaust_postturbine: {
    sensor: "Exhaust_Manifold_Pressure_kPa",
    value: 165.0,
    label: "Exhaust manifold pressure",
    sfiMockId: "sensor_fault_exhaust",
  },
  egr_leak: {
    sensor: "EGR_Flow_Rate_kgph",
    value: 5.0,
    label: "EGR flow meter",
    sfiMockId: "sensor_fault_egr",
  },
  cac_direct_leak: {
    sensor: "CAC_Pressure_Drop_kPa",
    value: 26.0,
    label: "CAC ΔP sensor",
    sfiMockId: "sensor_fault_cac",
  },
  minor_intake_leak: {
    sensor: "Pre_Compressor_Pressure_kPa",
    value: 72.0,
    label: "Pre-compressor pressure",
    sfiMockId: "sensor_fault_demo",
  },
};

const SFI_SCENARIO_PREFIX = "sensor_fault_";

/** Single-leak scenarios that support overlay fault injection (not normal / SFI / multi). */
export function canFaultInjectForScenario(scenario) {
  if (!scenario || scenario === "normal") return false;
  if (String(scenario).startsWith(SFI_SCENARIO_PREFIX)) return false;
  if (MULTI_LEAK_SCENARIO_IDS.has(scenario)) return false;
  return Boolean(SCENARIO_FAULT_INJECTION_MAP[scenario]);
}

/** @returns {{ sensor: string, value: number, label: string, sfiMockId: string } | null} */
export function getFaultInjectionForScenario(scenario) {
  return SCENARIO_FAULT_INJECTION_MAP[scenario] || null;
}

/**
 * @param {keyof typeof SCENARIO_LABELS} scenario
 * @param {string} engineId
 * @param {{ faultInjection?: boolean }} [options]
 * @returns {Record<string, number>}
 */
export function generateReading(scenario, engineId = "CAT_C13", options = {}) {
  const base = { ...(ENGINE_BASELINES[engineId] || ENGINE_BASELINES.CAT_C13) };
  const { faultInjection = false } = options;

  if (faultInjection && canFaultInjectForScenario(scenario)) {
    const preset = getFaultInjectionForScenario(scenario);
    if (preset) {
      const out = {};
      for (const [k, v] of Object.entries(base)) {
        if (v == null) continue;
        out[k] = gaussianNoise(v, 0.005);
      }
      out[preset.sensor] = preset.value;
      out.engine_id = engineId;
      return out;
    }
  }

  const devs = SCENARIO_DEVIATIONS[scenario] || {};
  const out = {};
  const isMulti = MULTI_LEAK_SCENARIO_IDS.has(scenario);
  const baseNoise = isMulti ? 0.012 : 0.005;
  const devNoise = isMulti ? 0.015 : 0.008;
  const driftAmp = isMulti ? 0.18 : 0.12;

  for (const [k, v] of Object.entries(base)) {
    if (v == null) continue;
    out[k] = gaussianNoise(v, baseNoise);
  }

  for (const [k, pct] of Object.entries(devs)) {
    if (k === "_absolute_overrides") continue;
    if (!(k in base) || base[k] == null) continue;
    const drift = 1 + Math.sin(Date.now() / 6000 + k.length) * driftAmp;
    out[k] = gaussianNoise(base[k] * (1 + pct * drift), devNoise);
  }

  const abs = devs._absolute_overrides || {};
  for (const [k, v] of Object.entries(abs)) {
    out[k] = v;
  }

  out.engine_id = engineId;

  return out;
}

/**
 * Deterministic reading for manual-input presets (no noise).
 * @param {keyof typeof SCENARIO_LABELS} scenario
 * @param {string} engineId
 * @returns {Record<string, number>}
 */
export function buildPresetReading(scenario, engineId = "CAT_C13") {
  const base = { ...(ENGINE_BASELINES[engineId] || ENGINE_BASELINES.CAT_C13) };
  const devs = SCENARIO_DEVIATIONS[scenario] || {};
  const out = { ...base };

  for (const [k, pct] of Object.entries(devs)) {
    if (k === "_absolute_overrides") continue;
    if (!(k in base) || base[k] == null) continue;
    out[k] = base[k] * (1 + pct);
  }

  const abs = devs._absolute_overrides || {};
  for (const [k, v] of Object.entries(abs)) {
    out[k] = v;
  }

  return out;
}

/**
 * Jury walkthrough — one bad transducer, all other sensors at engine baseline.
 * Values match sensor_fault_* scenarios (see docs/SFI_SENSOR_FAULT_SCENARIOS.md).
 */
export const JURY_SFI_DEMOS = [
  {
    id: "jury_sfi_precompressor",
    scenarioId: "sensor_fault_demo",
    mockId: "sensor_fault_demo",
    label: "⚡ Isolated pre-compressor sensor",
    shortLabel: "Pre-comp fault (recommended)",
    recommended: true,
    faultySensor: "Pre_Compressor_Pressure_kPa",
    faultyValue: 72.0,
    baselineApprox: 99.5,
    unit: "kPa",
    mlExpectation: "ML alarms on Intake Pre-Turbo pattern",
    sfiExpectation: "SFI overrides — 0/2 correlated sensors confirm",
    correlatedSensors: ["Post_Compressor_Pressure_kPa", "Boost_Pressure_kPa"],
    steps: [
      "Only Pre_Compressor_Pressure_kPa is wrong (72 kPa) — every other sensor is nominal baseline.",
      "Click Run SENTINEX pipeline and watch Stage 3 ML flag a leak-like spike.",
      "Stage 5 SFI blocks the leak: headline turns amber Sensor Hardware Fault.",
      "Show judges Post-Compressor P and Boost P still normal — physics says bad transducer, not a leak.",
    ],
  },
  {
    id: "jury_sfi_exhaust",
    scenarioId: "sensor_fault_exhaust",
    mockId: "sensor_fault_exhaust",
    label: "⚡ Isolated exhaust manifold sensor",
    shortLabel: "Exhaust manifold fault",
    faultySensor: "Exhaust_Manifold_Pressure_kPa",
    faultyValue: 165.0,
    baselineApprox: 230.0,
    unit: "kPa",
    mlExpectation: "ML may flag Exhaust Pre-Turbine",
    sfiExpectation: "SFI overrides — turbine pressures stay normal",
    correlatedSensors: ["Pre_Turbine_Pressure_kPa", "Post_Turbine_Pressure_kPa"],
    steps: [
      "Exhaust_Manifold_Pressure_kPa pinned low at 165 kPa — rest of engine nominal.",
      "ML sees exhaust-side anomaly; SFI checks pre/post turbine pressures.",
      "Correlated sensors normal → Sensor Hardware Fault, not a real exhaust leak.",
    ],
  },
  {
    id: "jury_sfi_egr",
    scenarioId: "sensor_fault_egr",
    mockId: "sensor_fault_egr",
    label: "⚡ Isolated EGR flow meter",
    shortLabel: "EGR flow fault",
    faultySensor: "EGR_Flow_Rate_kgph",
    faultyValue: 5.0,
    baselineApprox: 45.0,
    unit: "kg/h",
    mlExpectation: "ML may flag EGR leak pattern",
    sfiExpectation: "SFI overrides — intake/exhaust temps normal",
    correlatedSensors: ["Intake_Manifold_Temp_C", "Exhaust_Manifold_Temp_C"],
    steps: [
      "EGR_Flow_Rate_kgph collapsed to 5 kg/h with all other readings at baseline.",
      "Run pipeline — ML may predict EGR leak from the lone spike.",
      "SFI confirms no correlated cascade → Inspect Sensor Hardware.",
    ],
  },
];

/** @param {string} demoId */
export function getJurySfiDemo(demoId) {
  return JURY_SFI_DEMOS.find((d) => d.id === demoId) ?? null;
}

export function isJurySfiPreset(presetId) {
  return JURY_SFI_DEMOS.some((d) => d.id === presetId);
}

/** Build deterministic readings for a jury SFI demo preset. */
export function buildJurySfiReading(demoId, engineId = "CAT_C13") {
  const demo = getJurySfiDemo(demoId);
  if (!demo) return buildPresetReading("normal", engineId);
  return buildPresetReading(demo.scenarioId, engineId);
}

/** Map manual-input activePreset to mockPredictions scenario id (API offline). */
export function resolveManualMockScenario(presetId) {
  const jury = getJurySfiDemo(presetId);
  if (jury) return jury.mockId;
  if (!presetId || presetId === "custom") return null;
  return presetId;
}
