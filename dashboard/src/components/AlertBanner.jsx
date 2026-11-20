import React from "react";
import {
  formatLeakLocation,
  formatMultiLeakSummary,
  isMultiLeakPrediction,
  stabilizeActiveLeaks,
} from "../utils/multiLeak.js";

function formatAction(a) {
  return (a || "").replace(/_/g, " ");
}

function shortSeverityText(prediction, activeLeaks, isMulti) {
  if (isMulti && activeLeaks.length >= 2) {
    return activeLeaks
      .map((l) => `${formatLeakLocation(l.location).split(" ").slice(-2).join(" ")} ${l.severity}`)
      .join(" · ");
  }
  return prediction.Leak_Severity || "—";
}

/**
 * @param {{
 *   visible: boolean;
 *   prediction: object | null;
 *   multiPattern?: object | null;
 *   activeScenario?: string | null;
 *   onDismiss: () => void;
 * }} props
 */
export default function AlertBanner({
  visible,
  prediction,
  multiPattern,
  activeScenario = null,
  onDismiss,
}) {
  if (!visible || !prediction || prediction.Leak_Present !== 1) {
    return null;
  }

  const isMulti = isMultiLeakPrediction(prediction);
  const activeLeaks = stabilizeActiveLeaks(prediction, activeScenario);
  const sev = (prediction.Leak_Severity || "").toLowerCase();
  const isUrgent = !isMulti && (sev.includes("severe") || sev.includes("critical"));
  const variant = isMulti ? "multi" : isUrgent ? "urgent" : "warn";
  const conf = (prediction.Confidence_Score * 100).toFixed(1);

  const locationText = isMulti
    ? formatMultiLeakSummary(prediction, activeScenario) ||
      activeLeaks.map((l) => formatLeakLocation(l.location)).join(" + ")
    : formatLeakLocation(prediction.Leak_Location);

  const severityText = shortSeverityText(prediction, activeLeaks, isMulti);
  const actionText = formatAction(prediction.Recommended_Action);

  return (
    <div
      className={`alert-banner liquid-glass-bar alert-banner--${variant}`}
      role="alert"
      aria-live="assertive"
    >
      <span className="alert-banner__shimmer" aria-hidden />
      <span className="alert-banner__beam" aria-hidden />
      <div className="alert-banner__inner">
        <div className="alert-banner__track" title={`${locationText} · ${severityText}`}>
          <span className="alert-banner__icon" aria-hidden>⚠</span>
          <span className="alert-banner__headline">LEAK DETECTED</span>
          <span className="alert-banner__dot" aria-hidden>·</span>
          <span className="alert-banner__location">{locationText}</span>
          {isMulti && <span className="alert-banner__pill">MULTI</span>}
          <span className="alert-banner__dot" aria-hidden>·</span>
          <span className="alert-banner__meta">Sev {severityText}</span>
          <span className="alert-banner__dot" aria-hidden>·</span>
          <span className="alert-banner__meta">{actionText}</span>
          <span className="alert-banner__dot" aria-hidden>·</span>
          <span className="alert-banner__conf">{conf}%</span>
        </div>
        <button type="button" onClick={onDismiss} className="alert-banner__dismiss">
          Dismiss
        </button>
      </div>
    </div>
  );
}
