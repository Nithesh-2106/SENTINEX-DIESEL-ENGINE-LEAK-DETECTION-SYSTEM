import React from "react";
import { resolveOverlaps } from "../digitalTwin/labelOverlap.js";
import { formatSensorValue } from "../digitalTwin/formatSensorValue.js";

export default function SensorDotLabels({ labels, onLabelClick }) {
  if (!labels?.length) return null;

  const resolved = resolveOverlaps(labels);

  return (
    <div style={{ position: "absolute", inset: 0, bottom: 32, pointerEvents: "none", zIndex: 130 }}>
      {resolved.map((l) => {
        const fmt = formatSensorValue(l.sensorKey, l.value, l.unit);
        const active = l.isActive;
        return (
          <div
            key={l.sensorKey}
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onLabelClick?.(l.sensorKey); }}
            onKeyDown={(e) => { if (e.key === "Enter") onLabelClick?.(l.sensorKey); }}
            style={{
              position: "absolute",
              left: l.screenX + l.labelOffsetX,
              top: l.screenY + l.labelOffsetY,
              transform: "translate(0, -50%)",
              pointerEvents: active ? "auto" : "none",
              cursor: "pointer",
              background: active ? "rgba(0,0,0,0.85)" : "rgba(0,0,0,0.72)",
              border: `1px solid ${l.colour}`,
              borderRadius: 3,
              padding: "2px 6px",
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 9,
              lineHeight: 1.35,
              whiteSpace: "nowrap",
              color: "#fff",
              boxShadow: active ? `0 0 8px ${l.colour}66` : "none",
            }}
          >
            <div style={{ color: l.colour, fontWeight: "bold" }}>
              {l.isFaultSensor ? "⚡ " : ""}{l.shortLabel}
            </div>
            <div>
              {fmt.valueText}
              {fmt.unitText ? ` ${fmt.unitText}` : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}
