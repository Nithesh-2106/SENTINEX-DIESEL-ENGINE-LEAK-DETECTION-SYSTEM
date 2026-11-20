import React, { useEffect, useMemo, useRef } from "react";
import { EVENT_META, formatElapsed } from "../utils/sessionTimeline.js";
import { isHeadRole } from "../utils/testerRegistry.js";

function ShapMiniList({ prediction }) {
  const drivers = prediction?.top_5_sensors_driving_prediction || [];
  if (!drivers.length) return <p className="playback-detail__empty">No SHAP drivers recorded</p>;
  return (
    <ul className="playback-detail__shap-list">
      {drivers.slice(0, 5).map((d) => (
        <li key={d.sensor}>
          <span className="playback-detail__shap-name">{(d.sensor || "").replace(/_/g, " ")}</span>
          <span className={`playback-detail__shap-val ${Number(d.deviation_pct) < 0 ? "neg" : "pos"}`}>
            {d.deviation_pct != null ? `${Number(d.deviation_pct).toFixed(1)}%` : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SensorMiniGrid({ reading }) {
  if (!reading) return <p className="playback-detail__empty">No sensor frame stored</p>;
  const keys = [
    "Pre_Compressor_Pressure_kPa",
    "Post_Compressor_Pressure_kPa",
    "Pre_Turbine_Pressure_kPa",
    "Post_Turbine_Pressure_kPa",
    "Engine_Speed_Actual_RPM",
    "Engine_Load_Actual_Pct",
  ];
  return (
    <div className="playback-detail__sensor-grid">
      {keys.map((k) => (
        <div key={k} className="playback-detail__sensor-cell">
          <span className="playback-detail__sensor-key">{k.replace(/_/g, " ")}</span>
          <span className="playback-detail__sensor-val mono">
            {reading[k] != null ? Number(reading[k]).toFixed(1) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

function PlaybackDetail({ event, sessionStartMs, onClose, onReturnLive, onMirrorBay, isHead }) {
  const pred = event?.frame?.prediction;
  const reading = event?.frame?.reading;
  const meta = EVENT_META[event?.type] || { label: event?.type, color: "change" };

  return (
    <div className={`playback-detail playback-detail--${meta.color}`}>
      <div className="playback-detail__head">
        <div>
          <span className={`playback-detail__type playback-detail__type--${meta.color}`}>{meta.label}</span>
          <h4 className="playback-detail__title">{event.label}</h4>
          <p className="playback-detail__sub">
            {formatElapsed(event.ts, sessionStartMs)} elapsed
            {event.readingNo != null && <> · Reading #{event.readingNo}</>}
            {event.bayId && <> · {event.bayId}</>}
            {isHead && event.displayName && <> · {event.displayName}</>}
          </p>
          {event.summary && <p className="playback-detail__summary">{event.summary}</p>}
        </div>
        <div className="playback-detail__actions">
          {isHead && event.role && onMirrorBay && (
            <button type="button" className="playback-detail__btn" onClick={() => onMirrorBay(event.role)}>
              Mirror bay
            </button>
          )}
          <button type="button" className="playback-detail__btn playback-detail__btn--live" onClick={onReturnLive}>
            Return to LIVE
          </button>
          <button type="button" className="playback-detail__btn playback-detail__btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <div className="playback-detail__grid">
        <div className="playback-detail__panel">
          <span className="playback-detail__panel-label">Prediction at moment</span>
          {pred ? (
            <div className="playback-detail__pred">
              <div className="playback-detail__pred-row">
                <span>Leak</span>
                <strong>{pred.Leak_Present === 1 ? (pred.Leak_Location || "Detected").replace(/_/g, " ") : "None"}</strong>
              </div>
              <div className="playback-detail__pred-row">
                <span>Severity</span>
                <strong>{pred.Leak_Severity || "—"}</strong>
              </div>
              <div className="playback-detail__pred-row">
                <span>Confidence</span>
                <strong>
                  {pred.Confidence_Score != null ? `${(pred.Confidence_Score * 100).toFixed(1)}%` : "—"}
                </strong>
              </div>
              <div className="playback-detail__pred-row">
                <span>DQ score</span>
                <strong>{pred.Data_Quality?.score ?? "—"}</strong>
              </div>
              <div className="playback-detail__pred-row">
                <span>Action</span>
                <strong>{(pred.Recommended_Action || "—").replace(/_/g, " ")}</strong>
              </div>
            </div>
          ) : (
            <p className="playback-detail__empty">No prediction snapshot</p>
          )}
        </div>

        <div className="playback-detail__panel">
          <span className="playback-detail__panel-label">Top SHAP drivers</span>
          <ShapMiniList prediction={pred} />
        </div>

        <div className="playback-detail__panel playback-detail__panel--wide">
          <span className="playback-detail__panel-label">Sensor readings</span>
          <SensorMiniGrid reading={reading} />
        </div>
      </div>
    </div>
  );
}

export default function AnomalyTimeline({
  role,
  markers = [],
  sessionStartMs,
  selectedEventId = null,
  playbackActive = false,
  onSelectEvent,
  onReturnLive,
  onMirrorBay,
  overviewMode = false,
  embedded = false,
}) {
  const scrollRef = useRef(null);
  const isHead = isHeadRole(role);

  const trackWidthPx = useMemo(
    () => Math.max(960, markers.length * 56),
    [markers.length],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !markers.length) return;
    el.scrollLeft = el.scrollWidth;
  }, [markers.length, markers[markers.length - 1]?.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [markers.length]);

  const selected = useMemo(
    () => markers.find((m) => m.id === selectedEventId) || null,
    [markers, selectedEventId],
  );

  const axisTicks = useMemo(() => {
    if (!markers.length) return [0, 25, 50, 75, 100];
    const span = Math.max(markers[markers.length - 1].ts - sessionStartMs, 60000);
    const maxMin = Math.max(1, Math.ceil(span / 60000));
    const ticks = [];
    for (let i = 0; i <= Math.min(maxMin, 6); i += 1) {
      ticks.push((i / Math.max(maxMin, 1)) * 100);
    }
    return ticks.length > 1 ? ticks : [0, 50, 100];
  }, [markers, sessionStartMs]);

  const counts = useMemo(() => {
    const c = {};
    markers.forEach((m) => {
      c[m.type] = (c[m.type] || 0) + 1;
    });
    return c;
  }, [markers]);

  const spanMs = markers.length
    ? Math.max(markers[markers.length - 1].ts - sessionStartMs, 60000)
    : 60000;

  return (
    <div className={`anomaly-timeline liquid-glass-panel ${playbackActive ? "anomaly-timeline--playback" : ""} ${embedded ? "anomaly-timeline--embedded" : ""}`}>
      <div className="anomaly-timeline__header">
        <div className="anomaly-timeline__header-main">
          <span className="anomaly-timeline__eyebrow">Session playback</span>
          <h3 className="anomaly-timeline__title">Anomaly Timeline</h3>
          {!embedded && (
            <p className="anomaly-timeline__desc">
              {overviewMode
                ? "All bays — leak detections, SSG suppressions, setpoint changes, sensor faults, and DQ flags"
                : "Full test session history — click any marker to replay prediction, SHAP, and sensors at that moment"}
            </p>
          )}
        </div>
        <div className="anomaly-timeline__legend">
          {Object.entries(EVENT_META).map(([type, meta]) => (
            counts[type] ? (
              <span key={type} className={`anomaly-timeline__legend-item anomaly-timeline__legend-item--${meta.color}`}>
                {meta.label} ({counts[type]})
              </span>
            ) : null
          ))}
        </div>
        {playbackActive && (
          <button type="button" className="anomaly-timeline__live-btn" onClick={onReturnLive}>
            ● LIVE
          </button>
        )}
      </div>

      {selected && (
        <PlaybackDetail
          event={selected}
          sessionStartMs={sessionStartMs}
          onClose={() => onSelectEvent?.(null)}
          onReturnLive={onReturnLive}
          onMirrorBay={onMirrorBay}
          isHead={isHead}
        />
      )}

      <div className="anomaly-timeline__track-wrap" ref={scrollRef}>
        {markers.length > 0 && (
          <div className="anomaly-timeline__scroll-hint">Scroll horizontally →</div>
        )}
        {markers.length === 0 ? (
          <div className="anomaly-timeline__empty">
            <span>No session events yet.</span>
            <span className="anomaly-timeline__empty-hint">Start streaming on a tester bay to build the timeline.</span>
          </div>
        ) : (
          <div
            className="anomaly-timeline__track"
            style={{ width: `${trackWidthPx}px`, minWidth: `${trackWidthPx}px` }}
          >
            <div className="anomaly-timeline__axis">
              {axisTicks.map((pct) => (
                <span
                  key={pct}
                  className="anomaly-timeline__tick"
                  style={{ left: `${pct}%` }}
                >
                  {formatElapsed(sessionStartMs + (pct / 100) * spanMs, sessionStartMs)}
                </span>
              ))}
            </div>
            <div className="anomaly-timeline__rail" />
            <div className="anomaly-timeline__markers">
              {markers.map((m) => {
                const meta = m.meta || EVENT_META[m.type] || { color: "change", label: m.type };
                const isSelected = m.id === selectedEventId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`anomaly-timeline__marker anomaly-timeline__marker--${meta.color} ${isSelected ? "selected" : ""}`}
                    style={{ left: `${Math.min(98, Math.max(0, m.pct))}%` }}
                    title={`${m.displayName ? `${m.displayName} · ` : ""}${m.label}${m.summary ? ` — ${m.summary}` : ""}`}
                    onClick={() => onSelectEvent?.(m)}
                  >
                    <span className="anomaly-timeline__marker-dot" />
                    <span className="anomaly-timeline__marker-label">{meta.label}</span>
                    {overviewMode && m.bayId && (
                      <span className="anomaly-timeline__marker-bay">{m.bayId}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
