import React from "react";

function pillClass(kind) {
  if (kind === "ok") return "ssg-pill-ok";
  if (kind === "warn") return "ssg-pill-warn";
  if (kind === "guard") return "ssg-pill-guard";
  return "ssg-pill-muted";
}

/**
 * Steady State Guard (SSG) — Stage 2 pipeline panel.
 * @param {{
 *   prediction: object | null;
 *   isStreaming: boolean;
 * }} props
 */
export default function SteadyStatePanel({ prediction, isStreaming }) {
  const suppressed = Boolean(prediction?.Suppressed);
  const metrics = prediction?.Steady_State_Metrics;
  const isSteady = Boolean(metrics?.is_steady);
  const rpmCv = Number(metrics?.rpm_cv_pct ?? 0);
  const loadCv = Number(metrics?.load_cv_pct ?? 0);
  const windowSize = Number(metrics?.readings_in_window ?? 0);
  const steadyDur = Number(metrics?.steady_duration_readings ?? 0);
  const windowMax = 10;
  const steadyFrac = Math.min(1, steadyDur / windowMax);

  let status = "STANDBY";
  let statusKind = "muted";
  if (!prediction) {
    status = "AWAITING DATA";
  } else if (suppressed) {
    status = "GUARD ACTIVE";
    statusKind = "guard";
  } else if (isSteady) {
    status = "STEADY";
    statusKind = "ok";
  } else {
    status = "TRANSITIONING";
    statusKind = "warn";
  }

  const rpmOk = rpmCv < 2;
  const loadOk = loadCv < 2;

  return (
    <div className="steady-state-panel">
      <div className="ssg-status-block">
        <div className="ssg-status-top">
          <span className={`ssg-status-pill ${pillClass(statusKind)}`}>{status}</span>
          {isStreaming && (
            <span className="ssg-live-dot">
              <span className="ssg-live-ping" />
              <span className="ssg-live-core" />
              LIVE
            </span>
          )}
        </div>
        <div className="ssg-progress-label">
          Steady window {steadyDur}/{windowMax} readings
        </div>
        <div className="ssg-progress-track">
          <div
            className={`ssg-progress-fill ${isSteady ? "ok" : "warn"}`}
            style={{ width: `${steadyFrac * 100}%` }}
          />
        </div>
      </div>

      <div className="ssg-metrics-grid">
        <div className="ssg-metric">
          <span className="ssg-metric-label">RPM CV</span>
          <span className={`ssg-metric-value ${rpmOk ? "ok" : "warn"}`}>
            {rpmCv.toFixed(2)}%
          </span>
          <span className="ssg-metric-thresh">threshold &lt;2%</span>
        </div>
        <div className="ssg-metric">
          <span className="ssg-metric-label">Load CV</span>
          <span className={`ssg-metric-value ${loadOk ? "ok" : "warn"}`}>
            {loadCv.toFixed(2)}%
          </span>
          <span className="ssg-metric-thresh">threshold &lt;2%</span>
        </div>
        <div className="ssg-metric">
          <span className="ssg-metric-label">Window</span>
          <span className="ssg-metric-value">{windowSize}/{windowMax}</span>
          <span className="ssg-metric-thresh">rolling buffer</span>
        </div>
      </div>

      {suppressed && (
        <div className="ssg-reason ssg-reason-guard">
          Detection suppressed during RPM/load transition — alarms resume when steady.
        </div>
      )}
      {!suppressed && !isSteady && metrics?.reason && (
        <div className="ssg-reason ssg-reason-warn">{metrics.reason}</div>
      )}
      {isSteady && !suppressed && (
        <div className="ssg-reason ssg-reason-ok">
          Engine operating point stable — ML inference and leak alarms enabled.
        </div>
      )}

      <div className="ssg-stage-note">
        Stage 2 · Steady State Guard — prevents false alarms during setpoint changes.
      </div>
    </div>
  );
}
