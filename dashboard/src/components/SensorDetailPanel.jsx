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

export default function SensorDetailPanel({
  sensorKey,
  liveReadings,
  baselines,
  shapData,
  sfiMeta = null,
  onClose,
  holoAnalysisOpen = false,
}) {
  const def = sensorKey ? SENSOR_DEFINITIONS[sensorKey] : null;
  const comp = def ? COMPONENT_SENSOR_MAP[def.component] : null;
  const categoryColour = def ? (COMPONENT_COLOURS[def.component] ?? "#5F5E5A") : "#5F5E5A";

  const shapInfo = useMemo(() => {
    if (!sensorKey || !shapData) return null;
    const idx = shapData.findIndex((e) => e.sensor === sensorKey);
    if (idx < 0) return null;
    return {
      score: Math.abs(Number(shapData[idx].shap_impact) || 0),
      rank: idx + 1,
    };
  }, [sensorKey, shapData]);

  const sfiExplanation = useMemo(
    () => buildSfiFaultExplanation(sfiMeta, { sensorKey }),
    [sfiMeta, sensorKey],
  );

  if (!sensorKey || !def) return null;

  const val = liveReadings?.[sensorKey];
  const baseline = getBaseline(sensorKey, baselines);
  const devPct = signedDeviationPct(val, baseline);
  const col = deviationColour(val, baseline);
  const fmt = formatSensorValue(sensorKey, val, def.unit);
  const baseFmt = formatSensorValue(sensorKey, baseline, def.unit);

  return (
    <div
      className={[
        "sensor-detail-panel",
        "liquid-glass-card",
        holoAnalysisOpen ? "sensor-detail-panel--holo" : "",
        sfiExplanation ? "sensor-detail-panel--sfi" : "",
      ].filter(Boolean).join(" ")}
      style={{ "--detail-accent": sfiExplanation ? "#f59e0b" : categoryColour }}
    >
      <button
        type="button"
        onClick={onClose}
        className="sensor-detail-panel__close"
        aria-label="Close"
      >
        ×
      </button>

      <div className="sensor-detail-panel__category">{comp?.displayName?.toUpperCase()}</div>
      <div className="sensor-detail-panel__title">{def.fullLabel}</div>

      <div className="sensor-detail-panel__value" style={{ color: col }}>
        {val != null ? `${fmt.valueText}${fmt.unitText ? ` ${fmt.unitText}` : ""}` : "—"}
      </div>

      <div className="sensor-detail-panel__row">
        <span>Normal</span>
        <span>{baseFmt.valueText}{baseFmt.unitText ? ` ${baseFmt.unitText}` : ""}</span>
      </div>
      <div className="sensor-detail-panel__row">
        <span>Current</span>
        <span style={{ color: col }}>{fmt.valueText}{fmt.unitText ? ` ${fmt.unitText}` : ""}</span>
      </div>
      {devPct != null && (
        <div className="sensor-detail-panel__deviation" style={{ color: col }}>
          Deviation: {devPct >= 0 ? "+" : ""}{devPct.toFixed(1)}%
        </div>
      )}

      {sfiExplanation ? (
        <div className="sensor-detail-panel__sfi">
          <div className="sensor-detail-panel__sfi-title">Why SFI flagged this sensor</div>
          <div className="sensor-detail-panel__sfi-headline">{sfiExplanation.headline}</div>
          <div className="sensor-detail-panel__sfi-body">{sfiExplanation.detail}</div>
          {sfiExplanation.confidencePct != null && (
            <div className="sensor-detail-panel__sfi-conf">
              SFI fault confidence: {sfiExplanation.confidencePct}%
              <span>Leak confidence intentionally 0% — no cascade confirmed</span>
            </div>
          )}
        </div>
      ) : shapInfo ? (
        <div className="sensor-detail-panel__shap">
          <div style={{ color: "#EF9F27", fontWeight: "bold" }}>SHAP impact: {shapInfo.score.toFixed(4)}</div>
          <div style={{ color: "rgba(255,255,255,0.6)", marginTop: 2 }}>Rank in prediction: #{shapInfo.rank} of 5</div>
          <div style={{ color: "#EF9F27", marginTop: 4, fontStyle: "italic" }}>
            This sensor is driving the current prediction
          </div>
        </div>
      ) : null}

      <div className="sensor-detail-panel__desc">{def.physicalDescription}</div>
    </div>
  );
}
