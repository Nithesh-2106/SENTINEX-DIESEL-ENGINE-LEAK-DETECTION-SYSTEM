import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { COMPONENT_SENSOR_MAP } from "../digitalTwin/componentSensorMap.js";
import { formatSensorValue } from "../digitalTwin/formatSensorValue.js";
import {
  getSensorBaseline,
  resolveSensorPosition,
} from "../digitalTwin/sensor3dPositions.js";
import {
  deviationColor,
  deviationPct,
  DEVIATION_COLORS,
  PRIMARY_SENSOR_KEYS,
} from "../digitalTwin/sensorCardConfig.js";

function signedDeviationPct(value, baseline) {
  if (value == null || baseline == null || baseline === 0) return null;
  return ((Number(value) - baseline) / Math.abs(baseline)) * 100;
}

function SensorDetailPanel({
  visible,
  mode,
  sensorKey,
  componentKey,
  screenPos,
  liveReadings,
  baselines,
  shapData,
  sensorDefs,
}) {
  if (!visible) return null;

  const shapEntry = shapData?.find((e) => e.sensor === sensorKey);
  const shapVal = shapEntry ? Math.abs(Number(shapEntry.shap_impact) || 0) : 0;

  let panelStyle = {
    position: "fixed",
    zIndex: 9999,
    width: 260,
    background: "rgba(8, 12, 20, 0.97)",
    borderRadius: 8,
    padding: "12px 14px",
    pointerEvents: "none",
    boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
    transition: "transform 0.15s ease, opacity 0.15s ease",
    opacity: visible ? 1 : 0,
    fontFamily: "'Share Tech Mono', monospace",
    color: "#e2e8f0",
  };

  const dotX = screenPos?.x ?? window.innerWidth / 2;
  const dotY = screenPos?.y ?? window.innerHeight / 2;

  if (dotX < window.innerWidth / 2) {
    panelStyle.left = `${dotX + 80}px`;
  } else {
    panelStyle.right = `${window.innerWidth - dotX + 80}px`;
  }
  panelStyle.top = `${Math.min(Math.max(dotY - 60, 20), window.innerHeight - 280)}px`;

  const borderColor = mode === "component" && componentKey
    ? deviationColor(
        liveReadings?.[PRIMARY_SENSOR_KEYS[componentKey]],
        getSensorBaseline(PRIMARY_SENSOR_KEYS[componentKey], baselines)
      )
    : deviationColor(
        liveReadings?.[sensorKey],
        getSensorBaseline(sensorKey, baselines)
      );
  panelStyle.border = `1px solid ${borderColor}`;

  if (mode === "sensor" && sensorKey) {
    const sdef = sensorDefs?.find((s) => s.id === sensorKey);
    const meta = resolveSensorPosition(sensorKey, sdef);
    const comp = COMPONENT_SENSOR_MAP[meta?.componentKey];
    const unit = sdef?.unit || comp?.sensors.find((s) => s.key === sensorKey)?.unit || "";
    const label = meta?.label || sdef?.label || sensorKey;
    const val = liveReadings?.[sensorKey];
    const baseline = getSensorBaseline(sensorKey, baselines);
    const fmt = formatSensorValue(sensorKey, val, unit);
    const baseFmt = baseline != null ? formatSensorValue(sensorKey, baseline, unit) : null;
    const signed = signedDeviationPct(val, baseline);
    const devCol = signed == null ? DEVIATION_COLORS.none
      : signed > 0 ? DEVIATION_COLORS.alert : DEVIATION_COLORS.ok;

    return createPortal(
      <div style={panelStyle}>
        <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 11, color: borderColor, marginBottom: 8 }}>
          {label}
          <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 9, marginLeft: 8 }}>
            {comp?.displayName}
          </span>
        </div>
        <Row label="Value" value={`${fmt.valueText}${fmt.unitText ? ` ${fmt.unitText}` : ""}`} valueColor={deviationColor(val, baseline)} bold />
        {baseFmt && <Row label="Normal" value={`${baseFmt.valueText}${baseFmt.unitText ? ` ${baseFmt.unitText}` : ""}`} />}
        {signed != null && (
          <Row
            label="Δ"
            value={`${signed >= 0 ? "+" : ""}${signed.toFixed(1)}%`}
            valueColor={devCol}
            bold
            large
          />
        )}
        {shapVal > 0 && (
          <Row label="SHAP" value={`${shapVal.toFixed(4)} ↑ driving prediction`} valueColor="#EF9F27" />
        )}
        {meta?.physical && (
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontStyle: "italic", marginTop: 8 }}>
            Located at: {meta.physical}
          </div>
        )}
      </div>,
      document.body
    );
  }

  if (mode === "component" && componentKey) {
    const comp = COMPONENT_SENSOR_MAP[componentKey];
    if (!comp) return null;
    const border = deviationColor(
      liveReadings?.[PRIMARY_SENSOR_KEYS[componentKey]],
      getSensorBaseline(PRIMARY_SENSOR_KEYS[componentKey], baselines)
    );

    return createPortal(
      <div style={{ ...panelStyle, border: `1px solid ${border}` }}>
        <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 11, color: border, marginBottom: 8 }}>
          {comp.displayName}
        </div>
        <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "rgba(255,255,255,0.4)", textAlign: "left" }}>
              <th style={{ paddingBottom: 4 }}>Sensor</th>
              <th>Value</th>
              <th>Δ%</th>
            </tr>
          </thead>
          <tbody>
            {comp.sensors.map((s) => {
              const val = liveReadings?.[s.key];
              const fmt = formatSensorValue(s.key, val, s.unit);
              const pct = deviationPct(val, s.baseline);
              return (
                <tr key={s.key} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "4px 0", color: "rgba(255,255,255,0.55)" }}>{s.label}</td>
                  <td style={{ color: deviationColor(val, s.baseline) }}>
                    {fmt.valueText}{fmt.unitText ? ` ${fmt.unitText}` : ""}
                  </td>
                  <td style={{ color: deviationColor(val, s.baseline) }}>
                    {pct != null ? `${pct.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>,
      document.body
    );
  }

  return null;
}

function Row({ label, value, valueColor = "#e2e8f0", bold = false, large = false }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: large ? 13 : 11 }}>
      <span style={{ color: "rgba(255,255,255,0.45)" }}>{label}</span>
      <span style={{ color: valueColor, fontWeight: bold ? "bold" : "normal" }}>{value}</span>
    </div>
  );
}

export default function SensorModeOverlay({
  visible,
  labelPositions,
  connectorLines,
  hoveredSensorKey,
  hoveredComponentKey,
  sensorScreenPos,
  liveReadings,
  baselines,
  shapData,
  sensorDefs,
  onLabelEnter,
  onLabelLeave,
}) {
  useEffect(() => {
    if (!visible) return undefined;
    return () => {};
  }, [visible]);

  if (!visible) return null;

  const detailVisible = !!(hoveredSensorKey || hoveredComponentKey);
  const detailMode = hoveredSensorKey ? "sensor" : "component";
  const detailComponent = hoveredComponentKey;
  const brightKey = hoveredSensorKey
    || connectorLines?.find((l) => l.componentKey === hoveredComponentKey)?.sensorKey;

  return (
    <>
      {/* Connector lines */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 28 }}>
        {connectorLines?.map((line) => {
          const len = Math.hypot(line.endX - line.startX, line.endY - line.startY);
          const angle = Math.atan2(line.endY - line.startY, line.endX - line.startX) * (180 / Math.PI);
          const isBright = line.sensorKey === brightKey;
          return (
            <div
              key={line.componentKey}
              style={{
                position: "absolute",
                left: line.startX,
                top: line.startY,
                width: len,
                height: 1,
                background: isBright ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.25)",
                transformOrigin: "left center",
                transform: `rotate(${angle}deg)`,
                transition: "background 0.15s ease",
              }}
            />
          );
        })}
      </div>

      {/* Transparent floating labels */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 29 }}>
        {labelPositions?.map((lp) => (
          <div
            key={lp.componentKey}
            style={{
              position: "absolute",
              left: lp.x,
              top: lp.y,
              transform: "translate(-50%, -50%)",
              pointerEvents: "auto",
            }}
            onMouseEnter={() => onLabelEnter(lp.componentKey)}
            onMouseLeave={onLabelLeave}
          >
            <div
              style={{
                background: "rgba(0,0,0,0)",
                border: `1px solid ${lp.borderColor}`,
                borderRadius: 4,
                padding: "4px 8px",
                whiteSpace: "nowrap",
                fontSize: 11,
                color: "#fff",
                textShadow: "0 0 4px black, 0 0 8px black",
                fontFamily: "'Share Tech Mono', monospace",
                transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                boxShadow: hoveredComponentKey === lp.componentKey
                  ? `0 0 10px ${lp.borderColor}88` : "none",
              }}
            >
              {lp.text}
            </div>
          </div>
        ))}
      </div>

      <SensorDetailPanel
        visible={detailVisible}
        mode={detailMode}
        sensorKey={hoveredSensorKey}
        componentKey={detailComponent}
        screenPos={sensorScreenPos}
        liveReadings={liveReadings}
        baselines={baselines}
        shapData={shapData}
        sensorDefs={sensorDefs}
      />
    </>
  );
}
