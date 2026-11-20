/**
 * Helpers for unified multi-leak API fields from predict.py.
 */

import { MULTI_LEAK_SCENARIOS } from "../simulator.js";

const MULTI_SCENARIO_ORDER = Object.fromEntries(
  MULTI_LEAK_SCENARIOS.map((s) => {
    const parts = s.combo.split("+");
    return [s.id, parts];
  })
);

export function formatLeakLocation(loc) {
  if (!loc || loc === "None") return "—";
  return loc.replace(/_/g, " ");
}

/** Raw per-location details from API (unordered). */
export function getActiveLeakDetails(prediction) {
  const fromPattern = prediction?.Multi_Pattern?.active_leak_details;
  const fromTop = prediction?.Active_Leak_Details;
  if (fromPattern?.length) return fromPattern;
  if (fromTop?.length) return fromTop;

  if (
    prediction?.Leak_Present === 1 &&
    prediction?.Leak_Location &&
    prediction.Leak_Location !== "None"
  ) {
    return [
      {
        location: prediction.Leak_Location,
        severity: prediction.Leak_Severity,
        confidence: prediction.Confidence_Score,
        probability: prediction.Confidence_Score,
        recommended_action: prediction.Recommended_Action,
        physics_severity: prediction.Physics_Severity,
        top_5_sensors_driving_prediction:
          prediction.top_5_sensors_driving_prediction || [],
      },
    ];
  }
  return [];
}

/** Pin active leak order to scenario combo — prevents primary/secondary swap in UI. */
export function stabilizeActiveLeaks(prediction, scenarioId = null) {
  const details = getActiveLeakDetails(prediction);
  if (details.length < 2) return details;

  const pinned = MULTI_SCENARIO_ORDER[scenarioId || ""];
  if (!pinned || pinned.length < 2) return details;

  const byLoc = Object.fromEntries(details.map((d) => [d.location, d]));
  if (!byLoc[pinned[0]] || !byLoc[pinned[1]]) return details;

  return [byLoc[pinned[0]], byLoc[pinned[1]]];
}

export function isMultiLeakPrediction(prediction) {
  return Boolean(
    prediction?.Is_Multi_Leak ||
      prediction?.Multi_Pattern?.is_multi_leak ||
      getActiveLeakDetails(prediction).length >= 2
  );
}

export function formatMultiLeakSummary(prediction, scenarioId = null) {
  const details = stabilizeActiveLeaks(prediction, scenarioId);
  if (details.length < 2) return null;
  return details.map((d) => formatLeakLocation(d.location)).join(" + ");
}

export function mergedShapFromActiveLeaks(prediction, scenarioId = null) {
  const details = stabilizeActiveLeaks(prediction, scenarioId);
  if (!details.length) {
    return prediction?.top_5_sensors_driving_prediction || [];
  }
  const bySensor = new Map();
  for (const leak of details) {
    for (const row of leak.top_5_sensors_driving_prediction || []) {
      const prev = bySensor.get(row.sensor);
      if (!prev || Math.abs(row.shap_impact) > Math.abs(prev.shap_impact)) {
        bySensor.set(row.sensor, { ...row, _leakLocation: leak.location });
      }
    }
  }
  return [...bySensor.values()]
    .sort((a, b) => Math.abs(b.shap_impact) - Math.abs(a.shap_impact))
    .slice(0, 10);
}
