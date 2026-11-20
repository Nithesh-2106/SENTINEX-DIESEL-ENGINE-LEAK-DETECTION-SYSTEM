import React, { useMemo } from "react";
import { SCENARIO_LABELS, ENGINE_DISPLAY } from "../simulator.js";
import { getTesterBayId, isTesterRole } from "../utils/testerRegistry.js";
import { getTesterBayTone } from "../utils/testerBayTone.js";
import { computeCellStats } from "./HeadCellOverview.jsx";

function pillClass(kind) {
  if (kind === "ok") return "judge-answer-pill--ok";
  if (kind === "warn") return "judge-answer-pill--warn";
  if (kind === "bad") return "judge-answer-pill--bad";
  if (kind === "info") return "judge-answer-pill--info";
  return "judge-answer-pill--muted";
}

function SummaryRow({ label, answer, tone = "muted" }) {
  return (
    <div className="judge-status-row">
      <span className="judge-status-label">{label}</span>
      <span className={`judge-answer-pill ${pillClass(tone)}`}>{answer}</span>
    </div>
  );
}

export default function HeadCellAggregateSummary({ boardTesters = [], onMirrorTester }) {
  const stats = useMemo(() => computeCellStats(boardTesters), [boardTesters]);

  const topLeak = useMemo(() => {
    let best = null;
    stats.leakBays.forEach((t) => {
      const conf = t.snap?.latestPrediction?.Confidence_Score ?? 0;
      if (!best || conf > best.conf) {
        best = {
          tester: t,
          conf,
          loc: t.snap?.latestPrediction?.Leak_Location?.replace(/_/g, " "),
          severity: t.snap?.latestPrediction?.Leak_Severity,
        };
      }
    });
    return best;
  }, [stats.leakBays]);

  const engineMix = useMemo(() => {
    const counts = {};
    stats.bays.forEach((t) => {
      const eng = t.presence?.engine || t.snap?.activeEngine;
      if (!eng) return;
      const label = ENGINE_DISPLAY[eng] || eng;
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.entries(counts).map(([k, v]) => `${k} (${v})`).join(" · ") || "—";
  }, [stats.bays]);

  const scenarioMix = useMemo(() => {
    const active = stats.bays.filter((t) => t.online);
    if (!active.length) return "No live scenarios";
    return active
      .map((t) => {
        const sc = t.presence?.scenario || t.snap?.currentScenario;
        const label = SCENARIO_LABELS[sc] || sc || "Normal";
        return `${t.displayName.split(" ").pop()}: ${label.split(" ")[0]}`;
      })
      .join(" · ");
  }, [stats.bays]);

  const cellTone = stats.leakCount > 0 ? "bad" : stats.online === 0 ? "muted" : stats.streaming > 0 ? "ok" : "warn";
  const cellLabel = stats.leakCount > 0
    ? `${stats.leakCount} LEAK${stats.leakCount > 1 ? "S" : ""} ACTIVE`
    : stats.online === 0
      ? "NO BAYS ONLINE"
      : stats.streaming > 0
        ? "MONITORING LIVE"
        : "BAYS IDLE";

  return (
    <div className="section-card compact judge-summary-card head-cell-aggregate">
      <div className="section-card-header">
        <div className="section-card-title">CELL JUDGE SUMMARY</div>
        <span className="api-badge">SUPERVISOR</span>
      </div>

      <div className="section-card-body head-cell-aggregate__body">
        <div className="head-cell-aggregate__hero">
          <span className={`head-cell-aggregate__health head-cell-aggregate__health--${stats.cellState}`}>
            {cellLabel}
          </span>
          <p className="head-cell-aggregate__sub">
            {stats.online} of {stats.total} bays online · {stats.streaming} streaming · {stats.totalReadings} combined readings
          </p>
        </div>

        <div className="judge-summary-answers">
          <SummaryRow label="Cell health" answer={cellLabel} tone={cellTone} />
          <SummaryRow label="Bays online" answer={`${stats.online} / ${stats.total}`} tone={stats.online === stats.total ? "ok" : "warn"} />
          <SummaryRow label="Live streams" answer={String(stats.streaming)} tone={stats.streaming > 0 ? "ok" : "muted"} />
          <SummaryRow label="Avg DQ score" answer={`${stats.avgDq}/100`} tone={stats.avgDq >= 80 ? "ok" : "warn"} />
          <SummaryRow label="Engine mix" answer={engineMix} tone="info" />
          <SummaryRow label="Scenario mix" answer={scenarioMix} tone="info" />
          {topLeak && (
            <>
              <SummaryRow
                label="Top leak"
                answer={`${topLeak.tester.displayName}: ${topLeak.loc || "—"}`}
                tone="bad"
              />
              <SummaryRow
                label="Peak confidence"
                answer={`${(topLeak.conf * 100).toFixed(1)}% · ${topLeak.severity || "—"}`}
                tone="bad"
              />
            </>
          )}
          <SummaryRow label="Pipeline" answer="Multi-bay mirror via localStorage" tone="info" />
        </div>

        <div className="head-cell-aggregate__mirror-list">
          <span className="head-cell-aggregate__mirror-label">Quick mirror</span>
          {stats.bays.map((t) => {
            const tone = getTesterBayTone(t);
            const bayId = getTesterBayId(t.id);
            return (
              <button
                key={t.id}
                type="button"
                className={`head-cell-aggregate__mirror-btn head-cell-aggregate__mirror-btn--${tone}`}
                onClick={() => onMirrorTester?.(t.id)}
                disabled={!t.online}
              >
                <span className="head-cell-aggregate__mirror-dot" />
                <span>{t.displayName}</span>
                <span className="head-cell-aggregate__mirror-bay">{bayId}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
