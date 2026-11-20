import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { formatSensorValue } from "../digitalTwin/formatSensorValue.js";
import { AIR_PATH_SEQUENCE, LEAK_ORIGIN_COMPONENT } from "../digitalTwin/componentSensorMap.js";
import { resolveSensorPosition } from "../digitalTwin/sensor3dPositions.js";
import {
  PANEL_ORDER,
  PANEL_POSITIONS,
  PANEL_SENSOR_GROUPS,
  COMPONENT_COLOURS,
  deviationColour,
  signedDeviationPct,
  nearestPanelEdgeRay,
  computePanelDimensions,
} from "../digitalTwin/sensorPanelConfig.js";

function formatPanelPosition(componentKey, panelDims) {
  const dp = panelDims?.positions?.[componentKey];
  if (!dp) return PANEL_POSITIONS[componentKey];
  const style = { zIndex: dp.zIndex ?? 310 };
  if (dp.top != null) style.top = `${dp.top}px`;
  if (dp.left != null) style.left = `${dp.left}px`;
  if (dp.right != null) style.right = `${dp.right}px`;
  if (dp.bottom != null) style.bottom = `${dp.bottom}px`;
  return style;
}

function PanelCard({
  componentKey,
  group,
  colour,
  position,
  panelDims,
  readings,
  baselines,
  shapMap,
  shapCount,
  isLeakOrigin,
  isDownstream,
  isExpanded,
  isHovered,
  onToggle,
  onHover,
  panelRef,
}) {
  const borderColour = isLeakOrigin
    ? "#E24B4A"
    : isDownstream
      ? "rgba(239, 159, 39, 0.5)"
      : colour;

  const sensors = group.sensors
    .filter((s) => readings?.[s.key] !== undefined && readings?.[s.key] !== null)
    .map((s) => {
    const val = readings?.[s.key];
    const baseline = baselines?.[s.key] ?? s.baseline;
    const devPct = signedDeviationPct(val, baseline);
    const col = deviationColour(val, baseline);
    const fmt = formatSensorValue(s.key, val, s.unit);
    const shap = shapMap[s.key];
    return { ...s, val, baseline, devPct, col, fmt, shap };
  });

  const maxSensor = sensors.reduce(
    (best, s) => {
      if (s.val == null || Number.isNaN(Number(s.val)) || s.devPct == null) return best;
      const abs = Math.abs(s.devPct);
      if (!best || abs > Math.abs(best.devPct)) return s;
      return best;
    },
    null
  );

  const expandedStyle = isExpanded
    ? {
      top: "50%", left: "50%", right: "auto", bottom: "auto",
      transform: "translate(-50%, -50%)", zIndex: 510,
      maxHeight: "min(45vh, 320px)", overflowY: "auto",
    }
    : {};

  return (
    <div
      ref={panelRef}
      onMouseEnter={() => onHover(componentKey, true)}
      onMouseLeave={() => onHover(componentKey, false)}
      onClick={() => onToggle(componentKey)}
      style={{
        position: "absolute",
        width: panelDims?.maxWidth ?? 172,
        maxHeight: panelDims?.maxHeight ?? 160,
        overflowY: "auto",
        ...position,
        ...expandedStyle,
        background: "rgba(6, 10, 18, 0.88)",
        border: `${isLeakOrigin ? 2 : 1}px solid ${borderColour}`,
        borderRadius: 6,
        padding: "8px 10px",
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: panelDims?.fontSize ?? 10,
        pointerEvents: "auto",
        cursor: "pointer",
        boxShadow: isLeakOrigin ? "0 0 8px rgba(226, 75, 74, 0.4)" : "none",
        zIndex: isExpanded ? 510 : (isLeakOrigin ? 500 : (position.zIndex ?? 200)),
        transition: "box-shadow 0.2s ease, border-color 0.2s ease",
      }}
    >
      {isLeakOrigin && (
        <div style={{ fontSize: 9, color: "#E24B4A", marginBottom: 4, letterSpacing: "0.06em" }}>
          ⚠ LEAK ORIGIN
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: colour, flexShrink: 0 }} />
        <span style={{
          fontSize: 11,
          letterSpacing: "0.08em",
          color: colour,
          fontWeight: "bold",
          flex: 1,
          textTransform: "uppercase",
        }}>
          {group.displayName}
        </span>
        {shapCount > 0 && (
          <span style={{
            fontSize: 9,
            padding: "1px 4px",
            borderRadius: 3,
            background: "rgba(239, 159, 39, 0.2)",
            border: "1px solid #EF9F27",
            color: "#EF9F27",
          }}>
            SHAP {shapCount >= 2 ? "↑↑" : "↑"}
          </span>
        )}
      </div>

      {!isExpanded ? (
        <>
          {sensors.map((s) => (
            <div
              key={s.key}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 6,
                marginBottom: 3,
                fontSize: 10,
              }}
            >
              <span style={{ color: "#888", display: "flex", alignItems: "center", gap: 3 }}>
                {s.shap > 0 && (
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#EF9F27" }} />
                )}
                {s.shortLabel}
              </span>
              <span style={{ color: s.col }}>
                {s.val != null && !Number.isNaN(Number(s.val))
                  ? `${s.fmt.valueText}${s.fmt.unitText ? ` ${s.fmt.unitText}` : ""}`
                  : "—"}
              </span>
            </div>
          ))}
          {maxSensor && (
            <>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 6, marginBottom: 4 }} />
              <div style={{ fontSize: 9, color: maxSensor.col }}>
                Δ max: {maxSensor.shortLabel} {maxSensor.devPct >= 0 ? "+" : ""}{maxSensor.devPct.toFixed(1)}%
              </div>
            </>
          )}
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sensors.map((s) => {
            const meta = resolveSensorPosition(s.key, { id: s.key, label: s.fullLabel });
            const baseFmt = formatSensorValue(s.key, s.baseline, s.unit);
            return (
              <div key={s.key} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 6 }}>
                <div style={{ fontSize: 10, color: "#ccc", marginBottom: 2 }}>{s.fullLabel}</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                  <span style={{ color: "#888" }}>Value</span>
                  <span style={{ color: s.col, fontWeight: "bold" }}>
                    {s.val != null ? `${s.fmt.valueText}${s.fmt.unitText ? ` ${s.fmt.unitText}` : ""}` : "—"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                  <span style={{ color: "#888" }}>Normal</span>
                  <span style={{ color: "#aaa" }}>
                    {baseFmt.valueText}{baseFmt.unitText ? ` ${baseFmt.unitText}` : ""}
                  </span>
                </div>
                {s.devPct != null && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                    <span style={{ color: "#888" }}>Δ</span>
                    <span style={{ color: s.col, fontWeight: "bold" }}>
                      {s.devPct >= 0 ? "+" : ""}{s.devPct.toFixed(1)}%
                    </span>
                  </div>
                )}
                {s.shap > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                    <span style={{ color: "#888" }}>SHAP</span>
                    <span style={{ color: "#EF9F27" }}>{s.shap.toFixed(4)} ↑ driving prediction</span>
                  </div>
                )}
                {meta?.physical && (
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", fontStyle: "italic", marginTop: 4 }}>
                    {meta.physical}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SensorPanelOverlay({
  visible,
  liveReadings,
  baselines,
  shapData,
  leakLocation,
  hasScr = true,
  predictionKey,
  screenAnchors = {},
  onRequestLineUpdate,
}) {
  const containerRef = useRef(null);
  const panelRefs = useRef({});
  const [readings, setReadings] = useState(liveReadings || {});
  const [expanded, setExpanded] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [lines, setLines] = useState([]);
  const [panelDims, setPanelDims] = useState({ maxWidth: 172, maxHeight: 160, fontSize: 10 });
  const readingsRef = useRef(liveReadings);
  readingsRef.current = liveReadings;

  const shapMap = useMemo(() => {
    const m = {};
    (shapData || []).forEach((e) => {
      if (e?.sensor) m[e.sensor] = Math.abs(Number(e.shap_impact) || 0);
    });
    return m;
  }, [shapData]);

  const leakOrigin = leakLocation && leakLocation !== "None"
    ? LEAK_ORIGIN_COMPONENT[leakLocation]
    : null;
  const originIdx = leakOrigin ? AIR_PATH_SEQUENCE.indexOf(leakOrigin) : -1;

  const updateLines = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const next = [];

    PANEL_ORDER.forEach((key) => {
      if (!hasScr && key === "SCR") return;
      const el = panelRefs.current[key];
      const anchor = screenAnchors[key];
      if (!el || !anchor) return;
      const pr = el.getBoundingClientRect();
      const edge = nearestPanelEdgeRay(pr, anchor.x, anchor.y, rect);
      const colour = COMPONENT_COLOURS[key];
      const active = hovered === key || expanded === key;
      next.push({
        key,
        x1: edge.x,
        y1: edge.y,
        x2: anchor.x,
        y2: anchor.y,
        colour,
        opacity: active ? 1.0 : 0.4,
      });
    });
    setLines(next);
  }, [hasScr, hovered, expanded, screenAnchors]);

  useEffect(() => {
    if (!visible) {
      setExpanded(null);
      setHovered(null);
      setLines([]);
      return undefined;
    }
    setReadings(liveReadings || {});
  }, [visible, liveReadings]);

  useEffect(() => {
    if (!visible) return;
    setExpanded(null);
  }, [predictionKey, visible]);

  useEffect(() => {
    if (!visible || !containerRef.current) return undefined;
    const updateDims = () => {
      const rect = containerRef.current.getBoundingClientRect();
      setPanelDims(computePanelDimensions(rect.width, rect.height));
    };
    updateDims();
    const ro = new ResizeObserver(updateDims);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !containerRef.current) return undefined;
    const ro = new ResizeObserver(() => updateLines());
    ro.observe(containerRef.current);
    updateLines();
    return () => ro.disconnect();
  }, [visible, updateLines]);

  useEffect(() => {
    if (visible) updateLines();
  }, [screenAnchors, visible, updateLines]);

  useEffect(() => {
    if (onRequestLineUpdate) onRequestLineUpdate.current = updateLines;
  }, [updateLines, onRequestLineUpdate]);

  if (!visible) return null;

  const panels = PANEL_ORDER.filter((k) => hasScr || k !== "SCR");

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        bottom: 32,
        pointerEvents: "none",
        zIndex: 200,
        overflow: "hidden",
        clipPath: "inset(0)",
      }}
    >
      <svg
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 50,
        }}
      >
        {lines.map((ln) => (
          <line
            key={ln.key}
            x1={ln.x1}
            y1={ln.y1}
            x2={ln.x2}
            y2={ln.y2}
            stroke={ln.colour}
            strokeWidth={1}
            strokeDasharray="4 4"
            opacity={ln.opacity}
            style={{ transition: "opacity 0.2s ease" }}
          />
        ))}
      </svg>

      {panels.map((componentKey) => {
        const group = PANEL_SENSOR_GROUPS[componentKey];
        if (!group) return null;
        const colour = COMPONENT_COLOURS[componentKey];
        const position = formatPanelPosition(componentKey, panelDims);
        const compIdx = AIR_PATH_SEQUENCE.indexOf(componentKey);
        const shapSensors = group.sensors.filter((s) => shapMap[s.key] > 0);
        const isThisExpanded = expanded === componentKey;
        const visibleSensors = group.sensors.filter(
          (s) => readings?.[s.key] !== undefined && readings?.[s.key] !== null,
        );
        if (visibleSensors.length === 0) return null;
        return (
          <PanelCard
            key={componentKey}
            componentKey={componentKey}
            group={{ ...group, sensors: visibleSensors }}
            colour={colour}
            position={position}
            panelDims={panelDims}
            readings={readings}
            baselines={baselines}
            shapMap={shapMap}
            shapCount={shapSensors.length}
            isLeakOrigin={componentKey === leakOrigin}
            isDownstream={originIdx >= 0 && compIdx > originIdx}
            isExpanded={isThisExpanded}
            isHovered={hovered === componentKey}
            onToggle={(key) => setExpanded((prev) => (prev === key ? null : key))}
            onHover={(key, on) => setHovered(on ? key : null)}
            panelRef={(el) => { panelRefs.current[componentKey] = el; }}
          />
        );
      })}
    </div>
  );
}
