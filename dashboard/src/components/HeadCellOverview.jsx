import React, { useMemo } from "react";
import { SCENARIO_LABELS } from "../simulator.js";
import { getTesterBayId, isTesterRole, TEST_CELL_ID } from "../utils/testerRegistry.js";
import { getTesterBayTone } from "../utils/testerBayTone.js";
import TesterBayPanel from "./TesterBayPanel.jsx";

function computeCellStats(boardTesters = []) {
  const bays = boardTesters.filter((t) => isTesterRole(t.id));
  let totalReadings = 0;
  let dqSum = 0;
  let dqCount = 0;
  let streaming = 0;
  let online = 0;
  let leakCount = 0;
  let faultCount = 0;
  const leakBays = [];

  bays.forEach((t) => {
    if (t.online) online += 1;
    const snap = t.snap;
    const p = t.presence;
    if (t.online) {
      totalReadings += p?.readingCount ?? snap?.readingCount ?? 0;
      if (p?.isStreaming || snap?.isStreaming) streaming += 1;
    }
    const tone = getTesterBayTone(t);
    if (tone === "leak") {
      leakCount += 1;
      leakBays.push(t);
    }
    if (tone === "sensorFault") faultCount += 1;
    const dq = snap?.latestPrediction?.Data_Quality?.score;
    if (dq != null) {
      dqSum += dq;
      dqCount += 1;
    }
  });

  const cellState = leakCount > 0
    ? "alert"
    : faultCount > 0
      ? "fault"
      : online === 0
      ? "idle"
      : streaming === 0
        ? "ready"
        : "nominal";

  return {
    bays,
    online,
    total: bays.length,
    streaming,
    leakCount,
    faultCount,
    leakBays,
    totalReadings,
    avgDq: dqCount ? Math.round(dqSum / dqCount) : 100,
    cellState,
  };
}

function CellTopology({ bays, onMirror }) {
  return (
    <div className="head-overview-topology" aria-hidden>
      <div className="head-overview-topology__hub">
        <span className="head-overview-topology__hub-label">HEAD</span>
        <span className="head-overview-topology__hub-sub">Supervisor</span>
      </div>
      <div className="head-overview-topology__spokes">
        {bays.map((t) => {
          const tone = getTesterBayTone(t);
          const bayId = getTesterBayId(t.id);
          return (
            <button
              key={t.id}
              type="button"
              className={`head-overview-topology__node head-overview-topology__node--${tone}`}
              onClick={() => onMirror?.(t.id)}
              title={`Mirror ${t.displayName}`}
            >
              <span className="head-overview-topology__node-dot" />
              <span className="head-overview-topology__node-id">{bayId}</span>
              <span className="head-overview-topology__node-name">{t.displayName}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function HeadCellOverview({ boardTesters = [], onMirrorTester }) {
  const stats = useMemo(() => computeCellStats(boardTesters), [boardTesters]);

  const stateLabel = stats.cellState === "alert"
    ? "LEAK ALERT"
    : stats.cellState === "idle"
      ? "ALL BAYS OFFLINE"
      : stats.cellState === "ready"
        ? "BAYS ONLINE · NOT STREAMING"
        : "NOMINAL OPERATION";

  return (
    <div className="head-cell-overview section-card">
      <div className="head-cell-overview__hero liquid-glass-panel">
        <div className="head-cell-overview__hero-main">
          <p className="head-cell-overview__eyebrow">Test Cell {TEST_CELL_ID} · All-bays supervisor view</p>
          <h2 className="head-cell-overview__title">Cell Overview</h2>
          <p className="head-cell-overview__desc">
            Real-time status across {stats.total} parallel tester bays. Select a bay from the dropdown or mirror any live console below.
          </p>
          <div className={`head-cell-overview__state head-cell-overview__state--${stats.cellState}`}>
            <span className="head-cell-overview__state-dot" />
            {stateLabel}
          </div>
        </div>
        <div className="head-cell-overview__kpi-row">
          <div className="head-cell-overview__kpi">
            <span className="head-cell-overview__kpi-val">{stats.online}/{stats.total}</span>
            <span className="head-cell-overview__kpi-lbl">Online</span>
          </div>
          <div className="head-cell-overview__kpi">
            <span className="head-cell-overview__kpi-val">{stats.streaming}</span>
            <span className="head-cell-overview__kpi-lbl">Streaming</span>
          </div>
          <div className={`head-cell-overview__kpi ${stats.leakCount ? "head-cell-overview__kpi--alert" : ""}`}>
            <span className="head-cell-overview__kpi-val">{stats.leakCount}</span>
            <span className="head-cell-overview__kpi-lbl">Active leaks</span>
          </div>
          <div className="head-cell-overview__kpi">
            <span className="head-cell-overview__kpi-val">{stats.totalReadings}</span>
            <span className="head-cell-overview__kpi-lbl">Total readings</span>
          </div>
          <div className="head-cell-overview__kpi">
            <span className="head-cell-overview__kpi-val">{stats.avgDq}</span>
            <span className="head-cell-overview__kpi-lbl">Avg DQ</span>
          </div>
        </div>
      </div>

      {stats.leakCount > 0 && (
        <div className="head-cell-overview__alerts">
          <span className="head-cell-overview__alerts-label">⚠ Active leak signatures</span>
          {stats.leakBays.map((t) => {
            const pred = t.snap?.latestPrediction;
            const loc = pred?.Leak_Location?.replace(/_/g, " ") || "Unknown";
            const conf = pred?.Confidence_Score != null ? `${(pred.Confidence_Score * 100).toFixed(1)}%` : "—";
            const scenario = SCENARIO_LABELS[t.presence?.scenario || t.snap?.currentScenario] || "Leak scenario";
            return (
              <button
                key={t.id}
                type="button"
                className="head-cell-overview__alert-chip"
                onClick={() => onMirrorTester?.(t.id)}
              >
                <strong>{t.displayName}</strong>
                <span>{loc} · {conf} · {scenario}</span>
              </button>
            );
          })}
        </div>
      )}

      <CellTopology bays={stats.bays} onMirror={onMirrorTester} />

      <div className="head-cell-overview__legend" aria-label="Bay status legend">
        <span className="cell-community-legend__item cell-community-legend__item--leak">Leak</span>
        <span className="cell-community-legend__item cell-community-legend__item--normal">Normal</span>
        <span className="cell-community-legend__item cell-community-legend__item--steady">Ready</span>
        <span className="cell-community-legend__item cell-community-legend__item--transitioning">Transitioning</span>
        <span className="cell-community-legend__item cell-community-legend__item--offline">Offline</span>
      </div>

      <div className="head-cell-overview__grid cell-bay-grid">
        {stats.bays.map((t) => (
          <TesterBayPanel
            key={t.id}
            tester={t}
            role="head"
            enhanced
            onMirror={onMirrorTester}
          />
        ))}
      </div>
    </div>
  );
}

export { computeCellStats };
