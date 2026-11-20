import React from "react";
import { formatModelAccuracy, displayModelName } from "../../utils/modelSelection.js";

function confidenceRingColor(colour) {
  if (colour === "leak") return "#E24B4A";
  if (colour === "warning") return "#F59E0B";
  return "#00D4A8";
}

export default function MetricCard({
  label,
  value,
  colour,
  mono,
  animated,
  className = "",
  variant = "default",
  progress,
  modelName,
  accuracy,
  subLabel,
}) {
  if (variant === "confidence") {
    const pct = Math.min(100, Math.max(0, progress ?? parseFloat(value) ?? 0));
    const ringColor = confidenceRingColor(colour);

    return (
      <div className={`metric-card metric-card-rich metric-confidence ${colour || ""} ${className}`}>
        <span className="metric-card-label">{label}</span>
        <div className="metric-rich-row">
          <div className="metric-ring-wrap" aria-hidden>
            <svg className="metric-ring-svg" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="16" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
              <circle
                cx="22"
                cy="22"
                r="16"
                fill="none"
                stroke={ringColor}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 16}
                strokeDashoffset={(2 * Math.PI * 16) * (1 - pct / 100)}
                transform="rotate(-90 22 22)"
                className="metric-ring-progress"
              />
            </svg>
          </div>
          <div className="metric-rich-side">
            <span className={`metric-confidence-pct ${colour || "normal"} ${animated ? "updated" : ""}`}>
              {value}
            </span>
            <div className="metric-rich-bar">
              <div
                className={`metric-rich-bar-fill ${colour || "normal"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="metric-rich-sub">{subLabel || "ML certainty"}</span>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "model") {
    const resolvedName = displayModelName(modelName, modelName);
    const accPct = accuracy != null ? accuracy * 100 : null;
    const badge =
      resolvedName === "Random Forest" ? "RF"
        : resolvedName === "XGBoost" ? "XGB"
          : resolvedName === "Neural Network" ? "NN"
            : resolvedName?.slice(0, 3)?.toUpperCase() ?? "—";

    return (
      <div className={`metric-card metric-card-rich metric-model ${colour || "info"} ${className}`}>
        <span className="metric-card-label">{label}</span>
        <div className="metric-rich-row">
          <div className="metric-model-badge">{badge}</div>
          <div className="metric-rich-side">
            <span className={`metric-model-name ${animated ? "updated" : ""}`}>
              {resolvedName ?? "—"}
            </span>
            {accPct != null && (
              <>
                <div className="metric-rich-bar">
                  <div className="metric-rich-bar-fill info" style={{ width: `${accPct}%` }} />
                </div>
                <span className="metric-rich-sub">
                  Loc F1 {formatModelAccuracy(accuracy)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`metric-card ${colour || ""} ${className}`}>
      <span className="metric-card-label">{label}</span>
      <span className={`metric-card-value ${mono ? "mono" : ""} ${colour || ""} ${animated ? "updated" : ""}`}>
        {value}
      </span>
    </div>
  );
}
