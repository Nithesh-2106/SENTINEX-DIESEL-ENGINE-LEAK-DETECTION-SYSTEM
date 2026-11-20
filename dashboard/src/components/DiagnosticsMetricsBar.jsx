import React from "react";

const LIVE_SENSORS = [
  { key: "Boost_Pressure_kPa", label: "Boost", unit: "kPa", normal: 111.7 },
  { key: "Exhaust_Manifold_Temp_C", label: "Exh", unit: "°C", normal: 680 },
  { key: "EGR_Flow_Rate_kgph", label: "EGR", unit: "kg/h", normal: 58.0 },
  { key: "CAC_Pressure_Drop_kPa", label: "CAC ΔP", unit: "kPa", normal: 5.0 },
];

function getScenario(prediction) {
  if (!prediction) return "idle";
  if (prediction.Suppressed) return "transitioning";
  if (prediction.Sensor_Fault_Isolation?.is_sensor_fault) return "fault";
  if (prediction.Leak_Present === 1) return "leak";
  if ((prediction.Data_Quality?.score ?? 100) < 90) return "degraded";
  return "normal";
}

function shortModel(label) {
  if (!label || label === "—") return "—";
  const name = label.split("(")[0].trim();
  return name.length > 12 ? name.slice(0, 12) : name;
}

function confidenceTone(prediction, scenario) {
  const conf = prediction?.Confidence_Score;
  if (conf == null) return "muted";
  if (scenario === "leak") return conf >= 0.85 ? "leak" : "warning";
  if (scenario === "fault" || scenario === "transitioning") return "warning";
  return "normal";
}

function dqTone(score) {
  if (score >= 90) return "normal";
  if (score >= 70) return "warning";
  return "danger";
}

function sensorTone(val, normal) {
  if (val == null) return "muted";
  const dev = Math.abs(((val - normal) / normal) * 100);
  if (dev > 20) return "danger";
  if (dev > 10) return "warning";
  return "normal";
}

function MetricItem({ label, value, mono, tone = "default" }) {
  return (
    <span className={`chat-metric-item chat-metric-tone-${tone}`}>
      <span className="chat-metric-item-label">{label}</span>
      <span className={`chat-metric-item-value ${mono ? "mono" : ""}`}>{value}</span>
    </span>
  );
}

export default function DiagnosticsMetricsBar({
  latestPrediction,
  liveReadings,
  isStreaming,
  dqpScore = 100,
  activeModelMetric = "—",
  opRpm,
  opLoad,
  readingCount = 0,
}) {
  const scenario = getScenario(latestPrediction);
  const confidence = latestPrediction?.Confidence_Score != null
    ? `${(latestPrediction.Confidence_Score * 100).toFixed(0)}%`
    : "—";

  return (
    <div className={`chat-metrics-bar chat-metrics-scenario-${scenario} shrink-0`}>
      <div className="chat-metrics-inline">
        <MetricItem label="Conf" value={confidence} mono tone={confidenceTone(latestPrediction, scenario)} />
        <span className="chat-metrics-sep" aria-hidden />
        <MetricItem label="Model" value={shortModel(activeModelMetric)} tone="info" />
        <span className="chat-metrics-sep" aria-hidden />
        <MetricItem label="RPM" value={opRpm != null ? opRpm.toFixed(0) : "—"} mono tone={opRpm != null ? "default" : "muted"} />
        <span className="chat-metrics-sep" aria-hidden />
        <MetricItem label="Load" value={opLoad != null ? `${opLoad.toFixed(0)}%` : "—"} mono tone={opLoad != null ? "default" : "muted"} />
        <span className="chat-metrics-sep" aria-hidden />
        <MetricItem label="DQ" value={`${dqpScore}`} mono tone={dqTone(dqpScore)} />
        <span className="chat-metrics-sep" aria-hidden />
        <MetricItem label="N" value={String(readingCount)} mono tone="default" />
        <span className="chat-metrics-sep chat-metrics-sep-wide" aria-hidden />
        {LIVE_SENSORS.map(({ key, label, unit, normal }) => {
          const val = liveReadings?.[key];
          return (
            <React.Fragment key={key}>
              <MetricItem
                label={label}
                value={val != null ? `${val.toFixed(1)} ${unit}` : "—"}
                mono
                tone={sensorTone(val, normal)}
              />
              <span className="chat-metrics-sep" aria-hidden />
            </React.Fragment>
          );
        })}
      </div>
      <span className={`chat-metric-stream ${isStreaming ? "live" : "paused"}`}>
        <span className="chat-metric-stream-dot" />
        {isStreaming ? "Live" : "Paused"}
      </span>
    </div>
  );
}
