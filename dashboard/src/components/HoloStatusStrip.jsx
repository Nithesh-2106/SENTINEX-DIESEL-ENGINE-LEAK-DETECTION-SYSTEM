import React, { useMemo } from "react";
import { getAllComponentStatuses, getAllComponentStatusesMulti } from "../digitalTwin/hologramMode.js";
import { buildSfiFaultExplanation } from "../utils/sfiExplanation.js";

export default function HoloStatusStrip({
  leakLocation,
  secondaryLeakLocation = null,
  selectedPart,
  onSelectPart,
  hasScr = true,
  faultCtx = null,
  sfiMeta = null,
  onFaultCalloutClick = null,
}) {
  const statuses = secondaryLeakLocation
    ? getAllComponentStatusesMulti(leakLocation, secondaryLeakLocation, { hasScr, faultCtx })
    : getAllComponentStatuses(leakLocation, { hasScr, faultCtx });

  const faultExplanation = useMemo(
    () => buildSfiFaultExplanation(sfiMeta, { sensorKey: faultCtx?.faultySensorKey }),
    [sfiMeta, faultCtx?.faultySensorKey],
  );

  return (
    <div className="hologram-left-panel hologram-left-panel--docked">
      <div className="sidebar-label" style={{ padding: "0 16px 8px" }}>COMPONENT STATUS</div>
      {faultCtx?.faultySensorKey && (
        <button
          type="button"
          className="holo-sfi-callout"
          role="status"
          onClick={() => onFaultCalloutClick?.()}
          title="Show sensor fault detail"
        >
          <span className="holo-sfi-callout__icon" aria-hidden>⚡</span>
          <div className="holo-sfi-callout__copy">
            <span className="holo-sfi-callout__text">
              Fault: {faultCtx.faultySensorLabel || faultCtx.faultySensorKey.replace(/_/g, " ")}
            </span>
            {faultExplanation && (
              <span className="holo-sfi-callout__reason">{faultExplanation.shortDetail}</span>
            )}
          </div>
        </button>
      )}
      {statuses.map((s) => {
        const active = selectedPart === s.componentKey;
        const isLeak = s.status === "LEAK_ORIGIN";
        const isSensorFault = s.status === "SENSOR_FAULT";
        const isDownstream = s.status === "DOWNSTREAM";
        const isSecondary = s.leakRole === "secondary";
        const isDual = s.leakRole === "both";
        const statusClass = isSensorFault
          ? "sensor-fault"
          : s.status === "UPSTREAM" || s.status === "NORMAL"
            ? "ok"
            : isLeak
              ? isSecondary
                ? "secondary-leak"
                : "leak"
              : "downstream";
        return (
          <button
            key={s.componentKey}
            type="button"
            onClick={() => {
              if (isSensorFault && faultCtx?.faultySensorKey) {
                onFaultCalloutClick?.();
              }
              onSelectPart?.(s.componentKey);
            }}
            className={`hologram-component-item ${isLeak ? "leak-origin" : ""} ${isSensorFault ? "sensor-fault-origin" : ""} ${isSecondary ? "secondary-leak-origin" : ""} ${isDual ? "dual-leak-origin" : ""} ${isDownstream ? "downstream" : ""} ${active ? "selected" : ""}`}
          >
            <div className="holo-comp-name">{s.displayName}</div>
            <div className={`holo-comp-status ${statusClass}`} title={isDownstream ? "Affected by leak — downstream of leak origin on air/exhaust path" : undefined}>
              {s.label}
            </div>
          </button>
        );
      })}
    </div>
  );
}
