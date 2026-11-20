import React, { useEffect, useMemo, useState } from "react";
import ProductBrandLockup from "../ProductBrandLockup.jsx";
import StatusPill from "./StatusPill.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import { ENGINE_DISPLAY } from "../../simulator.js";
import { getCellPillLabel, getTesterDisplayName, isHeadRole } from "../../utils/testerRegistry.js";

function formatClockParts(date) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const h12 = hours % 12 || 12;
  const ampm = hours >= 12 ? "PM" : "AM";
  const pad = (n) => String(n).padStart(2, "0");

  return {
    h12: pad(h12),
    minutes: pad(minutes),
    seconds: pad(seconds),
    ampm,
    tick: seconds,
  };
}

function formatTimezoneInfo(date) {
  const dateLine = date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const offsetPart = new Intl.DateTimeFormat("en", { timeZoneName: "shortOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value;

  const zoneId = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";
  const shortZone = zoneId.includes("/") ? zoneId.split("/").pop().replace(/_/g, " ") : zoneId;

  return {
    dateLine,
    gmt: offsetPart || "GMT",
    zone: shortZone,
  };
}

export default function TopBar({
  isStreaming,
  readingCount,
  role,
  onLogout,
  onManageTesters,
  onOpenAccount,
  onOpenFlGlobe,
  flGlobeActive = false,
  accountActive = false,
  activeEngine,
  onGenerateReport,
  reportReady = false,
  isRecording = false,
  leakActive = false,
  headViewingTester = null,
  headViewingName = null,
  cellLabel = null,
  mirrorWaiting = false,
  operatorView = false,
  onOperatorViewChange,
}) {
  const [now, setNow] = useState(() => new Date());
  const presentMode = !operatorView;

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const clock = useMemo(() => formatClockParts(now), [now]);
  const tz = useMemo(() => formatTimezoneInfo(now), [now]);
  const { toggleTheme, isDark } = useTheme();
  const engineLabel = activeEngine
    ? (ENGINE_DISPLAY[activeEngine] || activeEngine)
    : "—";
  const bayPillLabel = cellLabel || getCellPillLabel({ role, viewingTester: headViewingTester });

  const streamTone = mirrorWaiting ? "offline" : leakActive ? "leak" : isStreaming ? "live" : "paused";
  const streamLabel = mirrorWaiting
    ? "BAY OFFLINE"
    : leakActive
      ? "LEAK ACTIVE"
      : isStreaming
        ? "LIVE MONITORING"
        : "PAUSED";
  const isHead = isHeadRole(role);
  const roleTitle = isHead
    ? (headViewingName ? `VIEWING: ${headViewingName.toUpperCase()}` : "TEST HEAD")
    : getTesterDisplayName(role).toUpperCase();
  const roleSub = isHead
    ? (headViewingTester ? "Mirrored bay dashboard" : "Supervisor · select a bay")
    : "Operator · parallel bay";

  return (
    <header className="topbar liquid-glass-bar">
      <div className="topbar-logo">
        <ProductBrandLockup variant="header" showSubtitle />
      </div>

      <div className="topbar-center">
        <StatusPill tone={streamTone} showDot={leakActive || isStreaming} label={streamLabel} />
        <StatusPill tone="engine" icon="⚡" label={engineLabel} />
        <StatusPill tone="cell" label={bayPillLabel} />
        <StatusPill
          tone={mirrorWaiting ? "neutral" : isStreaming ? "reading" : "neutral"}
          label={`READING #${mirrorWaiting ? "—" : readingCount}`}
        />
      </div>

      <div className="topbar-right">
        <div className="topbar-clock-block">
          <div className="topbar-clock-live" key={clock.tick}>
            <span className="clock-h">{clock.h12}</span>
            <span className="clock-sep clock-sep--blink">:</span>
            <span className="clock-m">{clock.minutes}</span>
            <span className="clock-sep clock-sep--blink">:</span>
            <span className="clock-s clock-s--tick">{clock.seconds}</span>
            <span className="clock-ampm">{clock.ampm}</span>
          </div>
          <div className="topbar-clock-meta">
            <span className="clock-date-line">{tz.dateLine}</span>
            <span className="clock-tz-sep">·</span>
            <span className="clock-gmt">{tz.gmt}</span>
            <span className="clock-tz-sep">·</span>
            <span className="clock-zone">{tz.zone}</span>
          </div>
        </div>

        <button
          type="button"
          className={`topbar-view-mode-btn ${presentMode ? "active" : ""}`}
          onClick={() => onOperatorViewChange?.(!operatorView)}
          title={
            presentMode
              ? "Show Manual Input and Validation Demo tabs for operators"
              : "Hide operator-only tabs for judge presentation"
          }
        >
          {presentMode ? "OPERATOR VIEW" : "PRESENT MODE"}
        </button>

        <button
          type="button"
          className="theme-toggle-btn"
          onClick={toggleTheme}
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          aria-label="Toggle theme"
        >
          <span className="theme-toggle-icon">{isDark ? "☀" : "◗"}</span>
        </button>

        {onOpenFlGlobe && (
          <button
            type="button"
            className={`topbar-globe-btn ${flGlobeActive ? "topbar-globe-btn--active" : ""}`}
            onClick={onOpenFlGlobe}
            title="Open global facility map"
            aria-label="Open global facility map"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
              <path d="M3 12h18M12 3c2.8 3.2 2.8 14.8 0 18M12 3c-2.8 3.2-2.8 14.8 0 18" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
        )}

        <div className="topbar-right-divider" aria-hidden />

        <button
          type="button"
          className={`topbar-report-btn ${isRecording ? "recording" : ""} ${reportReady ? "ready" : ""}`}
          onClick={onGenerateReport}
          disabled={isRecording || !reportReady}
          title={
            isRecording
              ? "Recording session — stop streaming to finalize and export"
              : reportReady
                ? "Open session report and download PDF"
                : "Start streaming to record a session"
          }
        >
          <span className="topbar-report-icon" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M14 2v6h6M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <span className="topbar-report-text">
            <span className="topbar-report-label">
              {isRecording ? "RECORDING" : "SESSION REPORT"}
            </span>
            <span className="topbar-report-sub">
              {isRecording ? "Stop to export" : "Export PDF"}
            </span>
          </span>
        </button>

        <div className="topbar-right-divider" aria-hidden />

        <div className="topbar-user-block">
          {isHead && onManageTesters && (
            <button
              type="button"
              className="topbar-manage-btn"
              onClick={onManageTesters}
              title="Add, modify, or delete tester consoles"
            >
              MANAGE BAYS
            </button>
          )}
          {!isHead && onOpenAccount && (
            <button
              type="button"
              className={`topbar-manage-btn topbar-account-btn ${accountActive ? "topbar-account-btn--active" : ""}`}
              onClick={onOpenAccount}
              title="Open your account dashboard — bay profile, console status, credentials"
            >
              MY ACCOUNT
            </button>
          )}
          <div className={`topbar-role-badge ${isHead ? "head" : "tester"}`}>
            <span className="topbar-role-avatar" aria-hidden>{isHead ? "H" : "T"}</span>
            <span className="topbar-role-text">
              <span className="topbar-role-title">{roleTitle}</span>
              <span className="topbar-role-sub">{roleSub}</span>
            </span>
          </div>
          <button type="button" className="topbar-logout-btn" onClick={onLogout}>
            LOGOUT
          </button>
        </div>
      </div>
    </header>
  );
}
