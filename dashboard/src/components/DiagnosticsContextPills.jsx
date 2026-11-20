import React from "react";
import { ENGINE_DISPLAY } from "../simulator.js";
import {
  stabilizeActiveLeaks,
  formatLeakLocation,
  formatMultiLeakSummary,
  isMultiLeakPrediction,
} from "../utils/multiLeak.js";

function severityTone(severity) {
  const s = (severity || "").toLowerCase();
  if (!s || s === "none") return "muted";
  if (s.includes("minor")) return "warning";
  if (s.includes("moderate")) return "orange";
  if (s.includes("severe") || s.includes("critical")) return "leak";
  return "default";
}

export default function DiagnosticsContextPills({ engineId, latestPrediction, activeScenario = null }) {
  const engineLabel = ENGINE_DISPLAY[engineId] || (engineId || "CAT_C13").replace(/_/g, " ");
  const hasLeak = latestPrediction?.Leak_Present === 1 && !latestPrediction?.Suppressed;
  const activeLeaks = stabilizeActiveLeaks(latestPrediction, activeScenario);
  const isMulti = isMultiLeakPrediction(latestPrediction) && activeLeaks.length >= 2;
  const severity = isMulti
    ? activeLeaks.map((l) => l.severity).filter(Boolean).join(" / ")
    : latestPrediction?.Leak_Severity;
  const severityDisplay = severity && severity !== "None" ? severity : "—";

  let leakText = "No active leak";
  let leakTone = "normal";
  if (latestPrediction?.Suppressed) {
    leakText = "Detection suppressed";
    leakTone = "warning";
  } else if (latestPrediction?.Sensor_Fault_Isolation?.is_sensor_fault) {
    leakText = "Sensor fault";
    leakTone = "warning";
  } else if (hasLeak && isMulti) {
    leakText = formatMultiLeakSummary(latestPrediction, activeScenario) || "Multi-leak";
    leakTone = "leak";
  } else if (hasLeak) {
    leakText = formatLeakLocation(latestPrediction?.Leak_Location);
    leakTone = "leak";
  } else if (!latestPrediction) {
    leakText = "Awaiting data";
    leakTone = "muted";
  }

  return (
    <div className="diag-context-pills">
      <span className="diag-context-pill diag-context-pill-engine">
        <span className="diag-context-pill-key">Engine</span>
        <span className="diag-context-pill-val">{engineLabel}</span>
      </span>
      <span className={`diag-context-pill diag-context-pill-leak diag-context-pill-tone-${leakTone}`}>
        <span className="diag-context-pill-key">{isMulti ? "Multi-Leak" : "Leak"}</span>
        <span className="diag-context-pill-val">{leakText}</span>
      </span>
      <span className={`diag-context-pill diag-context-pill-severity diag-context-pill-tone-${severityTone(severity)}`}>
        <span className="diag-context-pill-key">Severity</span>
        <span className="diag-context-pill-val">{severityDisplay}</span>
      </span>
    </div>
  );
}
