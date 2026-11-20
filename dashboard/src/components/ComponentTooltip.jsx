import React, { useMemo } from "react";
import {
  COMPONENT_SENSOR_MAP,
  LEAK_ORIGIN_COMPONENT,
  getBaseline,
  deviationColour,
  signedDeviationPct,
} from "../constants/sensorDefinitions.js";
import { formatSensorValue } from "../digitalTwin/formatSensorValue.js";

export default function ComponentTooltip({
  visible,
  componentKey,
  position,
  liveReadings,
  baselines,
  shapData,
  leakLocation,
}) {
  const meta = useMemo(
    () => (componentKey ? COMPONENT_SENSOR_MAP[componentKey] : null),
    [componentKey],
  );

  const rows = useMemo(() => {
    if (!meta) return [];
    return meta.sensors
      .filter((s) => liveReadings?.[s.key] !== undefined && liveReadings?.[s.key] !== null)
      .map((sensor) => {
        const currentValue = liveReadings[sensor.key];
        const baseline = getBaseline(sensor.key, baselines) ?? sensor.baseline;
        const devPct = signedDeviationPct(currentValue, baseline);
        const shapEntry = shapData?.find((e) => e.sensor === sensor.key);
        const shapScore = shapEntry != null ? Math.abs(Number(shapEntry.shap_impact) || 0) : null;
        const col = deviationColour(currentValue, baseline);
        const fmt = formatSensorValue(sensor.key, currentValue, sensor.unit);
        return { sensor, currentValue, baseline, devPct, shapScore, col, fmt };
      });
  }, [meta, liveReadings, baselines, shapData]);

  if (!visible || !meta || !position || rows.length === 0) return null;

  const originKey = LEAK_ORIGIN_COMPONENT[leakLocation];
  const isLeakOrigin = originKey === componentKey;

  const tooltipW = 160;
  let left = position.x + 12;
  let top = position.y + 12;
  if (typeof window !== "undefined") {
    const h = 36 + rows.length * 18;
    if (left + tooltipW > window.innerWidth) left = position.x - tooltipW - 12;
    if (top + h > window.innerHeight) top = position.y - h - 12;
  }

  return (
    <div
      style={{
        position: "fixed",
        left,
        top,
        width: tooltipW,
        zIndex: 1000,
        pointerEvents: "none",
        background: "rgba(8, 12, 20, 0.95)",
        border: `1px solid ${isLeakOrigin ? "#E24B4A" : "rgba(255,255,255,0.15)"}`,
        borderRadius: 6,
        padding: "8px 10px",
        fontFamily: "'Share Tech Mono', monospace",
        boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
      }}
    >
      <div style={{
        fontSize: 10,
        fontWeight: "bold",
        color: isLeakOrigin ? "#E24B4A" : "#fff",
        marginBottom: 6,
        letterSpacing: "0.06em",
      }}>
        {meta.displayName.toUpperCase()}
        {isLeakOrigin && <span style={{ marginLeft: 6, fontSize: 8 }}>⚠ LEAK</span>}
      </div>

      {rows.map(({ sensor, col, fmt, devPct, shapScore }) => (
        <div
          key={sensor.key}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 6,
            fontSize: 9,
            marginBottom: 3,
            lineHeight: 1.3,
          }}
        >
          <span style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>{sensor.label}</span>
          <span style={{ color: col, fontWeight: "bold", textAlign: "right" }}>
            {fmt.valueText}{fmt.unitText ? ` ${fmt.unitText}` : ""}
            {shapScore > 0.001 && (
              <span style={{ color: "#EF9F27", marginLeft: 4, fontSize: 8 }}>↑</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
