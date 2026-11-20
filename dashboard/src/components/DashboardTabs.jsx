/**
 * DashboardTabs — Premium tab bar with glow indicators.
 * Props: activeTab, onTabChange, leakActive
 */
import React from "react";

const TABS = [
  {
    id: "dashboard",
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
    label: "Dashboard",
    color: "cyan",
  },
  {
    id: "digitaltwin",
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
      </svg>
    ),
    label: "Digital Twin",
    color: "purple",
  },
  {
    id: "federated",
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    label: "Federated Learning",
    color: "emerald",
  },
];

const ACTIVE_STYLES = {
  cyan:    "text-hud-cyan border-hud-cyan bg-hud-cyan/5",
  purple:  "text-hud-purple border-hud-purple bg-hud-purple/5",
  blue:    "text-blue-400 border-blue-400 bg-blue-400/5",
  emerald: "text-emerald-400 border-emerald-400 bg-emerald-400/5",
};

const HOVER_STYLES = {
  cyan:    "hover:text-hud-cyan/70",
  purple:  "hover:text-hud-purple/70",
  blue:    "hover:text-blue-400/70",
  emerald: "hover:text-emerald-400/70",
};

export default function DashboardTabs({ activeTab, onTabChange, leakActive }) {
  return (
    <div className="relative flex shrink-0 items-end border-b border-hud-border bg-gradient-to-r from-hud-bg0 via-hud-bg1 to-hud-bg0 px-4">
      {/* Subtle gradient line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-hud-border to-transparent" />

      {TABS.map(tab => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`
              group relative flex items-center gap-2 border-b-2 px-5 py-3 text-[11px] font-extrabold uppercase tracking-widest
              transition-all duration-200
              ${active
                ? ACTIVE_STYLES[tab.color]
                : `border-transparent text-hud-textMuted/50 ${HOVER_STYLES[tab.color]}`
              }
            `}
          >
            {/* Glow effect on active */}
            {active && (
              <div className={`absolute inset-x-0 bottom-0 h-px ${
                tab.color === "cyan"    ? "bg-gradient-to-r from-transparent via-hud-cyan to-transparent" :
                tab.color === "purple"  ? "bg-gradient-to-r from-transparent via-hud-purple to-transparent" :
                tab.color === "emerald" ? "bg-gradient-to-r from-transparent via-emerald-400 to-transparent" :
                "bg-gradient-to-r from-transparent via-blue-400 to-transparent"
              }`} />
            )}
            <span className={`transition-transform duration-200 ${active ? "scale-110" : "group-hover:scale-105"}`}>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
            {/* Badge: leak alert on AI tab */}
            {tab.badge && leakActive && (
              <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-black text-white animate-pulse">!</span>
            )}
          </button>
        );
      })}

      {/* Right side: hint for digital twin */}
      {activeTab === "digitaltwin" && (
        <span className="ml-auto mr-4 pb-2.5 font-mono text-[9px] uppercase tracking-wider text-hud-textMuted/30">
          Drag orbit · Scroll zoom · ⬡ toggle sensors
        </span>
      )}
    </div>
  );
}
