import React, { useMemo } from "react";
import {
  SENSOR_DEFINITIONS,
  COMPONENT_SENSOR_MAP,
  getBaseline,
  deviationColour,
  signedDeviationPct,
} from "../constants/sensorDefinitions.js";
import { formatSensorValue } from "../digitalTwin/formatSensorValue.js";
import { COMPONENT_COLOURS } from "../digitalTwin/sensorPanelConfig.js";
import { buildSfiFaultExplanation } from "../utils/sfiExplanation.js";

export default function SensorHoverTooltip({
  sensorKey,
  position,
  liveReadings,
  baselines,
  shapData,
  sfiMeta = null,
}) {
  const def = sensorKey ? SENSOR_DEFINITIONS[sensorKey] : null;

  const shapVal = useMemo(() => {
    if (!sensorKey || !shapData) return 0;
    const row = shapData.find((e) => e.sensor === sensorKey);
    return row ? Math.abs(Number(row.shap_impact) || 0) : 0;
  }, [sensorKey, shapData]);

  const sfiExplanation = useMemo(
    () => buildSfiFaultExplanation(sfiMeta, { sensorKey }),
    [sfiMeta, sensorKey],
  );

  if (!sensorKey || !def || !position) return null;

  const comp = COMPONENT_SENSOR_MAP[def.component];
  const categoryColour = COMPONENT_COLOURS[def.component] ?? "#5F5E5A";
  const val = liveReadings?.[sensorKey];
  const baseline = getBaseline(sensorKey, baselines);
  const devPct = signedDeviationPct(val, baseline);
  const valueColour = deviationColour(val, baseline);
  const fmt = formatSensorValue(sensorKey, val, def.unit);
  const baseFmt = formatSensorValue(sensorKey, baseline, def.unit);

  const left = Math.min(position.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 268);
  const top = Math.max(12, position.y - 12);

  return (
    <div
      className="sensor-hover-tooltip"
      style={{
        left,
        top,
        "--tooltip-accent": categoryColour,
      }}
      role="tooltip"
    >
      <div className="sensor-hover-tooltip__category">{comp?.displayName?.toUpperCase()}</div>
      <div className="sensor-hover-tooltip__title">{def.shortLabel}</div>
      <div className="sensor-hover-tooltip__row">
        <span>Value</span>
        <strong style={{ color: valueColour }}>
          {val != null ? `${fmt.valueText}${fmt.unitText ? ` ${fmt.unitText}` : ""}` : "—"}
        </strong>
      </div>
      <div className="sensor-hover-tooltip__row">
        <span>Baseline</span>
        <span>{baseFmt.valueText}{baseFmt.unitText ? ` ${baseFmt.unitText}` : ""}</span>
      </div>
      {devPct != null && (
        <div className="sensor-hover-tooltip__row">
          <span>Deviation</span>
          <strong style={{ color: valueColour }}>
            {devPct >= 0 ? "+" : ""}{devPct.toFixed(1)}%
          </strong>
        </div>
      )}
      {sfiExplanation ? (
        <div className="sensor-hover-tooltip__sfi">
          <div className="sensor-hover-tooltip__sfi-label">Why SFI flagged this</div>
          <div className="sensor-hover-tooltip__sfi-text">{sfiExplanation.shortDetail}</div>
        </div>
      ) : (
        <div className="sensor-hover-tooltip__row">
          <span>SHAP Impact</span>
          <strong style={{ color: shapVal > 0.1 ? "#EF9F27" : "#1D9E75" }}>
            {shapVal.toFixed(4)}
          </strong>
        </div>
      )}
    </div>
  );
}
