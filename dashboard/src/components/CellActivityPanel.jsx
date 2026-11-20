import React, { useEffect, useState } from "react";
import { SCENARIO_LABELS, ENGINE_DISPLAY } from "../simulator.js";
import { fetchAuditEvents, toCellActivity } from "../lib/supabaseAudit.js";
import { isHeadRole } from "../utils/testerRegistry.js";

const TYPE_COLOURS = {
  REQUEST_CREATED: "#22d3ee",
  REQUEST_APPROVED: "#4ade80",
  REQUEST_REJECTED: "#f87171",
  STREAM_START: "#60a5fa",
  STREAM_STOP: "#94a3b8",
  SCENARIO_CHANGE: "#fbbf24",
  ENGINE_CHANGE: "#c084fc",
  HEAD_APPLY: "#f472b6",
  RETURN_STEADY: "#a78bfa",
  LOGIN: "#38bdf8",
  TESTER_ADDED: "#34d399",
  INFO: "#94a3b8",
};

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString("en-GB", { hour12: false });
}

export default function CellActivityPanel({ role }) {
  const [activities, setActivities] = useState([]);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const rows = await fetchAuditEvents();
      if (!alive) return;
      setActivities(rows.map(toCellActivity));
    };

    void refresh();
    const poll = window.setInterval(refresh, 2500);
    const onActivity = () => {
      void refresh();
    };
    window.addEventListener("cat-cell-activity", onActivity);
    return () => {
      alive = false;
      clearInterval(poll);
      window.removeEventListener("cat-cell-activity", onActivity);
    };
  }, [role]);

  const merged = activities
    .map((a) => ({
      id: a.id,
      ts: a.ts,
      type: a.type,
      who: a.displayName || a.role,
      message: a.message,
    }))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 24);

  return (
    <div className="section-card compact cell-activity-panel">
      <div className="section-card-header">
        <span className="section-card-title">CELL ACTIVITY LOG</span>
        <span className="cell-activity-live-dot" aria-hidden />
      </div>
      <div className="section-card-body flush">
        <div className="cell-activity-scroll">
          {merged.length === 0 ? (
            <div className="cell-activity-empty">No cell activity yet — open parallel tester consoles to begin.</div>
          ) : (
            merged.map((row) => (
              <div key={row.id} className="cell-activity-row">
                <span
                  className="cell-activity-type"
                  style={{ color: TYPE_COLOURS[row.type] || TYPE_COLOURS.INFO }}
                >
                  {row.type.replace(/_/g, " ")}
                </span>
                <span className="cell-activity-who">{row.who}</span>
                <span className="cell-activity-msg">{row.message}</span>
                <span className="cell-activity-time">{fmtTime(row.ts)}</span>
              </div>
            ))
          )}
        </div>
        {isHeadRole(role) && (
          <p className="cell-activity-hint">Head view — activity syncs from Supabase across all consoles.</p>
        )}
      </div>
    </div>
  );
}

export function TesterLiveBoard({ liveTesters = [], selectedId, onSelect }) {
  return (
    <div className="tester-live-board">
      {liveTesters.map((t) => {
        const p = t.presence;
        const online = t.online;
        const selectable = Boolean(onSelect);
        const selected = selectedId === t.id;
        const scenarioLabel = p?.scenarioLabel || SCENARIO_LABELS[p?.scenario] || p?.scenario || "—";
        const leak = p?.leakDetected;

        return (
          <div
            key={t.id}
            role={selectable ? "button" : undefined}
            tabIndex={selectable ? 0 : undefined}
            className={`tester-live-card ${online ? "online" : "offline"} ${selected ? "selected" : ""} ${selectable ? "clickable" : ""} ${leak ? "leak" : ""}`}
            onClick={selectable ? () => onSelect(t.id) : undefined}
            onKeyDown={selectable ? (e) => { if (e.key === "Enter") onSelect(t.id); } : undefined}
          >
            <div className="tester-live-card__head">
              <span className={`tester-live-dot ${online ? "on" : ""} ${leak ? "leak" : ""}`} aria-hidden />
              <span className="tester-live-name">{t.displayName}</span>
              <span className="tester-live-id">{t.username}</span>
            </div>
            {online && p ? (
              <>
                <div className="tester-live-status">{p.statusLabel}</div>
                <div className="tester-live-meta">
                  <span>{ENGINE_DISPLAY[p.engine] || p.engine}</span>
                  <span>·</span>
                  <span className={leak ? "tester-live-scenario--leak" : "tester-live-scenario--normal"}>
                    {scenarioLabel}
                  </span>
                </div>
                <div className="tester-live-meta">
                  <span>{p.isStreaming ? "LIVE STREAM" : "PAUSED"}</span>
                  <span>·</span>
                  <span>#{p.readingCount || 0} readings</span>
                  <span>·</span>
                  <span>{(p.activeTab || "dashboard").toUpperCase()}</span>
                </div>
              </>
            ) : (
              <div className="tester-live-status offline">Offline — open this tester in a separate browser tab</div>
            )}
            {selectable && online && (
              <div className="tester-live-view-hint">Click to mirror dashboard</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
