import React from "react";
import { formatMultiLeakSummary, isMultiLeakPrediction } from "../../utils/multiLeak.js";

const OVERVIEW_LABELS = {
  alert: "LEAK SIGNATURE ACTIVE",
  idle: "ALL BAYS OFFLINE",
  ready: "ALL BAYS READY",
  nominal: "CELL MONITORING",
};

export default function StatusBar({
  latestPrediction,
  opRpm,
  opLoad,
  opAmbientPressure,
  spRpm,
  spLoad,
  spAmbient,
  engineId,
  readingCount,
  isStreaming = false,
  presentationMode = false,
  mirrorWaiting = false,
  mirrorBayName = null,
  bayId = null,
  viewerName = null,
  headOverviewMode = false,
  overviewStats = null,
  activeScenario = null,
  faultInjectionActive = false,
  faultInjectionPreset = null,
}) {
  const streamIdle = !mirrorWaiting && !headOverviewMode && !isStreaming;
  const sfiMeta = latestPrediction?.Sensor_Fault_Isolation;
  const sensorFaultActive = !streamIdle && !mirrorWaiting && !headOverviewMode
    && (Boolean(sfiMeta?.is_sensor_fault) || faultInjectionActive);
  const leakActive = !streamIdle && !mirrorWaiting && !headOverviewMode
    && latestPrediction?.Leak_Present === 1 && !latestPrediction?.Suppressed;
  const isMultiLeak = leakActive && isMultiLeakPrediction(latestPrediction);
  const multiSummary = isMultiLeak ? formatMultiLeakSummary(latestPrediction, activeScenario) : null;
  const faultConfidence = sensorFaultActive && sfiMeta?.fault_confidence != null
    ? (sfiMeta.fault_confidence * 100).toFixed(1)
    : null;
  const confidence = latestPrediction?.Confidence_Score != null
    ? (latestPrediction.Confidence_Score * 100).toFixed(1)
    : null;
  const faultSensorLabel = sfiMeta?.faulty_sensor
    ? sfiMeta.faulty_sensor.replace(/_/g, " ")
    : faultInjectionPreset?.label || "sensor";
  const leakLocation = (latestPrediction?.Leak_Location || "").replace(/_/g, " ");

  const spChanged = !mirrorWaiting && !headOverviewMode && (
    Math.abs(spRpm - opRpm) > 1 ||
    Math.abs(spLoad - opLoad) > 0.5 ||
    Math.abs(spAmbient - opAmbientPressure) > 0.1
  );

  const engineLabel = engineId ? engineId.replace(/_/g, " ") : "—";
  const bayLabel = bayId || "—";
  const viewerLabel = viewerName ? `${viewerName.toUpperCase()} · ` : "";

  const overviewState = overviewStats?.cellState || "idle";
  const overviewLabel = OVERVIEW_LABELS[overviewState] || "CELL OVERVIEW";

  const overviewLeak = headOverviewMode && overviewState === "alert";

  return (
    <div className={`statusbar liquid-glass-bar ${leakActive || overviewLeak ? "leak-active" : ""} ${sensorFaultActive ? "sensor-fault-active" : ""} ${headOverviewMode ? "statusbar--overview" : ""} ${presentationMode ? "statusbar--present" : ""}`}>
      {!presentationMode && (
        <div className="statusbar-left">
          <span className="sb-live-strip" aria-hidden>
            <span className="sb-live-strip__beam" />
          </span>
          <span className="sb-label">OPERATING POINT</span>
          {headOverviewMode ? (
            <span className="sb-value mono sb-muted">
              Supervisor · {overviewStats?.online ?? 0}/{overviewStats?.total ?? 0} bays online
            </span>
          ) : mirrorWaiting ? (
            <span className="sb-value mono sb-muted">No live feed</span>
          ) : (
            <>
              <span className="sb-value mono">
                ACT {opRpm?.toFixed(0) ?? "—"} RPM / {opLoad?.toFixed(0) ?? "—"}% / {opAmbientPressure?.toFixed(1) ?? "—"} kPa
              </span>
              {spChanged && (
                <>
                  <span className="sb-arrow">→</span>
                  <span className="sb-value mono sb-sp">
                    SP {spRpm?.toFixed(0)} RPM / {spLoad?.toFixed(0)}% / {spAmbient?.toFixed(1)} kPa
                  </span>
                </>
              )}
            </>
          )}
        </div>
      )}
      <div className="statusbar-center">
        {headOverviewMode ? (
          overviewState === "alert" ? (
            <span className="sb-leak-badge">
              <span className="sb-leak-dot" />
              {overviewStats?.leakCount ?? 0} BAY LEAK{overviewStats?.leakCount === 1 ? "" : "S"} ACTIVE
            </span>
          ) : (
            <span className={`sb-overview-badge sb-overview-badge--${overviewState}`}>
              <span className="sb-overview-dot" />
              {overviewLabel}
            </span>
          )
        ) : mirrorWaiting ? (
          <span className="sb-offline-badge">
            <span className="sb-offline-dot" />
            {mirrorBayName ? `${mirrorBayName.toUpperCase()} OFFLINE` : "BAY OFFLINE"}
          </span>
        ) : streamIdle ? (
          <span className="sb-paused-badge">
            <span className="sb-paused-dot" />
            {readingCount > 0 ? "STREAM PAUSED" : "AWAITING STREAM"}
          </span>
        ) : sensorFaultActive ? (
          <span className="sb-sensor-fault-badge">
            <span className="sb-sensor-fault-dot" />
            {presentationMode
              ? "SENSOR ANOMALY"
              : `SENSOR FAULT: ${faultSensorLabel}${faultConfidence != null ? ` | ${faultConfidence}%` : ""}`}
          </span>
        ) : leakActive ? (
          <span className={`sb-leak-badge ${isMultiLeak ? "sb-leak-badge--multi" : ""}`}>
            <span className="sb-leak-dot" />
            {presentationMode
              ? isMultiLeak ? "MULTI-LEAK DETECTED" : "ANOMALY DETECTED"
              : isMultiLeak
                ? `MULTI-LEAK: ${multiSummary || leakLocation}${confidence != null ? ` | ${confidence}%` : ""}`
                : `LEAK: ${leakLocation}${confidence != null ? ` | ${confidence}%` : ""}`}
          </span>
        ) : (
          <span className="sb-normal-badge">
            <span className="sb-normal-dot" />
            {presentationMode ? "NOMINAL OPERATION" : "NORMAL OPERATION"}
          </span>
        )}
      </div>
      {!presentationMode && (
        <div className="statusbar-right">
          <span className="sb-readings mono">
            {headOverviewMode
              ? `OVERVIEW · ${overviewStats?.totalReadings ?? 0} READINGS · ${overviewStats?.streaming ?? 0} STREAMING`
              : `${viewerLabel}${bayLabel} · ENGINE ${engineLabel} · #${mirrorWaiting ? "—" : readingCount}`}
          </span>
        </div>
      )}
    </div>
  );
}
