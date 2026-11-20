import React from "react";

function hasSetpointDelta(opRpm, opLoad, opAmbientPressure, spRpm, spLoad, spAmbient) {
  return (
    Math.abs(spRpm - opRpm) > 1 ||
    Math.abs(spLoad - opLoad) > 0.5 ||
    Math.abs(spAmbient - opAmbientPressure) > 0.1
  );
}

export default function OperatingPointBar({
  isStreaming = false,
  opRpm,
  opLoad,
  opAmbientPressure,
  spRpm,
  spLoad,
  spAmbient,
  className = "",
}) {
  if (!isStreaming) return null;

  const transitioning = hasSetpointDelta(
    opRpm,
    opLoad,
    opAmbientPressure,
    spRpm,
    spLoad,
    spAmbient
  );

  return (
    <div className={`operating-point-bar liquid-glass-card ${className}`.trim()}>
      <div className="operating-point-bar-body">
        <span className="operating-point-label">OPERATING POINT</span>
        {transitioning && (
          <span className="operating-point-status">TRANSITION</span>
        )}
        <span className="operating-point-act mono">
          ACT {opRpm?.toFixed(0) ?? "—"} RPM / {opLoad?.toFixed(0) ?? "—"}% /{" "}
          {opAmbientPressure?.toFixed(1) ?? "—"} kPa
        </span>
        <span className="operating-point-arrow" aria-hidden>
          →
        </span>
        <span className={`operating-point-sp mono ${transitioning ? "is-target" : ""}`}>
          SP {spRpm?.toFixed(0) ?? "—"} RPM / {spLoad?.toFixed(0) ?? "—"}% /{" "}
          {spAmbient?.toFixed(1) ?? "—"} kPa
        </span>
      </div>
    </div>
  );
}
