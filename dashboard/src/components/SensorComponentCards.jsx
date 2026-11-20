import React, { useState, useEffect, useCallback } from "react";
import { COMPONENT_SENSOR_MAP } from "../digitalTwin/componentSensorMap.js";
import { formatSensorValue } from "../digitalTwin/formatSensorValue.js";
import {
  PRIMARY_SENSOR_KEYS,
  deviationColor,
  worstDeviationColor,
} from "../digitalTwin/sensorCardConfig.js";

const COMPONENT_ORDER = [
  "AIR_FILTER",
  "TURBOCHARGER",
  "CAC",
  "ENGINE_BLOCK",
  "EGR_COOLER",
  "DPF_DOC",
  "SCR",
  "EXHAUST_OUT",
];

export default function SensorComponentCards({
  visible,
  positions,
  liveReadings,
  hasScr = true,
}) {
  const [expanded, setExpanded] = useState(null);
  const [readings, setReadings] = useState(liveReadings || {});

  useEffect(() => {
    if (!visible) {
      setExpanded(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setExpanded(null);
      return undefined;
    }
    setReadings(liveReadings || {});
  }, [visible, liveReadings]);

  const toggleExpand = useCallback((key) => {
    setExpanded((prev) => (prev === key ? null : key));
  }, []);

  if (!visible || !positions?.length) return null;

  const posByKey = Object.fromEntries(positions.map((p) => [p.componentKey, p]));

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 31 }}>
      {COMPONENT_ORDER.filter((key) => hasScr || key !== "SCR").map((componentKey) => {
        const pos = posByKey[componentKey];
        if (!pos) return null;

        const comp = COMPONENT_SENSOR_MAP[componentKey];
        const primaryKey = PRIMARY_SENSOR_KEYS[componentKey];
        const primarySensor = comp.sensors.find((s) => s.key === primaryKey) || comp.sensors[0];
        const borderColor = worstDeviationColor(comp.sensors, readings);
        const isExpanded = expanded === componentKey;
        const moreCount = comp.sensors.length - 1;

        const lineLen = Math.hypot(pos.anchorX - pos.cardX, pos.anchorY - pos.cardY);
        const lineAngle = Math.atan2(pos.anchorY - pos.cardY, pos.anchorX - pos.cardX) * (180 / Math.PI);

        const primaryVal = readings?.[primarySensor.key];
        const primaryFmt = formatSensorValue(primarySensor.key, primaryVal, primarySensor.unit);
        const primaryCol = deviationColor(primaryVal, primarySensor.baseline);

        return (
          <div
            key={componentKey}
            style={{
              position: "absolute",
              left: pos.cardX,
              top: pos.cardY,
              transform: "translate(-50%, -50%)",
              pointerEvents: "auto",
            }}
            onMouseEnter={() => setExpanded(componentKey)}
            onMouseLeave={() => setExpanded(null)}
            onClick={() => toggleExpand(componentKey)}
          >
            {/* Dashed connector to component anchor */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: lineLen,
                height: 0,
                borderTop: `1px dashed ${borderColor}88`,
                transformOrigin: "0 50%",
                transform: `rotate(${lineAngle}deg)`,
                opacity: 0.85,
                pointerEvents: "none",
              }}
            />

            <div
              style={{
                position: "relative",
                width: 160,
                minHeight: isExpanded ? undefined : 48,
                maxHeight: isExpanded ? 200 : 48,
                overflow: isExpanded ? "auto" : "hidden",
                background: "rgba(1,4,7,0.9)",
                border: `1px solid ${borderColor}`,
                borderRadius: 4,
                padding: "6px 10px",
                backdropFilter: "blur(6px)",
                boxShadow: `0 0 12px ${borderColor}33`,
                transition: "max-height 0.25s ease, min-height 0.25s ease",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  fontFamily: "'Orbitron', monospace",
                  fontSize: 7.5,
                  letterSpacing: 1.2,
                  color: borderColor,
                  fontWeight: "bold",
                  marginBottom: 4,
                  lineHeight: 1.2,
                }}
              >
                {comp.displayName.toUpperCase()}
              </div>

              {!isExpanded ? (
                <>
                  <div
                    style={{
                      fontFamily: "'Share Tech Mono', monospace",
                      fontSize: 8,
                      color: "rgba(255,255,255,0.55)",
                      lineHeight: 1.3,
                    }}
                  >
                    {primarySensor.label}
                  </div>
                  <div
                    style={{
                      fontFamily: "'Share Tech Mono', monospace",
                      fontSize: 10,
                      color: primaryCol,
                      fontWeight: "bold",
                      lineHeight: 1.4,
                    }}
                  >
                    {primaryFmt.valueText}
                    {primaryFmt.unitText ? (
                      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 8, fontWeight: "normal" }}>
                        {" "}{primaryFmt.unitText}
                      </span>
                    ) : null}
                  </div>
                  {moreCount > 0 && (
                    <div
                      style={{
                        fontFamily: "'Share Tech Mono', monospace",
                        fontSize: 7,
                        color: "rgba(255,255,255,0.35)",
                        marginTop: 2,
                      }}
                    >
                      +{moreCount} more
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {comp.sensors.map((s) => {
                    const val = readings?.[s.key];
                    const fmt = formatSensorValue(s.key, val, s.unit);
                    const col = deviationColor(val, s.baseline);
                    return (
                      <div key={s.key} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 4 }}>
                        <div
                          style={{
                            fontFamily: "'Share Tech Mono', monospace",
                            fontSize: 7.5,
                            color: "rgba(255,255,255,0.5)",
                          }}
                        >
                          {s.label}
                        </div>
                        <div
                          style={{
                            fontFamily: "'Share Tech Mono', monospace",
                            fontSize: 9.5,
                            color: col,
                            fontWeight: "bold",
                          }}
                        >
                          {fmt.valueText}
                          {fmt.unitText ? (
                            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 7.5, fontWeight: "normal" }}>
                              {" "}{fmt.unitText}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
