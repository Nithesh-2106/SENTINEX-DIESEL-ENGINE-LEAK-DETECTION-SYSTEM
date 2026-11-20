import React from "react";
import {
  formatLeakLocation,
  formatMultiLeakSummary,
  isMultiLeakPrediction,
  stabilizeActiveLeaks,
} from "../utils/multiLeak.js";

function shortSensor(name) {
  return name.replace(/_/g, " ");
}

function ShapDriverList({ top, title }) {
  const maxImpact = Math.max(
    0.0001,
    ...top.map((r) => Math.abs(Number(r.shap_impact) || 0))
  );

  if (!top.length) return null;

  return (
    <div className="mb-4">
      {title && (
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-purple-300">
          {title}
        </p>
      )}
      <div className="shap-driver-list shap-driver-scroll">
        {top.map((row) => {
          const impact = Number(row.shap_impact) || 0;
          const w = (Math.abs(impact) / maxImpact) * 100;
          const below = Number(row.your_value) < Number(row.normal_baseline);
          return (
            <div key={`${title}-${row.sensor}`} className="shap-driver-row">
              <div className="shap-driver-meta">
                <span className="shap-driver-name">{shortSensor(row.sensor)}</span>
                <span className="shap-driver-values">
                  {Number(row.your_value).toFixed(2)} | baseline {Number(row.normal_baseline).toFixed(2)} |{" "}
                  <span className={below ? "shap-val-below" : "shap-val-above"}>
                    {row.deviation_pct > 0 ? "+" : ""}
                    {row.deviation_pct}%
                  </span>
                </span>
              </div>
              <div className="shap-driver-bar-row">
                <div className="shap-driver-bar-track">
                  <div
                    className={`shap-driver-bar-fill ${below ? "below" : "above"}`}
                    style={{ width: `${w}%` }}
                  />
                </div>
                <span className="shap-driver-impact">{impact.toFixed(3)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * @param {{
 *   prediction: object | null;
 *   multiPattern?: object | null;
 * }} props
 */
export default function ShapPanel({ prediction, multiPattern, activeScenario = null, scrollable = false }) {
  const normal =
    !prediction ||
    prediction.Leak_Present === 0 ||
    prediction.Leak_Location === "None";

  const multi = multiPattern ?? prediction?.Multi_Pattern ?? null;
  const isMulti = isMultiLeakPrediction(prediction);
  const activeLeaks = stabilizeActiveLeaks(prediction, activeScenario);
  const top = prediction?.top_5_sensors_driving_prediction ?? [];

  const predictLabel = normal
    ? "None"
    : isMulti
      ? formatMultiLeakSummary(prediction, activeScenario) || formatLeakLocation(prediction.Leak_Location)
      : formatLeakLocation(prediction.Leak_Location);

  return (
    <div className={`shap-panel-inner ${scrollable ? "shap-panel-scrollable" : ""}`}>
      <div className="shap-panel-header">
        <h2 className="shap-panel-title">Why did the model decide this?</h2>
        <div className="shap-powered-badge">
          <span>POWERED BY SHAP</span>
        </div>
      </div>
      <p className="shap-panel-subtitle">
        Predicting:{" "}
        <span className="font-mono text-white">{predictLabel}</span>
      </p>
      {isMulti && multi?.combo_label && (
        <p className="mb-2 text-[10px] text-purple-300/80">
          Combo: <span className="font-mono">{multi.combo_label}</span>
        </p>
      )}

      {normal && (
        <div className="shap-empty-state">
          <div className="shap-empty-grid">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <span key={i}>✓</span>
            ))}
          </div>
          <p>
            All sensors within normal operating range. No anomalous SHAP contributions detected.
          </p>
        </div>
      )}

      {!normal && isMulti && activeLeaks.length > 0 && (
        <>
          {activeLeaks.map((leak, idx) => (
            <ShapDriverList
              key={leak.location}
              top={leak.top_5_sensors_driving_prediction || []}
              title={`${idx === 0 ? "PRIMARY" : "SECONDARY"} — ${formatLeakLocation(leak.location)} (${leak.severity || "—"})`}
            />
          ))}
        </>
      )}

      {!normal && !isMulti && top.length > 0 && <ShapDriverList top={top} />}
    </div>
  );
}
