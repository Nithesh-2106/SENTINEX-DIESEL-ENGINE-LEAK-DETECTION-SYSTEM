import React from "react";
import { AriaInsightIcon, getInsightPalette } from "./AriaInsightIcons.jsx";

export function AriaCapabilityLogo({ type = "system", size = 40, active = false }) {
  const meta = getInsightPalette(type);

  return (
    <div
      className={`aria-cap-logo aria-cap-logo--${type} ${active ? "aria-cap-logo--active" : ""}`}
      style={{ "--cap-glow": meta.glow, width: size, height: size }}
    >
      <div className="aria-cap-logo-plate" aria-hidden />
      <div className="aria-cap-logo-aura" aria-hidden />
      <div className="aria-cap-logo-scan" aria-hidden />
      <AriaInsightIcon type={type} size={Math.round(size * 0.72)} className="aria-cap-logo-icon" />
    </div>
  );
}

export function AriaCapabilityCard({ cap, onClick, active = false, systemState = null }) {
  const isLeak = systemState === "LEAK_DETECTED";
  const dynamicActive = active || (cap.id === "rca" && isLeak) || (cap.id === "system" && isLeak);

  return (
    <button
      type="button"
      className={`aria-cap-card aria-cap-card--${cap.id} ${dynamicActive ? "active" : ""} ${isLeak && cap.id === "system" ? "aria-cap-card--alert" : ""}`}
      onClick={() => onClick?.(cap.prompt)}
      title={cap.desc}
    >
      <div className="aria-cap-card-glow" aria-hidden />
      <AriaCapabilityLogo type={cap.id} size={40} active={dynamicActive} />
      <span className="aria-cap-card-title">{cap.title}</span>
      <span className="aria-cap-card-desc">{cap.desc}</span>
    </button>
  );
}

export default AriaCapabilityLogo;
