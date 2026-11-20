import React, { useId } from "react";

function NavLogoShell({ active, children, className = "" }) {
  return (
    <span className={`nav-tab-logo ${active ? "nav-tab-logo--active" : ""} ${className}`} aria-hidden>
      {children}
    </span>
  );
}

export function DashboardNavLogo({ active = false }) {
  const uid = useId().replace(/:/g, "");
  return (
    <NavLogoShell active={active} className="nav-tab-logo--dashboard">
      <svg viewBox="0 0 24 24" className="nav-tab-logo-svg">
        <defs>
          <linearGradient id={`${uid}-d`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0DB8F0" />
            <stop offset="100%" stopColor="#00D4A8" />
          </linearGradient>
        </defs>
        <rect x="3" y="3" width="8" height="8" rx="1.5" fill="none" stroke={`url(#${uid}-d)`} strokeWidth="1.2" className="nav-logo-panel nav-logo-panel--1" />
        <rect x="13" y="3" width="8" height="8" rx="1.5" fill="none" stroke={`url(#${uid}-d)`} strokeWidth="1.2" opacity="0.7" className="nav-logo-panel nav-logo-panel--2" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" fill="none" stroke={`url(#${uid}-d)`} strokeWidth="1.2" opacity="0.7" className="nav-logo-panel nav-logo-panel--3" />
        <rect x="13" y="13" width="8" height="8" rx="1.5" fill="rgba(13,184,240,0.12)" stroke={`url(#${uid}-d)`} strokeWidth="1.2" className="nav-logo-panel nav-logo-panel--4" />
        <line x1="3" y1="11" x2="21" y2="11" stroke="#7DD3FC" strokeWidth="0.8" opacity="0.5" className="nav-logo-scan" />
        <circle cx="17" cy="17" r="1.5" fill="#00D4A8" className="nav-logo-ping" />
      </svg>
    </NavLogoShell>
  );
}

export function OperationsNavLogo({ active = false }) {
  const uid = useId().replace(/:/g, "");
  return (
    <NavLogoShell active={active} className="nav-tab-logo--operations">
      <svg viewBox="0 0 24 24" className="nav-tab-logo-svg">
        <defs>
          <linearGradient id={`${uid}-o`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="50%" stopColor="#0DB8F0" />
            <stop offset="100%" stopColor="#00D4A8" />
          </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="9" fill="none" stroke={`url(#${uid}-o)`} strokeWidth="0.8" opacity="0.35" className="nav-logo-orbit" />
        <circle cx="12" cy="12" r="5.5" fill="none" stroke={`url(#${uid}-o)`} strokeWidth="1.2" className="nav-logo-ring" />
        <line x1="12" y1="12" x2="12" y2="6.5" stroke={`url(#${uid}-o)`} strokeWidth="1.3" strokeLinecap="round" className="nav-logo-needle" />
        <circle cx="12" cy="12" r="1.8" fill="#0DB8F0" className="nav-logo-core" />
        <path d="M12 3 L13.2 5.8 H10.8 Z" fill="#F59E0B" opacity="0.9" className="nav-logo-tick" />
      </svg>
    </NavLogoShell>
  );
}

export function CommsNavLogo({ active = false }) {
  const uid = useId().replace(/:/g, "");
  return (
    <NavLogoShell active={active} className="nav-tab-logo--comms">
      <svg viewBox="0 0 24 24" className="nav-tab-logo-svg">
        <defs>
          <linearGradient id={`${uid}-c`} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#34D399" />
            <stop offset="100%" stopColor="#0DB8F0" />
          </linearGradient>
        </defs>
        <rect x="3" y="5" width="14" height="10" rx="3" fill="rgba(13,184,240,0.1)" stroke={`url(#${uid}-c)`} strokeWidth="1.1" />
        <path d="M7 15 L9.5 18.5 H7 V15 Z" fill={`url(#${uid}-c)`} opacity="0.85" />
        <line x1="7" y1="9" x2="13" y2="9" stroke="#7DD3FC" strokeWidth="1" strokeLinecap="round" className="nav-logo-wave nav-logo-wave--1" />
        <line x1="7" y1="11.5" x2="11" y2="11.5" stroke="#7DD3FC" strokeWidth="1" strokeLinecap="round" opacity="0.7" className="nav-logo-wave nav-logo-wave--2" />
        <circle cx="18.5" cy="8" r="2.2" fill="none" stroke="#34D399" strokeWidth="0.9" className="nav-logo-signal nav-logo-signal--1" />
        <circle cx="18.5" cy="8" r="3.8" fill="none" stroke="#34D399" strokeWidth="0.6" opacity="0.5" className="nav-logo-signal nav-logo-signal--2" />
      </svg>
    </NavLogoShell>
  );
}

export function DigitalTwinNavLogo({ active = false }) {
  const uid = useId().replace(/:/g, "");
  return (
    <NavLogoShell active={active} className="nav-tab-logo--twin">
      <svg viewBox="0 0 24 24" className="nav-tab-logo-svg">
        <defs>
          <linearGradient id={`${uid}-t`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818CF8" />
            <stop offset="100%" stopColor="#0DB8F0" />
          </linearGradient>
        </defs>
        <g className="nav-logo-cube">
          <path d="M12 4 L19 8.5 V17.5 L12 22 L5 17.5 V8.5 Z" fill="none" stroke={`url(#${uid}-t)`} strokeWidth="1.1" />
          <path d="M12 4 V22" stroke={`url(#${uid}-t)`} strokeWidth="0.8" opacity="0.5" />
          <path d="M5 8.5 L12 13 L19 8.5" stroke={`url(#${uid}-t)`} strokeWidth="0.8" opacity="0.65" />
          <path d="M12 13 V22" stroke={`url(#${uid}-t)`} strokeWidth="0.8" opacity="0.65" />
        </g>
        <circle cx="12" cy="13" r="1.5" fill="#818CF8" className="nav-logo-core" />
      </svg>
    </NavLogoShell>
  );
}

export function FederatedNavLogo({ active = false }) {
  const uid = useId().replace(/:/g, "");
  const nodes = [
    [12, 5],
    [19, 9],
    [19, 17],
    [12, 21],
    [5, 17],
    [5, 9],
  ];
  return (
    <NavLogoShell active={active} className="nav-tab-logo--federated">
      <svg viewBox="0 0 24 24" className="nav-tab-logo-svg">
        <defs>
          <linearGradient id={`${uid}-f`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0DB8F0" />
            <stop offset="50%" stopColor="#A78BFA" />
            <stop offset="100%" stopColor="#00D4A8" />
          </linearGradient>
        </defs>
        <polygon
          points={nodes.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none"
          stroke={`url(#${uid}-f)`}
          strokeWidth="0.9"
          opacity="0.55"
          className="nav-logo-mesh"
        />
        {nodes.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="1.6"
            fill={i === 0 ? "#0DB8F0" : "#818CF8"}
            className="nav-logo-node"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
        <circle cx="12" cy="13" r="2.2" fill="#00D4A8" className="nav-logo-hub" />
      </svg>
    </NavLogoShell>
  );
}

export function HealthNavLogo({ active = false }) {
  const uid = useId().replace(/:/g, "");
  return (
    <NavLogoShell active={active} className="nav-tab-logo--health">
      <svg viewBox="0 0 24 24" className="nav-tab-logo-svg">
        <defs>
          <linearGradient id={`${uid}-h`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00D4A8" />
            <stop offset="50%" stopColor="#0DB8F0" />
            <stop offset="100%" stopColor="#EF9F27" />
          </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="8.5" fill="none" stroke={`url(#${uid}-h)`} strokeWidth="1.2" />
        <path
          d="M6 12 L9.5 15.5 L18 7"
          fill="none"
          stroke="#00D4A8"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="nav-logo-check"
        />
        <circle cx="17" cy="7" r="1.4" fill="#EF9F27" className="nav-logo-ping" />
      </svg>
    </NavLogoShell>
  );
}

export function CellBoardNavLogo({ active = false }) {
  const uid = useId().replace(/:/g, "");
  return (
    <NavLogoShell active={active} className="nav-tab-logo--cellboard">
      <svg viewBox="0 0 24 24" className="nav-tab-logo-svg">
        <defs>
          <linearGradient id={`${uid}-cb`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4ADE80" />
            <stop offset="50%" stopColor="#FBBF24" />
            <stop offset="100%" stopColor="#F87171" />
          </linearGradient>
        </defs>
        <rect x="2" y="4" width="6" height="7" rx="1.2" fill="rgba(74,222,128,0.15)" stroke={`url(#${uid}-cb)`} strokeWidth="1" />
        <rect x="9" y="4" width="6" height="7" rx="1.2" fill="rgba(251,191,36,0.12)" stroke={`url(#${uid}-cb)`} strokeWidth="1" opacity="0.85" />
        <rect x="16" y="4" width="6" height="7" rx="1.2" fill="rgba(248,113,113,0.12)" stroke={`url(#${uid}-cb)`} strokeWidth="1" opacity="0.85" />
        <rect x="2" y="13" width="20" height="7" rx="1.2" fill="none" stroke={`url(#${uid}-cb)`} strokeWidth="0.9" opacity="0.5" />
      </svg>
    </NavLogoShell>
  );
}

export function ManualInputNavLogo({ active = false }) {
  const uid = useId().replace(/:/g, "");
  return (
    <NavLogoShell active={active} className="nav-tab-logo--manual">
      <svg viewBox="0 0 24 24" className="nav-tab-logo-svg">
        <defs>
          <linearGradient id={`${uid}-m`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#A78BFA" />
            <stop offset="100%" stopColor="#0DB8F0" />
          </linearGradient>
        </defs>
        <rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke={`url(#${uid}-m)`} strokeWidth="1.2" />
        <line x1="7" y1="9" x2="17" y2="9" stroke={`url(#${uid}-m)`} strokeWidth="1" opacity="0.6" />
        <line x1="7" y1="12" x2="14" y2="12" stroke={`url(#${uid}-m)`} strokeWidth="1" opacity="0.5" />
        <line x1="7" y1="15" x2="12" y2="15" stroke={`url(#${uid}-m)`} strokeWidth="1" opacity="0.4" />
        <circle cx="17" cy="15" r="1.2" fill="#A78BFA" />
      </svg>
    </NavLogoShell>
  );
}

export function ValidationNavLogo({ active = false }) {
  const uid = useId().replace(/:/g, "");
  return (
    <NavLogoShell active={active} className="nav-tab-logo--validation">
      <svg viewBox="0 0 24 24" className="nav-tab-logo-svg">
        <defs>
          <linearGradient id={`${uid}-v`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34D399" />
            <stop offset="100%" stopColor="#0DB8F0" />
          </linearGradient>
        </defs>
        <path
          d="M12 3 L20 7 V12 C20 16.5 16.8 19.8 12 21 C7.2 19.8 4 16.5 4 12 V7 Z"
          fill="none"
          stroke={`url(#${uid}-v)`}
          strokeWidth="1.2"
        />
        <path
          d="M8.5 12.2 L11 14.8 L16 9.5"
          fill="none"
          stroke="#34D399"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </NavLogoShell>
  );
}

export const NAV_TAB_LOGOS = {
  dashboard: DashboardNavLogo,
  sensorhealth: HealthNavLogo,
  manualinput: ManualInputNavLogo,
  validation: ValidationNavLogo,
  operations: OperationsNavLogo,
  comms: CommsNavLogo,
  digitaltwin: DigitalTwinNavLogo,
  federated: FederatedNavLogo,
  cellboard: CellBoardNavLogo,
};
