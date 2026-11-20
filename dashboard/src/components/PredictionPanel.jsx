import React, { useEffect, useRef, useState } from "react";
import { formatAction } from "../lib/systemState.js";
import {
  formatLeakLocation,
  isMultiLeakPrediction,
  stabilizeActiveLeaks,
} from "../utils/multiLeak.js";
import SensorFaultPanel from "./SensorFaultPanel.jsx";
import LeakStateVisual from "./spline/LeakStateVisual.jsx";
import NormalStateVisual from "./spline/NormalStateVisual.jsx";
import TransitionStateVisual from "./spline/TransitionStateVisual.jsx";

function trackingPct(act, sp, tolerance) {
  const err = Math.abs(sp - act);
  return Math.max(0, Math.min(100, 100 - (err / tolerance) * 100));
}

function rpmTolerance(sp) {
  return Math.max(40, Math.abs(sp) * 0.08);
}

function loadTolerance() {
  return 8;
}

/**
 * @param {{
 *   prediction: object | null;
 *   systemState: object | null;
 *   leakStartMs: number | null;
 *   opRpm?: number;
 *   spRpm?: number;
 *   opLoad?: number;
 *   spLoad?: number;
 *   multiPattern?: object | null;
 *   activeScenario?: string | null;
 * }} props
 */
export default function PredictionPanel({
  prediction,
  systemState,
  leakStartMs,
  opRpm = 0,
  spRpm = 0,
  opLoad = 0,
  spLoad = 0,
  isStreaming = false,
  multiPattern,
  activeScenario = null,
}) {
  const [nowTs, setNowTs] = useState(() => Date.now());
  const detectedAtRef = useRef(null);

  const leakActiveState = prediction?.Leak_Present === 1 && !prediction?.Suppressed;
  const timerAnchorMs = leakStartMs ?? detectedAtRef.current;

  useEffect(() => {
    if (leakActiveState) {
      if (leakStartMs != null) {
        detectedAtRef.current = leakStartMs;
      } else if (detectedAtRef.current == null) {
        detectedAtRef.current = Date.now();
      }
    } else {
      detectedAtRef.current = null;
    }
  }, [leakActiveState, leakStartMs]);

  useEffect(() => {
    const anchor = leakStartMs ?? detectedAtRef.current;
    if (anchor == null) return undefined;
    setNowTs(Date.now());
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [leakStartMs, leakActiveState]);

  const secs =
    timerAnchorMs != null ? Math.max(0, Math.floor((nowTs - timerAnchorMs) / 1000)) : 0;

  if (!prediction || !systemState) {
    return (
      <div className="system-status-card flex min-h-[220px] flex-col items-center justify-center">
        <div className="dash-empty-state border-none bg-transparent">
          <span className="dash-empty-state-icon">⚙</span>
          <span className="dash-empty-state-title">AWAITING FIRST READING</span>
          <span className="dash-empty-state-hint">Hit START STREAMING at the top of the sidebar to activate ML leak detection.</span>
        </div>
      </div>
    );
  }

  const isTransitioning = systemState.state === "TRANSITIONING";
  const multi = multiPattern ?? prediction?.Multi_Pattern ?? null;
  const isMultiLeak = isMultiLeakPrediction(prediction);
  const activeLeaks = stabilizeActiveLeaks(prediction, activeScenario);
  const cardVariant = isTransitioning
    ? "transitioning"
    : systemState.state === "LEAK_DETECTED"
      ? (isMultiLeak ? "multi-leak" : "leak")
      : systemState.color === "amber" || systemState.color === "grey"
        ? "warning"
        : "normal";
  const confVariant = systemState.state === "LEAK_DETECTED"
    ? (isMultiLeak ? "multi-leak" : "leak")
    : systemState.state === "SENSOR_FAULT"
      ? "warning"
      : "normal";
  const conf = Math.min(100, Math.max(0, (systemState.confidence ?? prediction.Confidence_Score ?? 0) * 100));
  const leakActive = systemState.state === "LEAK_DETECTED";
  const isNormal = systemState.state === "NORMAL" || (systemState.color === "green" && !leakActive && !isTransitioning);
  const rpmTrack = trackingPct(opRpm, spRpm, rpmTolerance(spRpm));
  const loadTrack = trackingPct(opLoad, spLoad, loadTolerance());

  if (isNormal) {
    return (
      <div className={`system-status-card compact normal normal-layout`}>
        <div className="normal-holo-stage" aria-hidden>
          <div className="normal-holo-grid" />
          <NormalStateVisual
            opRpm={opRpm}
            opLoad={opLoad}
            isStreaming={isStreaming}
            active={isStreaming}
          />
        </div>
        <div className="status-content normal-status-overlay relative z-10">
          <div className={`status-icon normal`} style={{ marginBottom: 6 }}>
            {systemState.icon}
          </div>
          <h2 className="status-main-label normal">{systemState.title}</h2>
          <p className="status-sub">{systemState.message}</p>
          <div className="normal-live-chips">
            <span className="normal-live-chip mono">{opRpm?.toFixed(0) ?? "—"} RPM</span>
            <span className="normal-live-chip mono">{opLoad?.toFixed(0) ?? "—"}% LOAD</span>
            <span className={`normal-live-chip ${isStreaming ? "normal-live-chip--live" : ""}`}>
              {isStreaming ? "STREAMING" : "PAUSED"}
            </span>
          </div>
          {systemState.confidence != null && (
            <div className="confidence-bar-wrapper max-w-md">
              <span className="confidence-label">CONFIDENCE</span>
              <div className="confidence-track">
                <div className={`confidence-fill normal`} style={{ width: `${conf}%` }} />
              </div>
              <span className="confidence-pct normal">{conf.toFixed(1)}%</span>
            </div>
          )}
          {systemState.action && (
            <span className="mt-2 inline-flex rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-200">
              {formatAction(systemState.action)}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (isTransitioning) {
    return (
      <div className="system-status-card compact transitioning transition-layout">
        <div className="transition-holo-stage" aria-hidden>
          <div className="transition-holo-grid" />
          <div className="transition-stage-shimmer" />
          <TransitionStateVisual
            opRpm={opRpm}
            spRpm={spRpm}
            opLoad={opLoad}
            spLoad={spLoad}
          />
        </div>

        <div className="transition-info">
          <div className="transition-head">
            <span className="transition-badge">STEADY STATE GUARD</span>
            <h2 className="transition-title">{systemState.title}</h2>
            <p className="transition-message">{systemState.message}</p>
          </div>

          <div className="transition-metrics">
            <div className="transition-metric-row">
              <span className="transition-metric-label">RPM TRACK</span>
              <div className="transition-metric-track">
                <div className="transition-metric-fill" style={{ width: `${rpmTrack}%` }} />
              </div>
              <span className="transition-metric-val mono">{rpmTrack.toFixed(0)}%</span>
            </div>
            <div className="transition-metric-row">
              <span className="transition-metric-label">LOAD TRACK</span>
              <div className="transition-metric-track">
                <div className="transition-metric-fill" style={{ width: `${loadTrack}%` }} />
              </div>
              <span className="transition-metric-val mono">{loadTrack.toFixed(0)}%</span>
            </div>
          </div>

          <div className="transition-foot">
            <span className="transition-foot-act mono">
              ACT {opRpm.toFixed(0)} RPM · {opLoad.toFixed(0)}%
            </span>
            <span className="transition-foot-arrow">→</span>
            <span className="transition-foot-sp mono">
              SP {spRpm.toFixed(0)} RPM · {spLoad.toFixed(0)}%
            </span>
          </div>

          <p className="transition-guard-note">
            ML inference paused until operating point settles
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`system-status-card compact ${cardVariant}`} style={{ position: "relative" }}>
      <div className="leak-state-visual">
        <LeakStateVisual
          isLeak={leakActive}
          severity={prediction.Leak_Severity}
          active={isStreaming}
        />
      </div>

      <div className="status-content relative z-10 text-center">
        <div className={`status-icon ${cardVariant === "leak" ? "leak" : cardVariant === "warning" ? "warning" : "normal"}`} style={{ marginBottom: 8 }}>
          {systemState.icon}
        </div>

        <h2 className={`status-main-label ${cardVariant === "leak" ? "leak" : cardVariant === "warning" ? "warning" : "normal"}`}>
          {systemState.title}
        </h2>
        <p className="status-sub">{systemState.message}</p>

        {systemState.subtext && <p className="status-sub">{systemState.subtext}</p>}
        {leakActive && prediction.Physics_Severity?.performance_impact_pct > 0 && (
          <div className="impact-row mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-white/80">
            <span className="impact-label font-semibold text-white/60">Performance Impact:</span>
            <span className="impact-value mono font-bold text-amber-300">
              {Number(prediction.Physics_Severity.performance_impact_pct).toFixed(1)}%
            </span>
            {prediction.Physics_Severity.impact_basis && (
              <span className="impact-basis text-white/50">
                {prediction.Physics_Severity.impact_basis}
              </span>
            )}
          </div>
        )}
        {systemState.correlated && (
          <p className="status-sub mono">Pattern: {systemState.correlated}</p>
        )}
        <div className="leak-live-chips">
          <span className={`leak-live-chip mono${isStreaming ? " leak-live-chip--live" : ""}`}>
            {isStreaming ? "STREAMING" : "PAUSED"}
          </span>
          {systemState.state === "LEAK_DETECTED" && (
            <span className="leak-live-chip mono leak-live-chip--timer">
              Time since detection: {secs}s
            </span>
          )}
        </div>

        {systemState.confidence != null && (
          <div className="confidence-bar-wrapper max-w-md">
            <span className="confidence-label">
              {systemState.confidenceLabel || "CONFIDENCE"}
            </span>
            <div className="confidence-track">
              <div className={`confidence-fill ${confVariant}`} style={{ width: `${conf}%` }} />
            </div>
            <span className={`confidence-pct ${confVariant === "leak" ? "leak" : confVariant === "warning" ? "warning" : "normal"}`}>{conf.toFixed(1)}%</span>
          </div>
        )}

        {systemState.action && (
          <span className="mt-2 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/90">
            {formatAction(systemState.action)}
          </span>
        )}

        {systemState.dqNote && <p className="mt-2 text-[10px] text-white/35">{systemState.dqNote}</p>}
        {systemState.sfi && <SensorFaultPanel sfiData={systemState.sfi} />}
        {prediction.Sensor_Fault_Isolation?.is_confirmed_leak && systemState.state === "LEAK_DETECTED" && (
          <SensorFaultPanel sfiData={prediction.Sensor_Fault_Isolation} />
        )}

        {isMultiLeak && activeLeaks.length >= 2 && (
          <div className="multi-leak-panel">
            {multi?.combo_label && (
              <p className="multi-leak-combo">
                {multi.combo_label.replace(/\+/g, " + ")}
              </p>
            )}
            <div className="multi-leak-grid">
              {activeLeaks.slice(0, 2).map((leak, idx) => (
                <div
                  key={leak.location}
                  className={`multi-leak-card ${idx === 0 ? "multi-leak-card--primary" : "multi-leak-card--secondary"}`}
                  title={multi?.routing_reason || ""}
                >
                  <div className="multi-leak-card-head">
                    <span className="multi-leak-card-role">
                      {idx === 0 ? "Primary Leak" : "Secondary Leak"}
                    </span>
                    <span className="multi-leak-card-severity">
                      {leak.severity || "—"}
                    </span>
                  </div>
                  <p className="multi-leak-card-location">
                    {formatLeakLocation(leak.location)}
                  </p>
                  {leak.confidence != null && (
                    <p className="multi-leak-card-conf">
                      Confidence: {(leak.confidence * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
