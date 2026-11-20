import React, { useEffect, useMemo, useRef } from "react";
import useThemeTokens from "../hooks/useThemeTokens.js";
import {
  buildSensorGroups,
  buildSensorShortLabels,
  mergeSensorHealthData,
  getActiveSensorCount,
} from "../utils/sensorHealthMerge.js";

const SENSOR_GROUPS = buildSensorGroups();
const SENSOR_SHORT_LABELS = buildSensorShortLabels();

const STATUS_COLOURS = {
  OK: "#3DAA8A",
  WATCH: "#C4922A",
  FAULT: "#C44B4A",
  STALE: "#8B7AB8",
  LEAK_SIGNAL: "#0D9488",
};

function statusLabel(status) {
  if (status === "LEAK_SIGNAL") return "LEAK";
  return status;
}

function sensorUnit(key) {
  if (key.endsWith("_kPa") || key.endsWith("_P")) return "kPa";
  if (key.endsWith("_Temp_C") || key.endsWith("_C")) return "°C";
  if (key.endsWith("_RPM")) return "RPM";
  if (key.endsWith("_kgph")) return "kg/h";
  if (key.endsWith("_Pct")) return "%";
  if (key.endsWith("_lph")) return "L/h";
  if (key.includes("Ratio")) return "";
  return "";
}

function formatSensorValue(value, key) {
  if (value == null || Number.isNaN(value)) return "—";
  const unit = sensorUnit(key);
  const abs = Math.abs(value);
  const decimals = abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 10 ? 1 : 2;
  const formatted = value.toFixed(decimals);
  return unit ? `${formatted} ${unit}` : formatted;
}

function driftColour(pct, status) {
  if (status === "LEAK_SIGNAL") return STATUS_COLOURS.LEAK_SIGNAL;
  const abs = Math.abs(pct ?? 0);
  if (abs < 2) return STATUS_COLOURS.OK;
  if (abs < 5) return STATUS_COLOURS.WATCH;
  return STATUS_COLOURS.FAULT;
}

function SensorHealthSkeleton() {
  return (
    <div className="sensor-health-dashboard sensor-health-dashboard--loading">
      <div className="sh-skeleton-bar" />
      <div className="sh-skeleton-grid">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="sh-skeleton-cell" />
        ))}
      </div>
    </div>
  );
}

function MiniSparkline({ data, colour, height = 20 }) {
  const canvasRef = useRef(null);
  const { isDark } = useThemeTokens();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length < 2) return;

    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const points = data.map((v, i) => ({
      x: (i / (data.length - 1)) * W,
      y: H - ((v - min) / range) * H * 0.8 - H * 0.1,
    }));

    const zeroY = H - ((0 - min) / range) * H * 0.8 - H * 0.1;
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(W, zeroY);
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)";
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(points[0].x, H);
    points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, H);
    ctx.closePath();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
  }, [data, colour, height, isDark]);

  return (
    <canvas
      ref={canvasRef}
      width={80}
      height={height}
      style={{ width: "100%", height, display: "block" }}
    />
  );
}

function HealthScoreRing({ score }) {
  const { isDark } = useThemeTokens();
  const colour =
    score >= 90 ? STATUS_COLOURS.OK : score >= 70 ? STATUS_COLOURS.WATCH : STATUS_COLOURS.FAULT;
  const circumference = 2 * Math.PI * 28;
  const strokeDash = (score / 100) * circumference;

  return (
    <div className="sh-score-ring">
      <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden>
        <circle
          cx="36"
          cy="36"
          r="28"
          fill="none"
          stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.08)"}
          strokeWidth="4"
        />
        <circle
          cx="36"
          cy="36"
          r="28"
          fill="none"
          stroke={colour}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${strokeDash} ${circumference}`}
          strokeDashoffset={circumference * 0.25}
          style={{
            filter: `drop-shadow(0 0 6px ${colour})`,
            transition: "stroke-dasharray 1s ease",
          }}
        />
        <text
          x="36"
          y="40"
          textAnchor="middle"
          fill={colour}
          fontSize="15"
          fontWeight="700"
          fontFamily="JetBrains Mono, monospace"
        >
          {score}
        </text>
      </svg>
      <div className="sh-score-label">HEALTH</div>
    </div>
  );
}

function StatusCount({ label, count, colour }) {
  return (
    <div className={`sh-status-count-item ${colour}`}>
      <span className={`sh-sc-value ${colour}`}>{count}</span>
      <span className={`sh-sc-label ${colour}`}>{label}</span>
    </div>
  );
}

function InfoButton({ onClick, title = "View sensor details" }) {
  return (
    <button
      type="button"
      className="sh-info-btn"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick?.(e);
      }}
      title={title}
      aria-label={title}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <circle cx="5" cy="5" r="4.25" fill="none" stroke="currentColor" strokeWidth="0.9" />
        <path d="M5 4.2V7.2M5 2.8h.01" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
      </svg>
    </button>
  );
}

const HEALTH_GUIDE_SECTIONS = [
  {
    title: "What this monitor tracks",
    body:
      "Every active sensor channel is compared against engine-specific physics baselines (C7: 40 active, C13/C15: 42). Each reading updates drift %, rolling average drift, peak drift, fault history from Sensor Fault Isolation (SFI), and simulated calibration age.",
  },
  {
    title: "How drift is calculated",
    body:
      "Drift % = ((current value − baseline) / baseline) × 100. Rolling drift is the mean of the last 20 readings. Status thresholds: OK < 2%, WATCH 2–5%, FAULT > 5% or active SFI fault in the last 5 minutes.",
  },
  {
    title: "Health score (0–100)",
    body:
      "Weighted across all active sensors: OK = 100 pts, WATCH = 70, STALE (overdue calibration) = 50, FAULT = 0. The ring gauge and sidebar summary reflect this composite score.",
  },
  {
    title: "Calibration & engine variants",
    body:
      "Calibration age is simulated per sensor type (pressure 7d, temperature 14d, flow 7d, speed 30d). STALE flags when age exceeds 1.5× schedule. CAT C7 excludes SCR aftertreatment sensors (no SCR hardware on that variant).",
  },
  {
    title: "When data resets",
    body:
      "Health history is session-persistent and resets when streaming restarts, or when engine/scenario changes. Polls the backend every 2 seconds while this tab is open.",
  },
];

function HealthGuideModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sh-guide-backdrop" onClick={onClose} role="presentation">
      <div className="sh-guide-modal liquid-glass-panel" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="sh-guide-header">
          <div>
            <span className="sh-guide-eyebrow">How it works</span>
            <h2 className="sh-guide-title">Sensor Health Monitor</h2>
          </div>
          <button type="button" className="sh-detail-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="sh-guide-body">
          {HEALTH_GUIDE_SECTIONS.map((s) => (
            <section key={s.title} className="sh-guide-section">
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function SensorHealthCell({ sensorKey, data, label, isSelected, onClick, onInfo }) {
  const {
    status,
    current_value,
    rolling_drift_pct,
    fault_count,
    calibration_age_days,
    calibration_schedule_days,
    drift_history,
  } = data;

  const statusColour = STATUS_COLOURS[status] || "rgba(255,255,255,0.45)";
  const driftCol = driftColour(rolling_drift_pct, status);
  const isCalDue = calibration_age_days > calibration_schedule_days;
  const reading = formatSensorValue(current_value, sensorKey);

  return (
    <div
      className={`sh-cell status-${status.toLowerCase()} ${isSelected ? "selected" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      title={`${label} — ${reading}`}
    >
      <div className="sh-cell-top">
        <span className="sh-cell-status-pill" style={{ color: statusColour, borderColor: statusColour }}>
          {statusLabel(status)}
        </span>
        <InfoButton onClick={onInfo} title={`${label} — full sensor details`} />
      </div>
      <div className="sh-cell-name">{label}</div>
      <div className="sh-cell-value">{reading}</div>
      <div className="sh-cell-drift" style={{ color: driftCol }}>
        Δ {rolling_drift_pct >= 0 ? "+" : ""}
        {rolling_drift_pct.toFixed(1)}%
      </div>
      <MiniSparkline data={drift_history} colour={driftCol} height={16} />
      <div className="sh-cell-badges">
        {fault_count > 0 && <span className="sh-badge fault">{fault_count} FLT</span>}
        {isCalDue && <span className="sh-badge stale">CAL DUE</span>}
      </div>
    </div>
  );
}

function SensorHealthDetailPanel({ sensorKey, data, label, onClose }) {
  const {
    status,
    current_value,
    baseline,
    current_drift_pct,
    rolling_drift_pct,
    peak_drift_pct,
    fault_count,
    last_fault_type,
    calibration_age_days,
    calibration_schedule_days,
    drift_history,
    reading_count,
  } = data;

  const isCalDue = calibration_age_days > calibration_schedule_days;

  const statusMessages = {
    OK: "Sensor operating within normal parameters.",
    WATCH: "Rolling drift exceeds 2%. Monitor for further deviation. No immediate action required.",
    FAULT:
      "Active fault condition. Verify sensor connection and inspect for damage. Cross-check reading with adjacent sensors.",
    LEAK_SIGNAL:
      "Sensor deviating in line with a confirmed leak signature. Hardware is likely healthy — this reading reflects the active leak condition.",
    STALE: `Calibration overdue by ${calibration_age_days - calibration_schedule_days} days. Schedule calibration before next test cycle.`,
  };

  const reading = formatSensorValue(current_value, sensorKey);
  const baselineFormatted = formatSensorValue(baseline, sensorKey);

  return (
    <div className="sh-detail-panel">
      <div className="sh-detail-header">
        <div>
          <div className="sh-detail-title" id="sh-detail-title">{label}</div>
          <div className="sh-detail-key">{sensorKey}</div>
        </div>
        <button type="button" className="sh-detail-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className={`sh-detail-status-banner status-${status.toLowerCase()}`}>
        <span className="sh-detail-status-pill">{statusLabel(status)}</span>
        <span>{statusMessages[status]}</span>
      </div>

      <div className="sh-detail-reading-row">
        <div className="sh-detail-reading-main">
          <span className="sh-dm-label">LIVE READING</span>
          <span className="sh-detail-reading-value mono">{reading}</span>
        </div>
        <div className="sh-detail-reading-baseline">
          <span className="sh-dm-label">BASELINE</span>
          <span className="sh-dm-value mono">{baselineFormatted}</span>
        </div>
      </div>

      <div className="sh-detail-metrics">
        <div className="sh-detail-metric">
          <span className="sh-dm-label">RAW VALUE</span>
          <span className="sh-dm-value mono">{current_value?.toFixed(3) ?? "—"}</span>
        </div>
        <div className="sh-detail-metric">
          <span className="sh-dm-label">BASELINE RAW</span>
          <span className="sh-dm-value mono">{baseline ?? "—"}</span>
        </div>
        <div className="sh-detail-metric">
          <span className="sh-dm-label">DRIFT NOW</span>
          <span className="sh-dm-value mono" style={{ color: driftColour(current_drift_pct) }}>
            {current_drift_pct >= 0 ? "+" : ""}
            {current_drift_pct?.toFixed(2)}%
          </span>
        </div>
        <div className="sh-detail-metric">
          <span className="sh-dm-label">ROLLING (20)</span>
          <span className="sh-dm-value mono">
            {rolling_drift_pct >= 0 ? "+" : ""}
            {rolling_drift_pct?.toFixed(2)}%
          </span>
        </div>
        <div className="sh-detail-metric">
          <span className="sh-dm-label">PEAK DRIFT</span>
          <span className="sh-dm-value mono">
            {peak_drift_pct >= 0 ? "+" : ""}
            {peak_drift_pct?.toFixed(2)}%
          </span>
        </div>
        <div className="sh-detail-metric">
          <span className="sh-dm-label">FAULTS</span>
          <span
            className="sh-dm-value mono"
            style={{ color: fault_count > 0 ? STATUS_COLOURS.FAULT : STATUS_COLOURS.OK }}
          >
            {fault_count}
            {last_fault_type && ` (${last_fault_type})`}
          </span>
        </div>
        <div className="sh-detail-metric">
          <span className="sh-dm-label">LAST CALIB</span>
          <span
            className="sh-dm-value mono"
            style={{ color: isCalDue ? STATUS_COLOURS.WATCH : "rgba(255,255,255,0.72)" }}
          >
            {calibration_age_days}d ago
            {isCalDue ? " ⚠ OVERDUE" : ""}
          </span>
        </div>
        <div className="sh-detail-metric">
          <span className="sh-dm-label">READINGS</span>
          <span className="sh-dm-value mono">{reading_count}</span>
        </div>
      </div>

      <div className="sh-detail-chart-label">DRIFT HISTORY (last 60 readings)</div>
      <div style={{ padding: "0 16px 12px" }}>
        <MiniSparkline
          data={drift_history}
          colour={driftColour(rolling_drift_pct)}
          height={50}
        />
      </div>

      {isCalDue && (
        <div className="sh-detail-cal-warning">
          ⚠ Calibration due: last calibration {calibration_age_days} days ago (schedule: every{" "}
          {calibration_schedule_days} days). Accuracy may be reduced. Do not use for certification
          testing until recalibrated.
        </div>
      )}
    </div>
  );
}

function SensorHealthList({ sensors, labels, onSensorClick, onSensorInfo, selectedSensor }) {
  const ORDER = { FAULT: 0, STALE: 1, LEAK_SIGNAL: 2, WATCH: 3, OK: 4 };

  const rows = Object.entries(sensors)
    .filter(([, d]) => !d.is_excluded)
    .sort(([, a], [, b]) => ORDER[a.status] - ORDER[b.status]);

  return (
    <div className="sh-list-view">
      <table className="sh-table">
        <thead>
          <tr>
            <th>SENSOR</th>
            <th>STATUS</th>
            <th>READING</th>
            <th>CURRENT DRIFT</th>
            <th>ROLLING (20)</th>
            <th>PEAK</th>
            <th>FAULTS</th>
            <th>LAST CALIB</th>
            <th>TREND</th>
            <th aria-label="Details" />
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, data]) => {
            const isCalDue = data.calibration_age_days > data.calibration_schedule_days;
            const statusColour = STATUS_COLOURS[data.status] || "rgba(255,255,255,0.45)";

            return (
              <tr
                key={key}
                className={`sh-table-row status-${data.status.toLowerCase()} ${selectedSensor === key ? "selected" : ""}`}
                onClick={() => onSensorClick(key)}
              >
                <td className="sh-table-sensor-name">
                  {labels[key] || key}
                  <span className="sh-table-key">{key}</span>
                </td>
                <td>
                  <span
                    className="sh-status-pill"
                    style={{ color: statusColour, borderColor: statusColour }}
                  >
                    {data.status}
                  </span>
                </td>
                <td className="mono sh-table-reading">
                  {formatSensorValue(data.current_value, key)}
                </td>
                <td className="mono" style={{ color: driftColour(data.current_drift_pct) }}>
                  {data.current_drift_pct >= 0 ? "+" : ""}
                  {data.current_drift_pct?.toFixed(2)}%
                </td>
                <td className="mono">
                  {data.rolling_drift_pct >= 0 ? "+" : ""}
                  {data.rolling_drift_pct?.toFixed(2)}%
                </td>
                <td className="mono">
                  {data.peak_drift_pct >= 0 ? "+" : ""}
                  {data.peak_drift_pct?.toFixed(2)}%
                </td>
                <td
                  className="mono"
                  style={{
                    color: data.fault_count > 0 ? STATUS_COLOURS.FAULT : "rgba(255,255,255,0.45)",
                  }}
                >
                  {data.fault_count}
                  {data.last_fault_type && (
                    <span className="sh-fault-type">{data.last_fault_type}</span>
                  )}
                </td>
                <td
                  className="mono"
                  style={{ color: isCalDue ? STATUS_COLOURS.WATCH : "rgba(255,255,255,0.45)" }}
                >
                  {data.calibration_age_days}d
                  {isCalDue && " ⚠"}
                </td>
                <td>
                  <MiniSparkline
                    data={data.drift_history.slice(-20)}
                    colour={statusColour}
                    height={20}
                  />
                </td>
                <td>
                  <InfoButton onClick={(e) => onSensorInfo?.(key, e)} title={`${labels[key] || key} details`} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SensorHealthCritical({ sensors, labels, onSensorClick, onSensorInfo, selectedSensor }) {
  const critical = Object.entries(sensors).filter(
    ([, d]) => !d.is_excluded && d.status !== "OK"
  );

  if (critical.length === 0) {
    return (
      <div className="sh-all-ok">
        <div className="sh-all-ok-icon">✓</div>
        <div className="sh-all-ok-text">All sensors operating within normal parameters</div>
        <div className="sh-all-ok-sub">No faults, warnings, or calibration issues detected</div>
      </div>
    );
  }

  return (
    <div className="sh-critical-view">
      {critical.map(([key, data]) => (
        <SensorHealthCell
          key={key}
          sensorKey={key}
          data={data}
          label={labels[key] || key}
          isSelected={selectedSensor === key}
          onClick={() => onSensorClick(key)}
          onInfo={(e) => onSensorInfo?.(key, e)}
        />
      ))}
    </div>
  );
}

export default function SensorHealthDashboard({
  engineId = "CAT_C13",
  isVisible = true,
  healthData = null,
  loading = false,
}) {
  const [selectedSensor, setSelectedSensor] = React.useState(null);
  const [detailSensor, setDetailSensor] = React.useState(null);
  const [viewMode, setViewMode] = React.useState("matrix");
  const [guideOpen, setGuideOpen] = React.useState(false);

  useEffect(() => {
    if (!detailSensor) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setDetailSensor(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailSensor]);

  const mergedHealth = useMemo(
    () => mergeSensorHealthData(healthData, engineId),
    [healthData, engineId],
  );

  const openSensorDetail = (key, e) => {
    setSelectedSensor(key);
    setDetailSensor(key);
    const row = e?.currentTarget?.closest?.(".sh-cell, .sh-table-row");
    row?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  };

  const handleSensorClick = (key) => {
    setSelectedSensor(key);
    setDetailSensor(key);
  };

  const closeSensorDetail = () => setDetailSensor(null);

  if (!isVisible) return null;
  if (loading || !mergedHealth) return <SensorHealthSkeleton />;

  const { health_score, status_counts, sensors } = mergedHealth;
  const activeCount = getActiveSensorCount(engineId);

  return (
    <div className="sensor-health-dashboard">
      <div className="sh-header">
        <div className="sh-title-group">
          <span className="sh-title">SENSOR HEALTH MONITOR</span>
          <span className="sh-engine-badge">{engineId} · {activeCount} sensors</span>
          <span className="sh-live-dot" aria-hidden />
        </div>
        <div className="sh-view-toggle">
          <button
            type="button"
            className="sh-guide-btn"
            onClick={() => setGuideOpen(true)}
            title="How sensor health monitoring works"
            aria-label="How sensor health monitoring works"
          >
            <svg width="12" height="12" viewBox="0 0 10 10" aria-hidden>
              <circle cx="5" cy="5" r="4.25" fill="none" stroke="currentColor" strokeWidth="0.9" />
              <path d="M5 4.2V7.2M5 2.8h.01" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
            </svg>
          </button>
          {["matrix", "list", "critical"].map((mode) => (
            <button
              key={mode}
              type="button"
              className={`sh-view-btn ${viewMode === mode ? "active" : ""}`}
              onClick={() => setViewMode(mode)}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="sh-score-bar">
        <HealthScoreRing score={health_score} />
        <div className="sh-status-counts">
          <StatusCount label="OK" count={status_counts.OK} colour="ok" />
          <StatusCount label="WATCH" count={status_counts.WATCH} colour="warn" />
          <StatusCount label="FAULT" count={status_counts.FAULT} colour="fault" />
          <StatusCount label="LEAK" count={status_counts.LEAK_SIGNAL || 0} colour="leak" />
          <StatusCount label="STALE" count={status_counts.STALE} colour="stale" />
        </div>
        <div className="sh-summary-note">
          {status_counts.FAULT > 0
            ? `${status_counts.FAULT} sensor(s) require immediate attention`
            : (status_counts.LEAK_SIGNAL || 0) > 0
              ? `${status_counts.LEAK_SIGNAL} sensor(s) showing leak signal`
              : status_counts.WATCH > 0
                ? `${status_counts.WATCH} sensor(s) showing elevated drift — monitor`
                : "All sensors within normal operating parameters"}
        </div>
      </div>

      {engineId === "CAT_C7" && (
        <div className="sh-engine-note">
          ⓘ CAT C7: SCR aftertreatment sensors excluded (no SCR system on this engine variant)
        </div>
      )}

      <div className={`sh-content-layout${detailSensor ? " sh-content-layout--detail-open" : ""}`}>
        <div className="sh-main-column">
          {viewMode === "matrix" && (
            <div className="sh-matrix-view">
              {Object.entries(SENSOR_GROUPS).map(([groupName, sensorKeys]) => {
                const activeSensors = sensorKeys.filter(
                  (key) => sensors[key] && !sensors[key].is_excluded
                );
                if (activeSensors.length === 0) return null;

                return (
                  <div key={groupName} className="sh-group">
                    <div className="sh-group-label">{groupName}</div>
                    <div className="sh-group-grid">
                      {activeSensors.map((key) => (
                        <SensorHealthCell
                          key={key}
                          sensorKey={key}
                          data={sensors[key]}
                          label={SENSOR_SHORT_LABELS[key] || key}
                          isSelected={selectedSensor === key}
                          onClick={() => handleSensorClick(key)}
                          onInfo={(e) => openSensorDetail(key, e)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {viewMode === "list" && (
            <SensorHealthList
              sensors={sensors}
              labels={SENSOR_SHORT_LABELS}
              onSensorClick={handleSensorClick}
              onSensorInfo={openSensorDetail}
              selectedSensor={selectedSensor}
            />
          )}

          {viewMode === "critical" && (
            <SensorHealthCritical
              sensors={sensors}
              labels={SENSOR_SHORT_LABELS}
              onSensorClick={handleSensorClick}
              onSensorInfo={openSensorDetail}
              selectedSensor={selectedSensor}
            />
          )}
        </div>

        {detailSensor && sensors[detailSensor] && (
          <aside className="sh-detail-rail" role="dialog" aria-labelledby="sh-detail-title">
            <SensorHealthDetailPanel
              sensorKey={detailSensor}
              data={sensors[detailSensor]}
              label={SENSOR_SHORT_LABELS[detailSensor]}
              onClose={closeSensorDetail}
            />
          </aside>
        )}
      </div>

      <HealthGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
