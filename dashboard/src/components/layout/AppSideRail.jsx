import React, { useEffect, useMemo, useState } from "react";
import ProductBrandLockup from "../ProductBrandLockup.jsx";
import StatusPill from "./StatusPill.jsx";
import AriaNavOrb from "../AriaNavOrb.jsx";
import { NAV_TAB_LOGOS } from "../NavTabLogos.jsx";
import { ENGINE_DISPLAY } from "../../simulator.js";
import { getCellPillLabel, getTesterDisplayName, isHeadRole } from "../../utils/testerRegistry.js";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "sensorhealth", label: "Sensor Health" },
  { id: "manualinput", label: "Sensor Input" },
  { id: "validation", label: "Validation Demo" },
  { id: "cellboard", label: "Cell Board" },
  { id: "operations", label: "Cell Ops" },
  { id: "comms", label: "Ops Chat" },
  { id: "digitaltwin", label: "Digital Twin" },
  { id: "federated", label: "Federated Learning" },
  { id: "chat", icon: "aria", label: "ARIA" },
];

function formatClockParts(date) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const h12 = hours % 12 || 12;
  const ampm = hours >= 12 ? "PM" : "AM";
  const pad = (n) => String(n).padStart(2, "0");
  return { h12: pad(h12), minutes: pad(minutes), seconds: pad(seconds), ampm, tick: seconds };
}

export default function AppSideRail({
  activeTab,
  onTabChange,
  unreadCommsCount = 0,
  opsTabBadgeCount = 0,
  isStreaming,
  readingCount,
  role,
  onLogout,
  onManageTesters,
  activeEngine,
  onGenerateReport,
  hasReadings,
  leakActive = false,
  headViewingTester = null,
  headViewingName = null,
  cellLabel = null,
  mirrorWaiting = false,
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const clock = useMemo(() => formatClockParts(now), [now]);
  const engineLabel = activeEngine ? (ENGINE_DISPLAY[activeEngine] || activeEngine) : "—";
  const bayPillLabel = cellLabel || getCellPillLabel({ role, viewingTester: headViewingTester });
  const streamTone = mirrorWaiting ? "offline" : leakActive ? "leak" : isStreaming ? "live" : "paused";
  const streamLabel = mirrorWaiting
    ? "BAY OFFLINE"
    : leakActive
      ? "LEAK ACTIVE"
      : isStreaming
        ? "LIVE"
        : "PAUSED";
  const isHead = isHeadRole(role);

  return (
    <aside className="app-side-rail">
      <div className="app-side-rail__brand">
        <ProductBrandLockup variant="header" showSubtitle={false} />
      </div>

      <div className="app-side-rail__status">
        <StatusPill tone={streamTone} showDot={leakActive || isStreaming} label={streamLabel} />
        <StatusPill tone="engine" icon="⚡" label={engineLabel} />
        <StatusPill tone="cell" label={bayPillLabel} />
        <StatusPill
          tone={mirrorWaiting ? "neutral" : isStreaming ? "reading" : "neutral"}
          label={`#${mirrorWaiting ? "—" : readingCount}`}
        />
      </div>

      <nav className="app-side-rail__nav" aria-label="Main navigation">
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          const TabLogo = tab.icon !== "aria" ? NAV_TAB_LOGOS[tab.id] : null;
          const badge =
            tab.id === "comms" ? unreadCommsCount :
            tab.id === "operations" ? opsTabBadgeCount : 0;

          return (
            <button
              key={tab.id}
              type="button"
              className={`app-side-rail__nav-btn ${active ? "is-active" : ""} ${tab.id === "chat" ? "is-aria" : ""}`}
              onClick={() => onTabChange(tab.id)}
              title={tab.label}
            >
              {tab.icon === "aria" ? (
                <AriaNavOrb active={active} />
              ) : TabLogo ? (
                <TabLogo active={active} />
              ) : null}
              <span className="app-side-rail__nav-label">{tab.label}</span>
              {badge > 0 && <span className="app-side-rail__nav-badge">{badge}</span>}
            </button>
          );
        })}
      </nav>

      <div className="app-side-rail__footer">
        <div className="app-side-rail__clock mono">
          {clock.h12}:{clock.minutes}:{clock.seconds} {clock.ampm}
        </div>
        <button
          type="button"
          className={`app-side-rail__action ${hasReadings ? "is-ready" : ""}`}
          onClick={onGenerateReport}
          disabled={!hasReadings}
        >
          Session Report
        </button>
        {isHead && onManageTesters && (
          <button type="button" className="app-side-rail__action" onClick={onManageTesters}>
            Manage Bays
          </button>
        )}
        <button type="button" className="app-side-rail__action app-side-rail__action--logout" onClick={onLogout}>
          Logout
        </button>
        <div className="app-side-rail__user">
          {isHead ? (headViewingName || "Test Head") : getTesterDisplayName(role)}
        </div>
      </div>
    </aside>
  );
}
