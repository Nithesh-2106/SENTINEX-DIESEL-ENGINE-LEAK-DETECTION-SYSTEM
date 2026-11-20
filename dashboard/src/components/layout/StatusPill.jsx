import React from "react";

const TONE_ALIAS = {
  normal: "live",
  cat: "engine",
  info: "cell",
  dim: "neutral",
  warning: "warn",
};

export default function StatusPill({ tone, colour, icon, label, showDot = false }) {
  const resolvedTone = tone || TONE_ALIAS[colour] || colour || "neutral";

  return (
    <span className={`status-pill status-pill--${resolvedTone}`}>
      {showDot && <span className="status-pill-dot" aria-hidden />}
      {icon && <span className="status-pill-icon" aria-hidden>{icon}</span>}
      <span className="status-pill-label">{label}</span>
    </span>
  );
}
