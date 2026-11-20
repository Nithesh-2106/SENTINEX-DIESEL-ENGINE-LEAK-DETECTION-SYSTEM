/**
 * Live leak severity from sensor deviations vs engine baselines.
 * Five tiers: Minor | Moderate | Severe | Critical | None
 *
 * Calibrated against simulator SCENARIO_DEVIATIONS (CAT C13).
 * Compare to engineBaselines — the simulator injects faults as % offsets
 * from ENGINE_BASELINES, not the API Dynamic_Baseline at operating point.
 */

const LOCATION_PRIMARY_SENSORS = {
  Intake_PreTurbo: [
    "Pre_Compressor_Pressure_kPa",
    "Boost_Pressure_kPa",
    "Post_Compressor_Pressure_kPa",
  ],
  Intake_PostTurbo_CAC: [
    "CAC_Pressure_Drop_kPa",
    "Post_CAC_Pressure_kPa",
    "Intake_Manifold_Pressure_kPa",
  ],
  Exhaust_PreTurbine: [
    "Pre_Turbine_Pressure_kPa",
    "Exhaust_Manifold_Temp_C",
    "Exhaust_Manifold_Pressure_kPa",
  ],
  Exhaust_PostTurbine: [
    "Post_Turbine_Pressure_kPa",
    "Post_DPF_Pressure_kPa",
    "Post_SCR_Pressure_kPa",
  ],
  EGR_Leak: ["EGR_Flow_Rate_kgph", "Intake_Manifold_Temp_C", "Exhaust_Manifold_Pressure_kPa"],
  CAC_Direct_Leak: [
    "CAC_Pressure_Drop_kPa",
    "Post_CAC_Temp_C",
    "Post_CAC_Pressure_kPa",
  ],
  Minor_Intake_Leak: [
    "Post_CAC_Pressure_kPa",
    "Intake_Manifold_Pressure_kPa",
    "Boost_Pressure_kPa",
  ],
};

/** Cap dominant channels so one sensor cannot force Critical alone. */
const SENSOR_DEV_CAPS = {
  EGR_Flow_Rate_kgph: 14,
};

const SCORE_WEIGHT_MAX = 0.65;
const SCORE_WEIGHT_AVG = 0.35;

/** Score cutoffs tuned to demo scenario deviation profiles. */
const DEFAULT_THRESHOLDS = { minor: 7.5, moderate: 12, severe: 19 };

/** Softer bands for leaks that deviate strongly on one channel but are lower risk. */
const LOCATION_THRESHOLDS = {
  EGR_Leak: { minor: 7.5, moderate: 14, severe: 22 },
  CAC_Direct_Leak: { minor: 7.5, moderate: 21, severe: 26 },
  Minor_Intake_Leak: { minor: 8.5, moderate: 14, severe: 22 },
  Exhaust_PostTurbine: { minor: 8, moderate: 14, severe: 22 },
};

function thresholdsForLocation(leakLocation) {
  return LOCATION_THRESHOLDS[leakLocation] || DEFAULT_THRESHOLDS;
}

function scoreToSeverity(score, leakLocation) {
  const t = thresholdsForLocation(leakLocation);
  if (score < t.minor) return "Minor";
  if (score < t.moderate) return "Moderate";
  if (score < t.severe) return "Severe";
  return "Critical";
}

/**
 * Effective deviation % for scoring (handles derived / small-magnitude signals).
 */
function effectiveDeviationPct(sensor, actual, expected) {
  const a = Number(actual);
  const b = Number(expected);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;

  if (sensor === "CAC_Pressure_Drop_kPa") {
    const deltaKpa = Math.abs(a - b);
    return Math.min(22, (deltaKpa / 4) * 5);
  }

  if (sensor === "Intake_Mass_Balance_Error_kgph") {
    const delta = Math.abs(a - b);
    return Math.min(18, (delta / 2.5) * 4);
  }

  if (!b) return 0;

  let pct = Math.abs(((a - b) / Math.abs(b)) * 100);
  const cap = SENSOR_DEV_CAPS[sensor];
  if (cap != null) pct = Math.min(cap, pct);
  return pct;
}

function blendScore(deviations) {
  const maxDev = Math.max(...deviations);
  const avgDev = deviations.reduce((a, b) => a + b, 0) / deviations.length;
  return maxDev * SCORE_WEIGHT_MAX + avgDev * SCORE_WEIGHT_AVG;
}

function computePerformanceImpact(reading, baseline, leakLocation) {
  const dev = (sensor) => {
    const actual = reading[sensor] ?? 0;
    const expected = baseline[sensor] ?? 1;
    if (!expected) return 0;
    return Math.abs(((actual - expected) / expected) * 100);
  };

  const impactMap = {
    Intake_PreTurbo: () =>
      (dev("Pre_Compressor_Pressure_kPa") + dev("Boost_Pressure_kPa")) / 2,

    Intake_PostTurbo_CAC: () => dev("Post_CAC_Pressure_kPa"),

    Exhaust_PreTurbine: () =>
      (dev("Exhaust_Manifold_Pressure_kPa") + dev("Turbine_Expansion_Ratio")) / 2,

    Exhaust_PostTurbine: () => dev("Post_Turbine_Pressure_kPa") * 0.5,

    EGR_Leak: () => dev("EGR_Flow_Rate_kgph") * 0.3,

    CAC_Direct_Leak: () => dev("Post_CAC_Pressure_kPa"),

    Minor_Intake_Leak: () =>
      (dev("Pre_Compressor_Pressure_kPa") +
        dev("Post_Compressor_Pressure_kPa") +
        dev("Post_CAC_Pressure_kPa")) /
      3,
  };

  const basisMap = {
    Intake_PreTurbo: "MAF and boost pressure loss",
    Intake_PostTurbo_CAC: "Charge air pressure loss",
    Exhaust_PreTurbine: "Turbine energy loss",
    Exhaust_PostTurbine: "Back-pressure change",
    EGR_Leak: "Emissions impact",
    CAC_Direct_Leak: "Boost pressure loss at CAC",
    Minor_Intake_Leak: "Distributed intake loss",
  };

  const fn = impactMap[leakLocation];
  const impact = fn ? Math.min(fn(), 25.0) : 0;
  return {
    performance_impact_pct: Math.round(impact * 10) / 10,
    impact_basis: basisMap[leakLocation] ?? "",
  };
}

/**
 * @param {Record<string, number>} reading
 * @param {Record<string, number>} baseline
 * @param {string} leakLocation
 * @param {{ sfiConfirmed?: boolean }} [options]
 * @returns {{
 *   severity: "Minor"|"Moderate"|"Severe"|"Critical"|"None",
 *   recommendedAction: string,
 *   performance_impact_pct: number,
 *   impact_basis: string,
 *   score: number,
 * }}
 */
export function computeDynamicSeverity(reading, baseline, leakLocation, options = {}) {
  const empty = {
    severity: "None",
    recommendedAction: "Continue_Testing",
    performance_impact_pct: 0,
    impact_basis: "",
    score: 0,
  };

  if (!reading || !baseline || !leakLocation || leakLocation === "None") {
    return empty;
  }

  const keys = LOCATION_PRIMARY_SENSORS[leakLocation] || Object.keys(baseline).slice(0, 6);
  const deviations = keys
    .map((k) => effectiveDeviationPct(k, reading[k], baseline[k]))
    .filter((d) => Number.isFinite(d) && d > 0);

  const { performance_impact_pct, impact_basis } = computePerformanceImpact(
    reading,
    baseline,
    leakLocation
  );

  if (deviations.length === 0) {
    return {
      severity: "Moderate",
      recommendedAction: actionForSeverity("Moderate"),
      performance_impact_pct,
      impact_basis,
      score: 0,
    };
  }

  const score = blendScore(deviations);
  let severity = scoreToSeverity(score, leakLocation);

  const sfiConfirmed = options.sfiConfirmed !== false;
  if (!sfiConfirmed && (severity === "Moderate" || severity === "Severe" || severity === "Critical")) {
    severity = "Minor";
  }

  return {
    severity,
    recommendedAction: actionForSeverity(severity),
    performance_impact_pct,
    impact_basis,
    score,
  };
}

/**
 * Recommended action from dynamic severity.
 */
export function actionForSeverity(severity) {
  if (severity === "Minor") return "Flag_and_Monitor";
  if (severity === "Moderate" || severity === "Severe" || severity === "Critical") {
    return "Pause_Test_Inspect_Component";
  }
  return "Continue_Testing";
}

/** RCA / rules that only distinguish minor vs elevated leak magnitude. */
export function isMinorLeakSeverity(severity) {
  return severity === "Minor";
}

export function isElevatedLeakSeverity(severity) {
  return severity === "Moderate" || severity === "Severe" || severity === "Critical";
}
