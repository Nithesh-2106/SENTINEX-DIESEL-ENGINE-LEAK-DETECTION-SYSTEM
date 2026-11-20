import React, { useMemo } from "react";
import { formatSensorValue } from "../digitalTwin/formatSensorValue.js";
import { deviationColour } from "../constants/sensorDefinitions.js";
import { getHologramPartAnalysis } from "../digitalTwin/hologramMode.js";
import { formatLeakLocation } from "../utils/multiLeak.js";
import { buildSfiFaultExplanation } from "../utils/sfiExplanation.js";

function SensorFaultBlock({ explanation, confidencePct }) {
  if (!explanation) return null;
  return (
    <div style={{
      background: "rgba(245,158,11,0.12)",
      border: "1px solid rgba(245,158,11,0.45)",
      borderRadius: 4,
      padding: "8px 10px",
      marginBottom: 10,
      fontSize: 10,
      color: "#fcd34d",
      lineHeight: 1.55,
    }}>
      <div style={{ fontWeight: "bold", marginBottom: 4, color: "#fbbf24", letterSpacing: 0.5 }}>
        WHY SFI FLAGGED THIS SENSOR
      </div>
      <div style={{ color: "#fde68a", marginBottom: 4 }}>{explanation.headline}</div>
      <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 9 }}>{explanation.detail}</div>
      {confidencePct != null && (
        <div style={{ marginTop: 6, fontSize: 9, color: "#fbbf24" }}>
          SFI fault confidence: {confidencePct}%
        </div>
      )}
    </div>
  );
}

function LeakOriginBlock({ role, location, severity, confidence }) {
  const isSecondary = role === "secondary";
  const borderCol = isSecondary ? "#a855f7" : "#ff3355";
  const bgCol = isSecondary ? "rgba(168,85,247,0.15)" : "rgba(255,51,85,0.15)";
  const textCol = isSecondary ? "#c4b5fd" : "#ff6688";
  const title = isSecondary ? "SECONDARY LEAK ORIGIN" : role === "both" ? "DUAL LEAK ORIGIN" : "PRIMARY LEAK ORIGIN";

  return (
    <div style={{
      background: bgCol,
      border: `1px solid ${borderCol}`,
      borderRadius: 4,
      padding: "8px 10px",
      marginBottom: 10,
      fontSize: 10,
      color: textCol,
      lineHeight: 1.5,
    }}>
      <div style={{ fontWeight: "bold", marginBottom: 4 }}>{title} — PHYSICS CONFIRMED</div>
      <div>{formatLeakLocation(location)}</div>
      {confidence != null && <div style={{ marginTop: 4 }}>ML Confidence: {confidence.toFixed(1)}%</div>}
      {severity && <div style={{ color: "#ffaa22" }}>Severity: {severity}</div>}
    </div>
  );
}

function RcaBlock({ causes, accent = "#ff3355" }) {
  if (!causes?.length) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 9, color: accent, letterSpacing: 1, marginBottom: 6, fontWeight: "bold" }}>
        ROOT CAUSE — RANKED
      </div>
      {causes.map((cause, i) => (
        <div key={cause.id || i} style={{
          background: i === 0 ? `${accent}22` : "rgba(255,255,255,0.03)",
          border: `1px solid ${i === 0 ? accent : "rgba(255,255,255,0.1)"}`,
          borderRadius: 4,
          padding: "8px 10px",
          marginBottom: 6,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: i === 0 ? accent : "#ccc", fontWeight: "bold" }}>
              #{i + 1} {cause.label}
            </span>
            <span style={{ fontSize: 9, color: "#ffaa22" }}>
              {(cause.probability * 100).toFixed(0)}%
            </span>
          </div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.55)", lineHeight: 1.45, marginBottom: 4 }}>
            {cause.physicalReasoning}
          </div>
          <div style={{ fontSize: 8, color: "#00d4ff" }}>
            Inspect: {cause.inspectAction}
          </div>
          {cause.tool && (
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
              Tool: {cause.tool}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function HologramAnalysisPanel({
  componentKey,
  liveReadings,
  baselines,
  shapData,
  leakLocation,
  secondaryLeakLocation = null,
  leakSeverity,
  secondaryLeakSeverity = null,
  confidence,
  secondaryConfidence = null,
  rcaResult,
  secondaryRcaResult = null,
  primaryShap = null,
  secondaryShap = null,
  isDragging,
  onResetPart,
  onResetAll,
  onClose,
  sfiMeta = null,
  faultyComponentKey = null,
}) {
  const multiOptions = secondaryLeakLocation
    ? {
        primaryLocation: leakLocation,
        secondaryLocation: secondaryLeakLocation,
        primaryRca: rcaResult,
        secondaryRca: secondaryRcaResult,
        primaryShap: primaryShap || shapData,
        secondaryShap: secondaryShap,
        primarySeverity: leakSeverity,
        secondarySeverity: secondaryLeakSeverity,
        primaryConfidence: confidence,
        secondaryConfidence,
      }
    : null;

  const analysis = useMemo(
    () => getHologramPartAnalysis(
      componentKey,
      liveReadings,
      baselines,
      shapData,
      leakLocation,
      rcaResult,
      multiOptions,
      faultyComponentKey ? { faultyComponentKey, faultySensorKey: sfiMeta?.faulty_sensor } : null,
    ),
    [
      componentKey,
      liveReadings,
      baselines,
      shapData,
      leakLocation,
      secondaryLeakLocation,
      rcaResult,
      secondaryRcaResult,
      primaryShap,
      secondaryShap,
      leakSeverity,
      secondaryLeakSeverity,
      confidence,
      secondaryConfidence,
      faultyComponentKey,
      sfiMeta?.faulty_sensor,
    ],
  );

  const sfiExplanation = useMemo(() => {
    if (!sfiMeta?.is_sensor_fault || componentKey !== faultyComponentKey) return null;
    return buildSfiFaultExplanation(sfiMeta, { sensorKey: sfiMeta.faulty_sensor });
  }, [sfiMeta, componentKey, faultyComponentKey]);

  if (!analysis) return null;

  const { holoStatus } = analysis;
  const isSensorFaultPart = holoStatus.status === "SENSOR_FAULT" || Boolean(sfiExplanation);
  const borderCol = holoStatus.color;
  const displaySeverity = analysis.contextSeverity ?? leakSeverity;
  const displayConfidence = analysis.contextConfidence ?? confidence;

  return (
    <div
      className={`hologram-analysis-panel ${isDragging ? "holo-panel-dragging" : "holo-panel-enter"}`}
      style={{ "--holo-accent": borderCol }}
    >
      <div className="hologram-analysis-panel__header">
        <div className="hologram-analysis-panel__title">HOLOGRAM DEEP ANALYSIS</div>
        {onClose && (
          <button
            type="button"
            className="hologram-analysis-panel__close"
            onClick={onClose}
            aria-label="Close analysis panel"
          >
            ×
          </button>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{
          fontSize: 8,
          padding: "2px 8px",
          borderRadius: 3,
          background: `${borderCol}22`,
          border: `1px solid ${borderCol}`,
          color: borderCol,
          letterSpacing: 1,
        }}>
          {holoStatus.label}
        </span>
        {isDragging && (
          <span style={{ fontSize: 8, color: "#00d4ff", animation: "holo-pulse 1s infinite" }}>
            EXTRACTING…
          </span>
        )}
      </div>

      <div style={{ fontSize: 14, fontWeight: "bold", color: borderCol, marginBottom: 8, textShadow: `0 0 12px ${borderCol}88` }}>
        {analysis.displayName.toUpperCase()}
      </div>

      {sfiExplanation && (
        <SensorFaultBlock
          explanation={sfiExplanation}
          confidencePct={sfiExplanation.confidencePct}
        />
      )}

      {analysis.isLeakOrigin && !isSensorFaultPart && (
        <LeakOriginBlock
          role={analysis.leakRole || "primary"}
          location={analysis.contextLocation}
          severity={displaySeverity}
          confidence={displayConfidence}
        />
      )}

      {analysis.secondaryContext && (
        <LeakOriginBlock
          role="secondary"
          location={analysis.secondaryContext.location}
          severity={analysis.secondaryContext.severity}
          confidence={analysis.secondaryContext.confidence}
        />
      )}

      {analysis.shapPatternSummary && !isSensorFaultPart && (
        <div style={{ fontSize: 9, color: "rgba(0,212,255,0.75)", lineHeight: 1.55, marginBottom: 10, padding: "6px 8px", background: "rgba(0,212,255,0.05)", borderRadius: 4 }}>
          {analysis.shapPatternSummary}
        </div>
      )}

      {analysis.secondaryContext?.shapPatternSummary && (
        <div style={{ fontSize: 9, color: "rgba(168,85,247,0.85)", lineHeight: 1.55, marginBottom: 10, padding: "6px 8px", background: "rgba(168,85,247,0.08)", borderRadius: 4 }}>
          Secondary: {analysis.secondaryContext.shapPatternSummary}
        </div>
      )}

      {analysis.cascadeExplanation && (
        <div style={{ fontSize: 9, color: "#ffaa22", lineHeight: 1.5, marginBottom: 10, fontStyle: "italic" }}>
          Cascade: {analysis.cascadeExplanation}
        </div>
      )}

      <RcaBlock causes={analysis.rcaCauses} accent={analysis.leakRole === "secondary" ? "#a855f7" : "#ff3355"} />

      {analysis.secondaryContext?.rcaCauses?.length > 0 && (
        <RcaBlock causes={analysis.secondaryContext.rcaCauses} accent="#a855f7" />
      )}

      {analysis.isDownstream && !analysis.isLeakOrigin && (
        <div style={{ fontSize: 9, color: "#ffaa22", marginBottom: 8, padding: "4px 8px", background: "rgba(255,170,34,0.1)", borderRadius: 3 }}>
          Downstream of leak — pressure loss propagating through air path
        </div>
      )}

      {analysis.topShap.length > 0 && !isSensorFaultPart && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: "#ffaa22", letterSpacing: 1, marginBottom: 6 }}>SHAP DRIVERS</div>
          {analysis.topShap.map((s) => (
            <div key={s.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 3 }}>
              <span style={{ color: "#aaa" }}>{s.label}</span>
              <span style={{ color: "#ffaa22" }}>{s.shap.toFixed(4)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 9, color: "#00d4ff", letterSpacing: 1, marginBottom: 6 }}>LIVE SENSORS</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {analysis.sensors.slice(0, 8).map((s) => {
          const col = deviationColour(s.val, s.baseline);
          const fmt = formatSensorValue(s.key, s.val, s.unit);
          return (
            <div key={s.key} style={{ background: "rgba(0,212,255,0.04)", border: `1px solid ${col}44`, borderRadius: 4, padding: "5px 8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                <span style={{ color: "#888" }}>{s.label}</span>
                {s.shap > 0 && !isSensorFaultPart && <span style={{ color: "#ffaa22", fontSize: 8 }}>SHAP</span>}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ color: col, fontWeight: "bold", fontSize: 11 }}>
                  {fmt.valueText}{fmt.unitText ? ` ${fmt.unitText}` : ""}
                </span>
                <span style={{ color: col, fontSize: 9 }}>{s.devPct >= 0 ? "+" : ""}{s.devPct.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
        <button type="button" onClick={onResetPart} style={btnStyle("#00d4ff")}>SNAP BACK</button>
        <button type="button" onClick={onResetAll} style={btnStyle("rgba(0,212,255,0.6)")}>RESET ALL</button>
      </div>

      <div style={{ fontSize: 8, color: "rgba(0,212,255,0.4)", marginTop: 10, lineHeight: 1.4 }}>
        Drag to extract · Right-click orbit · Click any part to inspect
      </div>
    </div>
  );
}

function btnStyle(color) {
  return {
    flex: 1,
    padding: "6px 8px",
    fontSize: 9,
    fontFamily: "'Orbitron', monospace",
    letterSpacing: 1,
    cursor: "pointer",
    background: "rgba(0,212,255,0.08)",
    border: `1px solid ${color}`,
    borderRadius: 4,
    color,
  };
}
