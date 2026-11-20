import React, { useMemo } from "react";
import { DISAMBIG_LABELS } from "../utils/rootCauseEngine.js";
import { isHeadRole, isTesterRole } from "../utils/testerRegistry.js";
import { getTesterBayTone } from "../utils/testerBayTone.js";
import { AriaInsightRail } from "./AriaRobot.jsx";
import {
  stabilizeActiveLeaks,
  formatLeakLocation,
  isMultiLeakPrediction,
} from "../utils/multiLeak.js";

const RANK_COLORS = [
  { bar: "bg-gradient-to-r from-red-600 to-orange-500", badge: "bg-red-500/20 text-red-300 border border-red-500/30" },
  { bar: "bg-gradient-to-r from-amber-500 to-yellow-400", badge: "bg-amber-500/20 text-amber-300 border border-amber-500/30" },
  { bar: "bg-gradient-to-r from-slate-500 to-slate-400", badge: "bg-slate-600/30 text-slate-300 border border-slate-500/30" },
];

function CauseCard({ cause }) {
  const c = RANK_COLORS[cause.rank - 1] ?? RANK_COLORS[2];
  const probNum = parseFloat(String(cause.probabilityPct).replace("%", "")) || 0;
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3.5">
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${c.badge}`}>
          {cause.rank}
        </span>
        <span className="flex-1 text-xs font-semibold text-white leading-snug">{cause.label}</span>
        <span className="font-mono text-xs font-bold text-white/70">{cause.probabilityPct}</span>
      </div>
      <div className="mb-2.5 h-1 w-full overflow-hidden rounded-full bg-white/5">
        <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${probNum}%` }} />
      </div>
      <p className="mb-2.5 text-[11px] leading-relaxed text-slate-400">{cause.physicalReasoning}</p>
      <div className="flex items-start gap-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-2.5 py-2">
        <span className="mt-0.5 shrink-0 text-sky-400 text-xs">⚙</span>
        <p className="text-[11px] text-sky-200/80 leading-snug">{cause.inspectAction}</p>
      </div>
    </div>
  );
}

function CompactBayRcaCard({ tester, selected, onSelect }) {
  const tone = getTesterBayTone(tester);
  const snap = tester.snap;
  const pred = snap?.latestPrediction;
  const rca = snap?.latestRca;
  const leak = Boolean(pred?.Leak_Present === 1 && !pred?.Suppressed);
  const top = rca?.rankedCauses?.[0];

  return (
    <button
      type="button"
      className={`aria-bay-rca-card aria-bay-rca-card--${tone} ${selected ? "aria-bay-rca-card--selected" : ""}`}
      onClick={() => onSelect?.(tester.id)}
    >
      <div className="aria-bay-rca-card__head">
        <span className={`aria-bay-rca-card__dot aria-bay-rca-card__dot--${tone}`} aria-hidden />
        <span className="aria-bay-rca-card__name">{tester.displayName}</span>
        <span className="aria-bay-rca-card__status">{tester.online ? (leak ? "LEAK" : "NORMAL") : "OFFLINE"}</span>
      </div>
      {tester.online && leak && top && (
        <p className="aria-bay-rca-card__cause">#{top.rank} {top.label} · {top.probabilityPct}</p>
      )}
      {tester.online && !leak && (
        <p className="aria-bay-rca-card__cause aria-bay-rca-card__cause--muted">No active leak</p>
      )}
      {!tester.online && (
        <p className="aria-bay-rca-card__cause aria-bay-rca-card__cause--muted">Bay offline</p>
      )}
    </button>
  );
}

export default function DiagnosticsSidePanel({
  latestPrediction,
  rcaResult,
  multiRcaResults = [],
  activeScenario = null,
  isStreaming = false,
  readingCount = 0,
  role = null,
  boardTesters = [],
  ariaFocusTester = null,
  onAriaFocusTesterChange,
}) {
  const hasLeak = latestPrediction?.Leak_Present === 1 && !latestPrediction?.Suppressed;
  const activeLeaks = stabilizeActiveLeaks(latestPrediction, activeScenario);
  const isMulti = isMultiLeakPrediction(latestPrediction) && activeLeaks.length >= 2;
  const leakLoc = latestPrediction?.Leak_Location?.replace(/_/g, " ");

  const isHead = isHeadRole(role);
  const bayTesters = useMemo(
    () => boardTesters.filter((t) => isTesterRole(t.id)),
    [boardTesters],
  );
  const showOverview = isHead && !ariaFocusTester;

  return (
    <aside className="diagnostics-side-panel">
      {isHead && (
        <div className="aria-tester-focus-bar">
          <label className="aria-tester-focus-bar__label" htmlFor="aria-tester-select">
            Bay focus
          </label>
          <select
            id="aria-tester-select"
            className="aria-tester-focus-bar__select"
            value={ariaFocusTester || ""}
            onChange={(e) => onAriaFocusTesterChange?.(e.target.value || null)}
          >
            <option value="">Overview — all bays</option>
            {bayTesters.map((t) => (
              <option key={t.id} value={t.id}>
                {t.displayName}{t.online ? "" : " (offline)"}
              </option>
            ))}
          </select>
        </div>
      )}

      {showOverview && (
        <div className="aria-bay-rca-overview">
          <p className="aria-bay-rca-overview__title">Cell RCA overview</p>
          <div className="aria-bay-rca-overview__list">
            {bayTesters.map((t) => (
              <CompactBayRcaCard
                key={t.id}
                tester={t}
                selected={false}
                onSelect={onAriaFocusTesterChange}
              />
            ))}
          </div>
        </div>
      )}

      {!showOverview && (
        <>
      <AriaInsightRail
        latestPrediction={latestPrediction}
        rcaResult={rcaResult}
        multiRcaResults={multiRcaResults}
        activeScenario={activeScenario}
        isStreaming={isStreaming}
        readingCount={readingCount}
      />
      <div className="diag-rca-section diag-rca-section-full">
        <div className="diag-rca-header">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20">
              <svg className="h-3 w-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <span className="diag-panel-label mb-0">Root Cause Analysis</span>
          </div>
          {hasLeak && isMulti && (
            <div className="mt-2 flex flex-col gap-2">
              {activeLeaks.slice(0, 2).map((leak, idx) => {
                const leakRca = multiRcaResults[idx] || (idx === 0 ? rcaResult : null);
                return (
                  <div key={leak.location} className="flex flex-wrap gap-1.5">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${idx === 0 ? "border-orange-500/30 bg-orange-900/20 text-orange-300" : "border-purple-500/30 bg-purple-900/20 text-purple-300"}`}>
                      {idx === 0 ? "Primary" : "Secondary"}: {formatLeakLocation(leak.location)}
                    </span>
                    {(leakRca?.severity || leak.severity) && (
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-semibold text-slate-300">
                        {leakRca?.severity || leak.severity}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {hasLeak && !isMulti && leakLoc && leakLoc !== "None" && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full border border-orange-500/30 bg-orange-900/20 px-2.5 py-0.5 text-[10px] font-bold text-orange-300">
                {leakLoc}
              </span>
              {rcaResult?.severity && rcaResult.severity !== "None" && (
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-semibold text-slate-300">
                  {rcaResult.severity}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="diag-rca-body">
          {!hasLeak && (
            <div className="diag-rca-empty">
              <p className="text-xs text-slate-500 leading-relaxed">
                No active leak. RCA will populate automatically when the ML pipeline detects a leak signature.
              </p>
            </div>
          )}

          {hasLeak && isMulti && !multiRcaResults.length && !rcaResult && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-500/30 border-t-sky-400" />
              Computing RCA for both leaks…
            </div>
          )}

          {hasLeak && isMulti && activeLeaks.slice(0, 2).map((leak, idx) => {
            const leakRca = multiRcaResults[idx] || (idx === 0 ? rcaResult : null);
            if (!leakRca) return null;
            return (
              <div key={leak.location} className="mb-4">
                <p className={`mb-2 text-[10px] font-bold uppercase tracking-wider ${idx === 0 ? "text-orange-400" : "text-purple-400"}`}>
                  {idx === 0 ? "Primary" : "Secondary"} — {formatLeakLocation(leak.location)}
                </p>
                {leakRca.shapPatternSummary && (
                  <div className="mb-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
                    <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">SHAP Pattern</p>
                    <p className="text-[11px] leading-relaxed text-slate-400">{leakRca.shapPatternSummary}</p>
                  </div>
                )}
                {leakRca.cascadeExplanation && (
                  <div className="mb-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2">
                    <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-sky-400">Cascade</p>
                    <p className="text-[11px] leading-relaxed text-sky-200/80">{leakRca.cascadeExplanation}</p>
                  </div>
                )}
                {leakRca.rankedCauses?.map((cause) => (
                  <CauseCard key={`${leak.location}-${cause.rank}`} cause={cause} />
                ))}
              </div>
            );
          })}

          {hasLeak && !isMulti && !rcaResult && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-500/30 border-t-sky-400" />
              Computing RCA…
            </div>
          )}

          {hasLeak && !isMulti && rcaResult?.shapPatternSummary && (
            <div className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
              <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">SHAP Pattern</p>
              <p className="text-[11px] leading-relaxed text-slate-400">{rcaResult.shapPatternSummary}</p>
            </div>
          )}

          {hasLeak && !isMulti && rcaResult?.cascadeExplanation && (
            <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2">
              <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-sky-400">Cascade</p>
              <p className="text-[11px] leading-relaxed text-sky-200/80">{rcaResult.cascadeExplanation}</p>
            </div>
          )}

          {hasLeak && !isMulti && rcaResult?.disambiguationApplied?.map((rule, i) => {
            const isInfo = typeof rule === "object" && (rule.type === "info" || rule.label === "egr_cascade_consequence");
            const label = typeof rule === "object" ? (DISAMBIG_LABELS[rule.label] || rule.label) : rule;
            const msg = typeof rule === "object" ? rule.message : null;
            return (
              <div
                key={i}
                className={`rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${isInfo ? "border-sky-500/25 bg-sky-500/8 text-sky-200/80" : "border-amber-500/25 bg-amber-500/8 text-amber-200/80"}`}
              >
                <span className="font-bold">{isInfo ? "ℹ Expected consequence" : "⚠ Warning"} — {label}</span>
                {msg && <p className="mt-1 opacity-90">{msg}</p>}
              </div>
            );
          })}

          {hasLeak && !isMulti && rcaResult?.rankedCauses?.map((cause) => (
            <CauseCard key={cause.rank} cause={cause} />
          ))}
        </div>
      </div>
        </>
      )}
    </aside>
  );
}
