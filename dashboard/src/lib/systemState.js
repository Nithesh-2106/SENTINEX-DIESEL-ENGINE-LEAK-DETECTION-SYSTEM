/**
 * Unified system state — single headline for operators.
 * Priority: Suppressed > SensorFault > Leak > DataCleaned > Normal
 */

import {
  formatLeakLocation,
  formatMultiLeakSummary,
  isMultiLeakPrediction,
  stabilizeActiveLeaks,
} from "../utils/multiLeak.js";

function formatAction(action) {
  return (action || "Continue Testing").replace(/_/g, " ");
}

/**
 * @param {object | null} prediction
 * @param {number} dqpScore
 * @param {string | null} scenarioId
 */
export function getSystemState(prediction, dqpScore = 100, scenarioId = null) {
  if (prediction?.Suppressed) {
    return {
      state: "TRANSITIONING",
      color: "grey",
      icon: "⏸",
      title: "Engine Transitioning",
      message:
        prediction.Suppression_Reason ||
        "Monitoring paused during transition",
      action: null,
    };
  }

  const sfi = prediction?.Sensor_Fault_Isolation;
  if (sfi?.is_sensor_fault) {
    const faultConf = sfi.fault_confidence ?? 0;
    return {
      state: "SENSOR_FAULT",
      color: "amber",
      icon: "⚡",
      title: "Sensor Hardware Fault",
      message: `Isolated anomaly on ${sfi.faulty_sensor}`,
      subtext: `${sfi.correlated_deviating}/${sfi.correlated_required} correlated sensors confirm — leak blocked`,
      action: "Inspect Sensor Hardware",
      dqNote: dqpScore < 90 ? `DQP score: ${dqpScore}/100` : null,
      sfi,
      confidence: faultConf,
      confidenceLabel: "SFI fault confidence",
      leakConfidence: 0,
    };
  }

  if (prediction?.Leak_Present === 1) {
    const multi = prediction?.Multi_Pattern;
    const isMulti = isMultiLeakPrediction(prediction);
    const activeDetails = stabilizeActiveLeaks(prediction, scenarioId);
    const locationMsg = isMulti
      ? formatMultiLeakSummary(prediction, scenarioId) ||
        activeDetails.map((d) => formatLeakLocation(d.location)).join(" + ")
      : formatLeakLocation(prediction.Leak_Location);

    const severityLines = activeDetails.map(
      (d) => `${formatLeakLocation(d.location)}: ${d.severity || "Unknown"}`
    );

    return {
      state: "LEAK_DETECTED",
      color: isMulti ? "purple" : "red",
      icon: isMulti ? "⚡⚡" : "⚠",
      title: isMulti ? "Multi-Leak Detected" : "Leak Detected",
      message: locationMsg,
      subtext: isMulti
        ? severityLines.join(" · ")
        : `Severity: ${prediction.Leak_Severity || "Unknown"}`,
      action: prediction.Recommended_Action,
      confirmed: sfi?.is_confirmed_leak,
      correlated: sfi
        ? `${sfi.correlated_deviating}/${sfi.correlated_required} sensors confirm`
        : null,
      confidence: prediction.Confidence_Score,
      isMultiLeak: isMulti,
      multiPattern: multi,
      activeLeakDetails: activeDetails,
    };
  }

  const dq = prediction?.Data_Quality;
  if (dq && dq.flags?.length > 0 && dqpScore < 90) {
    return {
      state: "DATA_CLEANED",
      color: "blue",
      icon: "🔧",
      title: "Data Quality Event",
      message: dq.summary,
      subtext: `${dq.flags.length} sensor(s) cleaned before inference`,
      action: "Continue Testing",
      confidence: prediction?.Confidence_Score,
    };
  }

  return {
    state: "NORMAL",
    color: "green",
    icon: "✓",
    title: "System Normal",
    message: "No leak detected",
    action: "Continue Testing",
    confidence: prediction?.Confidence_Score,
  };
}

export const STATE_STYLES = {
  grey: {
    border: "border-[#94A3B8]/50",
    bg: "bg-[#243447]",
    title: "text-[#93C5FD]",
    icon: "text-[#94A3B8]",
  },
  amber: {
    border: "border-[#F59E0B]/60",
    bg: "bg-[#1C1400]",
    title: "text-amber-300",
    icon: "text-amber-400",
  },
  red: {
    border: "border-[#EF4444]",
    bg: "bg-[#1C0000]",
    title: "text-[#EF4444]",
    icon: "text-[#EF4444]",
  },
  blue: {
    border: "border-[#0891B2]/60",
    bg: "bg-[#001828]",
    title: "text-[#38BDF8]",
    icon: "text-[#38BDF8]",
  },
  green: {
    border: "border-[#22C55E]/50",
    bg: "bg-[#001C00]",
    title: "text-[#22C55E]",
    icon: "text-[#22C55E]",
  },
  purple: {
    border: "border-[#7C3AED]",
    bg: "bg-[#1A0B2E]",
    title: "text-[#7C3AED]",
    icon: "text-[#7C3AED]",
  },
};

export function isSensorFaultActive(prediction) {
  return Boolean(prediction?.Sensor_Fault_Isolation?.is_sensor_fault);
}

export function isLeakActivePrediction(prediction) {
  return Boolean(
    prediction?.Leak_Present === 1
      && !prediction?.Suppressed
      && !isSensorFaultActive(prediction),
  );
}

export { formatAction };
