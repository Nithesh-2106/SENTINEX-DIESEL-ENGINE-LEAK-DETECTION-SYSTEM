import React, { useId } from "react";

/** Ultimate live product mark — radar shield with orbital rings */
export default function SentinexLiveLogo({ size = 34 }) {
  const uid = useId().replace(/:/g, "");

  return (
    <span className="sentinex-live-logo" style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} viewBox="0 0 40 40" className="sentinex-live-logo-svg">
        <defs>
          <linearGradient id={`${uid}-sg`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0DB8F0" />
            <stop offset="45%" stopColor="#00D4A8" />
            <stop offset="100%" stopColor="#818CF8" />
          </linearGradient>
          <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(13,184,240,0.35)" />
            <stop offset="100%" stopColor="rgba(13,184,240,0)" />
          </radialGradient>
        </defs>

        <circle cx="20" cy="20" r="18" fill={`url(#${uid}-glow)`} className="sentinex-live-glow" />

        <circle
          cx="20"
          cy="20"
          r="16"
          fill="none"
          stroke={`url(#${uid}-sg)`}
          strokeWidth="0.7"
          strokeDasharray="3 5"
          opacity="0.45"
          className="sentinex-live-orbit sentinex-live-orbit--1"
        />
        <circle
          cx="20"
          cy="20"
          r="12.5"
          fill="none"
          stroke={`url(#${uid}-sg)`}
          strokeWidth="1"
          opacity="0.55"
          className="sentinex-live-orbit sentinex-live-orbit--2"
        />

        <path
          d="M20 6 L30 11.5 V22.5 L20 28 L10 22.5 V11.5 Z"
          fill="rgba(13,184,240,0.08)"
          stroke={`url(#${uid}-sg)`}
          strokeWidth="1.1"
          className="sentinex-live-shield"
        />

        <line
          x1="20"
          y1="20"
          x2="20"
          y2="8"
          stroke={`url(#${uid}-sg)`}
          strokeWidth="1.2"
          strokeLinecap="round"
          className="sentinex-live-sweep"
        />

        <circle cx="20" cy="20" r="2.8" fill="#0DB8F0" className="sentinex-live-core" />
        <circle cx="20" cy="20" r="1.2" fill="#fff" opacity="0.9" className="sentinex-live-core-dot" />

        <circle cx="32" cy="12" r="1.4" fill="#00D4A8" className="sentinex-live-sat sentinex-live-sat--1" />
        <circle cx="9" cy="27" r="1.1" fill="#818CF8" className="sentinex-live-sat sentinex-live-sat--2" />
      </svg>
    </span>
  );
}
