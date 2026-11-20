import React from "react";
import { ENGINE_DISPLAY, SCENARIO_LABELS } from "../simulator.js";
import { getTesterBayId, isHeadRole, isTesterRole } from "../utils/testerRegistry.js";
import { BAY_TONE_META, getTesterBayTone } from "../utils/testerBayTone.js";

function fmtRpm(v) {
  return v != null && Number.isFinite(Number(v)) ? Number(v).toFixed(0) : "—";
}

function fmtPct(v) {
  return v != null && Number.isFinite(Number(v)) ? `${Number(v).toFixed(0)}%` : "—";
}

function fmtKpa(v) {
  return v != null && Number.isFinite(Number(v)) ? Number(v).toFixed(1) : "—";
}

export default function TesterBayPanel({ tester, role, onMirror, enhanced = false }) {
  const tone = getTesterBayTone(tester);
  const meta = BAY_TONE_META[tone];
  const p = tester.presence;
  const snap = tester.snap;
  const isSelf = tester.id === role;
  const isHead = isHeadRole(role);
  const canMirror = isHead && isTesterRole(tester.id);
  const bayId = getTesterBayId(tester.id);

  const scenarioLabel = p?.scenarioLabel || SCENARIO_LABELS[p?.scenario] || "Normal";
  const engineLabel = ENGINE_DISPLAY[p?.engine] || p?.engine || "—";
  const actRpm = snap?.opRpm ?? p?.opRpm;
  const actLoad = snap?.opLoad ?? p?.opLoad;
  const actAmb = snap?.opAmbientPressure ?? p?.opAmbientPressure;
  const spRpm = snap?.spRpm ?? p?.spRpm;
  const spLoad = snap?.spLoad ?? p?.spLoad;
  const spAmb = snap?.spAmbient ?? p?.spAmbient;
  const readings = p?.readingCount ?? snap?.readingCount ?? 0;
  const pred = snap?.latestPrediction;
  const sfi = pred?.Sensor_Fault_Isolation;
  const leakLoc = pred?.Leak_Location?.replace(/_/g, " ");
  const conf = pred?.Confidence_Score;
  const confPct = conf != null ? `${(conf * 100).toFixed(1)}%` : null;
  const faultConfPct = sfi?.fault_confidence != null
    ? `${(sfi.fault_confidence * 100).toFixed(1)}%`
    : null;
  const faultSensorLabel = sfi?.faulty_sensor?.replace(/_kPa|_kgph|_RPM|_Pct|_C|_bar/g, " ").replace(/_/g, " ");
  const severity = pred?.Leak_Severity;
  const dq = pred?.Data_Quality?.score;
  const tab = (p?.activeTab || snap?.activeTab || "dashboard").toUpperCase();
  const isStreaming = Boolean(p?.isStreaming || snap?.isStreaming);
  const leakStartMs = snap?.leakStartMs;
  const leakSecs = leakStartMs && tone === "leak"
    ? Math.max(0, Math.floor((Date.now() - leakStartMs) / 1000))
    : null;

  return (
    <article className={`cell-bay-panel ${enhanced ? "cell-bay-panel--enhanced" : ""} cell-bay-panel--${meta.color}`}>
      <header className="cell-bay-panel__head">
        <div className="cell-bay-panel__title-row">
          <span className={`cell-bay-panel__dot cell-bay-panel__dot--${meta.color}`} aria-hidden />
          <div className="cell-bay-panel__title-block">
            <h3 className="cell-bay-panel__name">{tester.displayName}</h3>
            {bayId && <span className="cell-bay-panel__bay-id">{bayId}</span>}
          </div>
          {isSelf && <span className="cell-bay-panel__you">YOU</span>}
        </div>
        <span className={`cell-bay-panel__status cell-bay-panel__status--${meta.color}`}>
          {meta.label}
        </span>
      </header>

      {tester.online ? (
        <div className="cell-bay-panel__body">
          <div className="cell-bay-panel__row">
            <span className="cell-bay-panel__label">Engine</span>
            <span className="cell-bay-panel__value">{engineLabel}</span>
          </div>
          <div className="cell-bay-panel__row">
            <span className="cell-bay-panel__label">Scenario</span>
            <span className={`cell-bay-panel__value ${tone === "leak" ? "cell-bay-panel__value--leak" : ""}`}>
              {scenarioLabel}
            </span>
          </div>
          <div className="cell-bay-panel__row">
            <span className="cell-bay-panel__label">Operating point</span>
            <span className="cell-bay-panel__value mono">
              ACT {fmtRpm(actRpm)} / {fmtPct(actLoad)} / {fmtKpa(actAmb)} kPa
            </span>
          </div>
          {(spRpm != null || spLoad != null) && (
            <div className="cell-bay-panel__row">
              <span className="cell-bay-panel__label">Setpoint</span>
              <span className="cell-bay-panel__value mono">
                SP {fmtRpm(spRpm)} / {fmtPct(spLoad)} / {fmtKpa(spAmb)} kPa
              </span>
            </div>
          )}
          <div className="cell-bay-panel__metrics">
            <span className="cell-bay-panel__chip">#{readings} readings</span>
            <span className="cell-bay-panel__chip">{tab}</span>
            {isStreaming ? (
              <span className="cell-bay-panel__chip cell-bay-panel__chip--live">LIVE</span>
            ) : (
              <span className="cell-bay-panel__chip">PAUSED</span>
            )}
            {dq != null && <span className="cell-bay-panel__chip">DQ {dq}</span>}
          </div>
          {tone === "sensorFault" && (
            <div className="cell-bay-panel__alert cell-bay-panel__alert--fault">
              <strong>{faultSensorLabel || "Isolated sensor anomaly"}</strong>
              {faultConfPct && <span> · SFI {faultConfPct}</span>}
              <span className="cell-bay-panel__alert-sub">
                {sfi?.correlated_deviating ?? 0}/{sfi?.correlated_required ?? 0} correlated sensors — hardware fault, not leak
              </span>
            </div>
          )}
          {tone === "leak" && (
            <div className="cell-bay-panel__alert">
              <strong>{leakLoc && leakLoc !== "None" ? leakLoc : "Leak signature"}</strong>
              {severity && <span> · {severity}</span>}
              {confPct && <span> · {confPct}</span>}
              {leakSecs != null && <span className="cell-bay-panel__alert-age"> · {leakSecs}s</span>}
            </div>
          )}
          {tone === "transitioning" && (
            <p className="cell-bay-panel__hint">
              Setpoint change or steady-state guard — detection may be suppressed until settled.
            </p>
          )}
          {tone === "steady" && (
            <p className="cell-bay-panel__hint">Bay ready — stream to begin monitoring.</p>
          )}
          {p?.statusLabel && (
            <p className="cell-bay-panel__statusline">{p.statusLabel}</p>
          )}
        </div>
      ) : (
        <div className="cell-bay-panel__body cell-bay-panel__body--offline">
          <p>No active console tab detected.</p>
          <p className="cell-bay-panel__hint">Open {tester.displayName} in a separate browser tab and log in.</p>
        </div>
      )}

      {canMirror && (
        <footer className="cell-bay-panel__foot">
          <button
            type="button"
            className="cell-bay-panel__mirror"
            onClick={() => onMirror?.(tester.id)}
            disabled={!tester.online}
          >
            {tester.online ? "Mirror live dashboard" : "Bay offline"}
          </button>
        </footer>
      )}
    </article>
  );
}
