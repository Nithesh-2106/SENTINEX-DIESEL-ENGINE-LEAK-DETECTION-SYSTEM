import React, { useLayoutEffect, useRef, useState } from "react";
import { computeStableAllSensorPositions } from "../digitalTwin/labelOverlap.js";
import { formatSensorValue } from "../digitalTwin/formatSensorValue.js";
import { COMPONENT_COLOURS } from "../digitalTwin/sensorPanelConfig.js";

const PILL_WIDTH = 118;

function pillLineEnd(anchorX, anchorY, labelX, labelY, side) {
  const halfH = 10;
  const top = labelY - halfH;
  const bottom = labelY + halfH;
  const left = side === "left" ? labelX : labelX - PILL_WIDTH;
  const right = side === "left" ? labelX + PILL_WIDTH : labelX;

  const cx = side === "left" ? right : left;
  const cy = Math.max(top, Math.min(bottom, anchorY));
  const dx = cx - anchorX;
  const dy = cy - anchorY;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: cx - (dx / len) * 2,
    y: cy - (dy / len) * 2,
  };
}

export default function SensorAllLabelsOverlay({
  labels,
  viewportWidth,
  viewportHeight,
  layoutKey,
  className = "",
  onLabelClick,
}) {
  const labelsRef = useRef(labels);
  labelsRef.current = labels;

  const [stablePositions, setStablePositions] = useState(() => new Map());

  useLayoutEffect(() => {
    const current = labelsRef.current;
    if (!current?.length || viewportWidth < 80 || viewportHeight < 80) return;

    const positions = computeStableAllSensorPositions(current, {
      width: viewportWidth,
      height: viewportHeight,
    });
    const next = new Map();
    positions.forEach((p) => next.set(p.sensorKey, p));
    setStablePositions(next);
  }, [layoutKey, viewportWidth, viewportHeight, labels?.length]);

  if (!labels?.length || !stablePositions.size) return null;

  const resolved = labels
    .map((l) => {
      const stable = stablePositions.get(l.sensorKey);
      if (!stable) return null;
      const categoryColour = COMPONENT_COLOURS[l.componentKey] ?? "#5F5E5A";
      const lineEnd = pillLineEnd(
        l.anchorX,
        l.anchorY,
        stable.labelX,
        stable.labelY,
        stable.side,
      );
      return { ...l, ...stable, categoryColour, lineEnd };
    })
    .filter(Boolean);

  if (!resolved.length) return null;

  const leftCount = resolved.filter((l) => l.side === "left").length;
  const rightCount = resolved.length - leftCount;

  return (
    <div
      className={`sensor-all-overlay ${className}`.trim()}
      style={{ position: "absolute", inset: 0, bottom: 32, pointerEvents: "none", zIndex: 132 }}
    >
      <div className="sensor-all-overlay__column sensor-all-overlay__column--left" aria-hidden>
        <span className="sensor-all-overlay__column-title">Intake Path</span>
        <span className="sensor-all-overlay__column-count">{leftCount}</span>
      </div>
      <div className="sensor-all-overlay__column sensor-all-overlay__column--right" aria-hidden>
        <span className="sensor-all-overlay__column-title">Block / Exhaust</span>
        <span className="sensor-all-overlay__column-count">{rightCount}</span>
      </div>

      <svg
        width={viewportWidth}
        height={viewportHeight}
        className="sensor-all-overlay__lines"
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        {resolved.map((l) => (
          <line
            key={`line-${l.sensorKey}`}
            x1={l.anchorX}
            y1={l.anchorY}
            x2={l.lineEnd.x}
            y2={l.lineEnd.y}
            stroke={l.categoryColour}
            strokeWidth={1.25}
            strokeOpacity={0.45}
          />
        ))}
        {resolved.map((l) => (
          <circle
            key={`dot-${l.sensorKey}`}
            cx={l.anchorX}
            cy={l.anchorY}
            r={3.5}
            fill={l.categoryColour}
            stroke="rgba(255,255,255,0.75)"
            strokeWidth={1}
          />
        ))}
      </svg>

      {resolved.map((l) => {
        const fmt = formatSensorValue(l.sensorKey, l.value, l.unit);
        const isHigh = Math.abs(l.deviationPct ?? 0) > 8;
        const isWarn = Math.abs(l.deviationPct ?? 0) > 2;
        const valueColour = isHigh ? "#E24B4A" : isWarn ? "#EF9F27" : "rgba(255,255,255,0.92)";
        return (
          <button
            key={l.sensorKey}
            type="button"
            className={`sensor-all-pill ${l.side === "right" ? "sensor-all-pill--right" : ""}`}
            data-component={l.componentKey}
            title={l.hasLiveReading ? undefined : "Baseline (no live reading)"}
            onClick={(e) => { e.stopPropagation(); onLabelClick?.(l.sensorKey); }}
            style={{
              left: l.labelX,
              top: l.labelY,
              "--pill-accent": l.categoryColour,
              opacity: l.hasLiveReading ? 1 : 0.86,
            }}
          >
            <span className="sensor-all-pill__swatch" aria-hidden />
            <span className="sensor-all-pill__name">{l.shortLabel}</span>
            <span className="sensor-all-pill__sep" aria-hidden />
            <span className="sensor-all-pill__value" style={{ color: valueColour }}>
              {fmt.valueText}
              {fmt.unitText ? ` ${fmt.unitText}` : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}
