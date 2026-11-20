import React from "react";
import { SCENARIO_LABELS } from "../simulator.js";
import TwinScenarioSelect from "./TwinScenarioSelect.jsx";

const ENGINES = [
  { id: "CAT_C7", label: "C7" },
  { id: "CAT_C13", label: "C13" },
  { id: "CAT_C15", label: "C15" },
];

const SPEEDS = [
  { label: "0.5s", ms: 500 },
  { label: "1s", ms: 1000 },
  { label: "2s", ms: 2000 },
];

function prettyAction(a) {
  return (a || "—").replace(/_/g, " ");
}

function fmtNum(value, digits = 0) {
  return value != null && Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";
}

/**
 * Compact horizontal controls for Digital Twin — replaces left sidebar.
 */
export default function DigitalTwinTopBar({
  activeEngine,
  onEngineChange,
  activeScenario,
  onScenarioChange,
  isStreaming,
  onToggleStream,
  intervalMs,
  onIntervalChange,
  latestPrediction,
  apiOnline,
  engineSwitching,
  switchingLabel,
  opRpm,
  opLoad,
  opAmbientPressure,
  spRpm,
  spLoad,
  spAmbient,
  readingCount = 0,
  presentMode = false,
  onPresentModeChange,
  readOnly = false,
  mirrorWaiting = false,
  mirrorBayName = null,
  faultInjectionActive = false,
  faultInjectionPreset = null,
}) {
  const dqpScore = mirrorWaiting ? null : (latestPrediction?.Data_Quality?.score ?? 100);
  const steady = mirrorWaiting ? false : Boolean(latestPrediction?.Steady_State_Metrics?.is_steady);
  const suppressed = mirrorWaiting ? false : Boolean(latestPrediction?.Suppressed);
  const sfiMeta = latestPrediction?.Sensor_Fault_Isolation;
  const sensorFault = !mirrorWaiting && (Boolean(sfiMeta?.is_sensor_fault) || faultInjectionActive);
  const leak = !mirrorWaiting && latestPrediction?.Leak_Present === 1 && !suppressed && !sensorFault;
  const leakLabel = mirrorWaiting
    ? "OFFLINE"
    : presentMode
      ? suppressed
        ? "GUARD"
        : sensorFault
          ? "SENSOR FAULT"
          : leak
            ? "ANOMALY"
            : "NOMINAL"
      : suppressed
        ? "SUPPRESSED"
        : sensorFault
          ? "SENSOR FAULT"
          : leak
            ? "DETECTED"
            : "NORMAL";
  const leakClass = mirrorWaiting
    ? "offline"
    : sensorFault
      ? "fault"
      : leak
        ? "leak"
        : suppressed
          ? "warn"
          : "ok";
  const action = prettyAction(latestPrediction?.Recommended_Action);
  const conf = sensorFault && sfiMeta?.fault_confidence != null
    ? `${(sfiMeta.fault_confidence * 100).toFixed(1)}%`
    : latestPrediction?.Confidence_Score != null
      ? `${(latestPrediction.Confidence_Score * 100).toFixed(1)}%`
      : "—";

  return (
    <div className={`twin-top-bar ${presentMode ? "twin-top-bar--present" : ""} ${readOnly ? "twin-top-bar--readonly" : ""}`}>
      {readOnly && (
        <div className="twin-top-mirror-banner" role="status">
          <span className="twin-top-mirror-banner__label">
            {mirrorBayName ? `Monitoring ${mirrorBayName}` : "Head monitor view"}
          </span>
          <span className={`twin-top-mirror-banner__state ${mirrorWaiting ? "offline" : "live"}`}>
            {mirrorWaiting
              ? (mirrorBayName ? "OFFLINE / NO FEED" : "SELECT BAY")
              : "LIVE · TESTER CONTROLS ENGINE & SCENARIO"}
          </span>
        </div>
      )}
      <div className="twin-top-row twin-top-row--controls">
        {readOnly ? (
          <>
            <div className="twin-top-monitor-group">
              <span className="twin-top-label">ENGINE</span>
              <span className="twin-top-monitor-val">
                {mirrorWaiting ? "—" : (activeEngine?.replace(/_/g, " ") || "—")}
              </span>
            </div>
            <div className="twin-top-divider" />
            <div className="twin-top-monitor-group twin-top-monitor-group--wide">
              <span className="twin-top-label">SCENARIO</span>
              <span className="twin-top-monitor-val">
                {mirrorWaiting ? "—" : (SCENARIO_LABELS[activeScenario] || activeScenario || "—")}
              </span>
            </div>
            <div className="twin-top-divider" />
            <div className="twin-top-monitor-group">
              <span className="twin-top-label">STREAM</span>
              <span className={`twin-top-monitor-val ${!mirrorWaiting && isStreaming ? "twin-top-monitor-val--live" : ""}`}>
                {mirrorWaiting ? "OFFLINE" : (isStreaming ? "LIVE" : "PAUSED")}
              </span>
            </div>
            <span className="twin-top-monitor-note">Setpoints adjusted in Cell Ops · engine & scenario are tester-owned</span>
            <div className="twin-top-group twin-top-group--present">
              <button
                type="button"
                className={`twin-top-present-btn ${presentMode ? "active" : ""}`}
                onClick={() => onPresentModeChange?.(!presentMode)}
                title={
                  presentMode
                    ? "Show detailed values for operator view"
                    : "Hide detailed values for judge presentation"
                }
              >
                {presentMode ? "OPERATOR VIEW" : "PRESENT MODE"}
              </button>
            </div>
          </>
        ) : (
          <>
        <div className="twin-top-group">
          <span className="twin-top-label">ENGINE</span>
          <div className="twin-top-pills">
            {ENGINES.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`twin-top-pill ${activeEngine === e.id ? "active" : ""}`}
                onClick={() => onEngineChange(e.id)}
                disabled={engineSwitching || readOnly}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>

        <div className="twin-top-divider" />

        <div className="twin-top-group twin-top-group--scenario">
          <span className="twin-top-label">SCENARIO</span>
          {presentMode ? (
            <span className="twin-top-scenario-mask" title="Hidden during presentation">
              Active test scenario
            </span>
          ) : (
            <TwinScenarioSelect
              value={activeScenario}
              onChange={onScenarioChange}
              disabled={readOnly}
            />
          )}
        </div>

        <div className="twin-top-divider" />

        <div className="twin-top-group">
          <button
            type="button"
            className={`twin-top-stream ${isStreaming ? "active" : ""}`}
            onClick={onToggleStream}
            disabled={readOnly}
          >
            {isStreaming ? "■ STOP STREAM" : "▶ START STREAM"}
          </button>
          <div className="twin-top-speeds">
            {SPEEDS.map((s) => (
              <button
                key={s.ms}
                type="button"
                className={`twin-top-speed ${intervalMs === s.ms ? "active" : ""}`}
                onClick={() => onIntervalChange(s.ms)}
                disabled={readOnly}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="twin-top-group twin-top-group--present">
          <button
            type="button"
            className={`twin-top-present-btn ${presentMode ? "active" : ""}`}
            onClick={() => onPresentModeChange?.(!presentMode)}
            title={
              presentMode
                ? "Show detailed values for operator view"
                : "Hide detailed values for judge presentation"
            }
          >
            {presentMode ? "OPERATOR VIEW" : "PRESENT MODE"}
          </button>
        </div>

        {switchingLabel && !presentMode && (
          <span className="twin-top-switching">{switchingLabel}</span>
        )}
          </>
        )}
      </div>

      <div className={`twin-top-row twin-top-row--readouts twin-top-hud ${!mirrorWaiting && isStreaming ? "twin-top-hud--live" : ""}`}>
        <div className="twin-top-hud__ambient" aria-hidden>
          <div className="twin-top-hud__sweep" />
        </div>

        <div className="twin-top-hud__line">
          {mirrorWaiting ? (
            <span className="twin-top-badge offline">NO LIVE FEED — BAY OFFLINE</span>
          ) : (
            <>
          <span className={`twin-top-badge twin-top-badge--pulse ${apiOnline ? "ok" : "demo"}`}>
            {apiOnline ? "API ONLINE" : "DEMO MODE"}
          </span>
          <span className={`twin-top-badge ${steady && !suppressed ? "ok" : "warn"}`}>
            {suppressed ? "GUARD ACTIVE" : steady ? "STEADY" : "TRANSITIONING"}
          </span>
          <span className={`twin-top-badge ${leakClass} ${leak || sensorFault ? "twin-top-badge--leak-pulse" : ""}`}>
            {presentMode
              ? leakLabel
              : sensorFault
                ? `SFI: ${leakLabel}`
                : `LEAK: ${leakLabel}`}
          </span>

          {!presentMode && (
            <>
              <span className="twin-hud-sep" aria-hidden />

              <span className="twin-hud-chip twin-hud-chip--action" title={action}>
                <span className="twin-hud-chip__label">ACTION</span>
                <span className="twin-hud-chip__value twin-hud-chip__value--action">{action}</span>
              </span>

              <span className="twin-hud-sep" aria-hidden />

              <span className="twin-hud-chip">
                <span className="twin-hud-chip__label">CONF</span>
                <span className={`twin-hud-chip__value ${leak ? "leak" : sensorFault ? "fault" : ""}`}>{conf}</span>
              </span>

              <span className="twin-hud-chip">
                <span className="twin-hud-chip__label">DQ</span>
                <span className={`twin-hud-chip__value ${dqpScore != null && dqpScore >= 90 ? "ok" : dqpScore != null && dqpScore >= 70 ? "warn" : dqpScore != null ? "bad" : ""}`}>
                  {dqpScore != null ? `${dqpScore}/100` : "—/100"}
                </span>
              </span>

              {readingCount > 0 && (
                <span className="twin-hud-chip">
                  <span className="twin-hud-chip__label">READINGS</span>
                  <span className="twin-hud-chip__value">#{readingCount}</span>
                </span>
              )}

              <span className="twin-hud-sep twin-hud-sep--grow" aria-hidden />

              <span className="twin-hud-chip twin-hud-chip--op">
                <span className="twin-hud-chip__label">OPERATING POINT</span>
                <span className="twin-hud-op-values">
                  <span className="mono">ACT {fmtNum(opRpm, 0)} / {fmtNum(opLoad, 0)}% / {fmtNum(opAmbientPressure, 1)} kPa</span>
                  <span className={`twin-hud-op-arrow ${!steady && !suppressed ? "twin-hud-op-arrow--active" : ""}`}>→</span>
                  <span className="mono twin-top-sp">SP {fmtNum(spRpm, 0)} / {fmtNum(spLoad, 0)}% / {fmtNum(spAmbient, 1)} kPa</span>
                </span>
              </span>
            </>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
