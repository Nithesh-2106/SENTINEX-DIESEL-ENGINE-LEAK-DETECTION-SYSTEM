import React, { useId } from "react";

const PALETTES = {
  leak: {
    grad: ["#FF6B6B", "#FF8E53", "#FFD93D"],
    glow: "rgba(255, 107, 107, 0.55)",
    accent: "#FF6B6B",
  },
  rca: {
    grad: ["#A78BFA", "#C084FC", "#F59E0B"],
    glow: "rgba(167, 139, 250, 0.5)",
    accent: "#C084FC",
  },
  shap: {
    grad: ["#38BDF8", "#6366F1", "#818CF8"],
    glow: "rgba(56, 189, 248, 0.5)",
    accent: "#38BDF8",
  },
  sensor: {
    grad: ["#34D399", "#10B981", "#0DB8F0"],
    glow: "rgba(52, 211, 153, 0.48)",
    accent: "#34D399",
  },
  boost: {
    grad: ["#22D3EE", "#0EA5E9", "#6366F1"],
    glow: "rgba(34, 211, 238, 0.45)",
    accent: "#22D3EE",
  },
  system: {
    grad: ["#0DB8F0", "#00D4A8", "#38BDF8"],
    glow: "rgba(13, 184, 240, 0.5)",
    accent: "#0DB8F0",
  },
  sensors: {
    grad: ["#34D399", "#0DB8F0", "#6EE7B7"],
    glow: "rgba(52, 211, 153, 0.45)",
    accent: "#34D399",
  },
  pipeline: {
    grad: ["#6366F1", "#0DB8F0", "#00D4A8"],
    glow: "rgba(99, 102, 241, 0.48)",
    accent: "#6366F1",
  },
};

function Defs({ uid, colors, id }) {
  return (
    <defs>
      <linearGradient id={`${uid}-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={colors[0]} />
        <stop offset="50%" stopColor={colors[1]} />
        <stop offset="100%" stopColor={colors[2]} />
      </linearGradient>
      <radialGradient id={`${uid}-${id}-rad`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor={colors[0]} stopOpacity="0.35" />
        <stop offset="100%" stopColor={colors[2]} stopOpacity="0" />
      </radialGradient>
      <filter id={`${uid}-${id}-glow`} x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="1.2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

function LeakIcon({ uid, colors }) {
  const g = `url(#${uid}-leak)`;
  return (
    <svg viewBox="0 0 32 32" className="aria-insight-icon-svg" aria-hidden>
      <Defs uid={uid} colors={colors} id="leak" />
      <circle cx="16" cy="16" r="14" fill={`url(#${uid}-leak-rad)`} />
      <path
        d="M16 5 L27 26 H5 Z"
        fill="none"
        stroke={g}
        strokeWidth="1.6"
        strokeLinejoin="round"
        filter={`url(#${uid}-leak-glow)`}
        className="aria-insight-pulse"
      />
      <path d="M16 12 V19 M16 22 V22.5" stroke={colors[0]} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="16" r="11" fill="none" stroke={g} strokeWidth="0.6" opacity="0.4" className="aria-insight-ring" />
    </svg>
  );
}

function RcaIcon({ uid, colors }) {
  const g = `url(#${uid}-rca)`;
  return (
    <svg viewBox="0 0 32 32" className="aria-insight-icon-svg" aria-hidden>
      <Defs uid={uid} colors={colors} id="rca" />
      <circle cx="13" cy="13" r="8" fill="none" stroke={g} strokeWidth="1.8" filter={`url(#${uid}-rca-glow)`} />
      <line x1="19" y1="19" x2="26" y2="26" stroke={g} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="10" cy="11" r="1.6" fill={colors[0]} className="aria-insight-dot" />
      <circle cx="15" cy="14" r="1.3" fill={colors[1]} className="aria-insight-dot" style={{ animationDelay: "0.3s" }} />
      <path d="M9 10 L13 8 L16 13 M13 8 L11 15" fill="none" stroke={colors[2]} strokeWidth="0.8" opacity="0.65" className="aria-insight-dash" />
    </svg>
  );
}

function ShapIcon({ uid, colors }) {
  const g = `url(#${uid}-shap)`;
  const bars = [10, 16, 12, 20, 14];
  return (
    <svg viewBox="0 0 32 32" className="aria-insight-icon-svg" aria-hidden>
      <Defs uid={uid} colors={colors} id="shap" />
      {bars.map((h, i) => (
        <rect
          key={i}
          x={5 + i * 5}
          y={24 - h}
          width="3.5"
          height={h}
          rx="1"
          fill={g}
          opacity={0.55 + i * 0.08}
          className="aria-insight-bar"
          style={{ animationDelay: `${i * 0.1}s` }}
        />
      ))}
      <path d="M4 20 Q12 12 20 16 T28 10" fill="none" stroke={g} strokeWidth="1.6" strokeLinecap="round" className="aria-insight-dash" filter={`url(#${uid}-shap-glow)`} />
      <polygon points="27,8 30,12 24,12" fill={colors[0]} className="aria-insight-float" />
    </svg>
  );
}

function SensorIcon({ uid, colors }) {
  const g = `url(#${uid}-sensor)`;
  return (
    <svg viewBox="0 0 32 32" className="aria-insight-icon-svg" aria-hidden>
      <Defs uid={uid} colors={colors} id="sensor" />
      <path d="M6 22 A10 10 0 0 1 26 22" fill="none" stroke={g} strokeWidth="1.8" strokeLinecap="round" filter={`url(#${uid}-sensor-glow)`} />
      <line x1="16" y1="22" x2="16" y2="8" stroke={colors[1]} strokeWidth="1.2" opacity="0.35" />
      <line x1="16" y1="22" x2="22" y2="14" stroke={colors[0]} strokeWidth="1.8" strokeLinecap="round" className="aria-insight-needle" />
      <circle cx="16" cy="22" r="2" fill={colors[0]} className="aria-insight-dot" />
      <circle cx="16" cy="22" r="5" fill="none" stroke={g} strokeWidth="0.6" opacity="0.35" className="aria-insight-ring" />
    </svg>
  );
}

function BoostIcon({ uid, colors }) {
  const g = `url(#${uid}-boost)`;
  return (
    <svg viewBox="0 0 32 32" className="aria-insight-icon-svg" aria-hidden>
      <Defs uid={uid} colors={colors} id="boost" />
      <ellipse cx="16" cy="18" rx="9" ry="5" fill="none" stroke={g} strokeWidth="1.4" opacity="0.5" />
      <path d="M8 18 C8 10 24 10 24 18" fill="none" stroke={g} strokeWidth="1.8" filter={`url(#${uid}-boost-glow)`} />
      <path d="M16 8 L19 14 H13 Z" fill={g} className="aria-insight-float" />
      <path d="M11 20 H21" stroke={colors[2]} strokeWidth="1" opacity="0.4" strokeLinecap="round" className="aria-insight-dash" />
    </svg>
  );
}

function SystemIcon({ uid, colors }) {
  const g = `url(#${uid}-system)`;
  return (
    <svg viewBox="0 0 32 32" className="aria-insight-icon-svg" aria-hidden>
      <Defs uid={uid} colors={colors} id="system" />
      <circle cx="16" cy="16" r="12" fill="none" stroke={g} strokeWidth="0.7" opacity="0.35" className="aria-insight-ring" />
      <circle cx="16" cy="16" r="8" fill="none" stroke={g} strokeWidth="1" opacity="0.55" className="aria-insight-ring-reverse" />
      <path d="M16 16 L28 8" stroke={g} strokeWidth="1.6" strokeLinecap="round" className="aria-insight-sweep" filter={`url(#${uid}-system-glow)`} />
      <circle cx="16" cy="16" r="2.2" fill={colors[0]} className="aria-insight-dot" />
      <line x1="16" y1="4" x2="16" y2="28" stroke={g} strokeWidth="0.5" opacity="0.25" />
      <line x1="4" y1="16" x2="28" y2="16" stroke={g} strokeWidth="0.5" opacity="0.25" />
    </svg>
  );
}

function SensorsCapIcon({ uid, colors }) {
  const g = `url(#${uid}-sensors)`;
  const bars = [9, 14, 11, 18, 12];
  return (
    <svg viewBox="0 0 32 32" className="aria-insight-icon-svg" aria-hidden>
      <Defs uid={uid} colors={colors} id="sensors" />
      {bars.map((h, i) => (
        <rect key={i} x={6 + i * 4.5} y={22 - h} width="3" height={h} rx="1" fill={g} className="aria-insight-bar" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
      <path d="M5 18 Q14 10 24 14" fill="none" stroke={g} strokeWidth="1.4" className="aria-insight-dash" filter={`url(#${uid}-sensors-glow)`} />
    </svg>
  );
}

function PipelineIcon({ uid, colors }) {
  const g = `url(#${uid}-pipeline)`;
  const nodes = [[4, 16], [10, 10], [16, 16], [22, 10], [28, 16]];
  return (
    <svg viewBox="0 0 32 32" className="aria-insight-icon-svg" aria-hidden>
      <Defs uid={uid} colors={colors} id="pipeline" />
      <path d="M4 16 L10 10 L16 16 L22 10 L28 16" fill="none" stroke={g} strokeWidth="1.2" className="aria-insight-dash" opacity="0.55" />
      {nodes.map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="2.8" fill="none" stroke={g} strokeWidth="0.9" className="aria-insight-node" style={{ animationDelay: `${i * 0.15}s` }} />
          <circle cx={cx} cy={cy} r="1.4" fill={colors[i % 3]} className="aria-insight-dot" style={{ animationDelay: `${i * 0.1}s` }} />
        </g>
      ))}
      <circle cx="16" cy="6" r="1.2" fill={colors[0]} className="aria-insight-float" />
    </svg>
  );
}

const ICON_MAP = {
  leak: LeakIcon,
  rca: RcaIcon,
  shap: ShapIcon,
  sensor: SensorIcon,
  boost: BoostIcon,
  system: SystemIcon,
  sensors: SensorsCapIcon,
  pipeline: PipelineIcon,
};

/**
 * Dynamic gradient SVG icon for ARIA insight tiles and capability cards.
 * @param {"leak"|"rca"|"shap"|"sensor"|"boost"|"system"|"sensors"|"pipeline"} type
 */
export function AriaInsightIcon({ type = "system", size = 28, className = "" }) {
  const uid = useId().replace(/:/g, "");
  const palette = PALETTES[type] || PALETTES.system;
  const Icon = ICON_MAP[type] || SystemIcon;

  return (
    <span
      className={`aria-insight-icon aria-insight-icon--${type} ${className}`}
      style={{ "--insight-glow": palette.glow, width: size, height: size }}
      aria-hidden
    >
      <span className="aria-insight-icon-plate" />
      <span className="aria-insight-icon-aura" />
      <Icon uid={uid} colors={palette.grad} />
    </span>
  );
}

export function getInsightPalette(type) {
  return PALETTES[type] || PALETTES.system;
}

export default AriaInsightIcon;
