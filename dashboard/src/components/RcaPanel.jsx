/**
 * RcaPanel.jsx — Root Cause Analysis display with physics-accurate disambiguation.
 */

import React, { useState } from "react";
import { DISAMBIG_LABELS } from "../utils/rootCauseEngine.js";

const SEVERITY_COLORS = {
  None: { text: "text-hud-textMuted", bg: "bg-hud-textMuted/10", border: "border-hud-textMuted/30" },
  Minor: { text: "text-[#F59E0B]", bg: "bg-[#F59E0B]/10", border: "border-[#F59E0B]/40" },
  Moderate: { text: "text-hud-red", bg: "bg-hud-red/10", border: "border-hud-red/40" },
};

const RANK_COLORS = [
  { bar: "bg-hud-red", border: "border-hud-red/50", badge: "bg-hud-red/20 text-hud-red" },
  { bar: "bg-[#F59E0B]", border: "border-[#F59E0B]/50", badge: "bg-[#F59E0B]/20 text-[#F59E0B]" },
  { bar: "bg-hud-cyan", border: "border-hud-cyan/50", badge: "bg-hud-cyan/20 text-hud-cyan" },
];

function ruleLabel(rule) {
  if (typeof rule === "string") return rule;
  return DISAMBIG_LABELS[rule.label] || rule.label;
}

function CauseCard({ cause, expanded, onToggle, disambiguationApplied }) {
  const color = RANK_COLORS[cause.rank - 1] ?? RANK_COLORS[2];
  const barWidth = `${Math.round(cause.probability * 100)}%`;

  const appliedRules = (cause.disambiguationReasons || [])
    .map((id) => {
      const match = disambiguationApplied?.find(
        (r) => (typeof r === "object" ? r.label : null) === id
      );
      return match && typeof match === "object" ? match.message : DISAMBIG_LABELS[id] || id;
    })
    .filter(Boolean);

  return (
    <div className={`rounded-lg border ${color.border} bg-hud-card/50 transition-all duration-200`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold ${color.badge}`}>
          {cause.rank}
        </span>
        <span className="flex-1 text-sm font-semibold text-white">{cause.label}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${color.badge}`}>
          {cause.probabilityPct}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-hud-textMuted transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div className="mx-4 mb-2 h-1 rounded-full bg-hud-border">
        <div className={`h-1 rounded-full transition-all duration-700 ${color.bar}`} style={{ width: barWidth }} />
      </div>

      {expanded && (
        <div className="space-y-2 px-4 pb-4 pt-1">
          <div className="rounded-md bg-hud-bg1/60 px-3 py-2">
            <p className="mb-0.5 text-[9px] font-extrabold uppercase tracking-wider text-hud-textMuted/70">
              Physical Reasoning
            </p>
            <p className="text-xs text-hud-textMuted leading-relaxed">{cause.physicalReasoning}</p>
          </div>

          {appliedRules.length > 0 && (
            <div className="rounded-md border border-hud-cyan/20 bg-hud-cyan/5 px-3 py-2">
              <p className="mb-0.5 text-[9px] font-extrabold uppercase tracking-wider text-hud-cyan/70">
                Why This Probability
              </p>
              <ul className="list-disc pl-4 text-xs text-hud-textMuted leading-relaxed">
                {appliedRules.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-hud-bg1/60 px-3 py-2">
              <p className="mb-0.5 text-[9px] font-extrabold uppercase tracking-wider text-hud-textMuted/70">
                Inspect Action
              </p>
              <p className="text-xs text-hud-textMuted leading-relaxed">{cause.inspectAction}</p>
            </div>
            <div className="rounded-md bg-hud-bg1/60 px-3 py-2">
              <p className="mb-0.5 text-[9px] font-extrabold uppercase tracking-wider text-hud-textMuted/70">
                Tool Required
              </p>
              <p className="text-xs text-hud-textMuted leading-relaxed">{cause.tool}</p>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-hud-border/60 bg-hud-bg1/40 px-3 py-2">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-hud-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <div>
              <p className="mb-0.5 text-[9px] font-extrabold uppercase tracking-wider text-hud-textMuted/70">
                Visual Sign
              </p>
              <p className="text-xs italic text-hud-textMuted">{cause.visualSign}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DisambiguationChip({ rule }) {
  const isInfo = typeof rule === "object" && rule.type === "info";
  const isEgrConsequence = typeof rule === "object" && rule.label === "egr_cascade_consequence";

  if (isInfo || isEgrConsequence) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-hud-cyan/30 bg-hud-cyan/8 px-3 py-2">
        <span className="mt-0.5 text-hud-cyan text-sm">ℹ</span>
        <div>
          <p className="text-[10px] font-bold text-hud-cyan">
            {isEgrConsequence ? "Expected consequence" : "Physics note"} — {ruleLabel(rule)}
          </p>
          {typeof rule === "object" && rule.message && (
            <p className="mt-0.5 text-[11px] leading-relaxed text-hud-cyan/80">{rule.message}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 px-3 py-2">
      <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <div>
        <p className="text-[10px] font-bold text-[#F59E0B]">Warning — {ruleLabel(rule)}</p>
        {typeof rule === "object" && rule.message && (
          <p className="mt-0.5 text-[11px] leading-relaxed text-[#F59E0B]/80">{rule.message}</p>
        )}
      </div>
    </div>
  );
}

export default function RcaPanel({ rcaResult, secondaryRcaResult, multiRcaResults = [], multiPattern, latestPrediction }) {
  const [expandedRank, setExpandedRank] = useState(1);
  const [cascadeOpen, setCascadeOpen] = useState(false);
  const multi = multiPattern ?? latestPrediction?.Multi_Pattern ?? null;
  const isMulti = Boolean(multi?.is_multi_leak);

  const toggleRank = (rank) => setExpandedRank((prev) => (prev === rank ? null : rank));

  if (!rcaResult || rcaResult.leakLocation === "None" || (!rcaResult.rankedCauses?.length && !rcaResult.isNovelAnomaly)) {
    return (
      <div className="dash-empty-state">
        <span className="dash-empty-state-icon">✓</span>
        <span className="dash-empty-state-title">NO ACTIVE LEAK</span>
        <span className="dash-empty-state-hint">Root cause analysis activates automatically when a leak is detected.</span>
      </div>
    );
  }

  const sevColors = SEVERITY_COLORS[rcaResult.severity] ?? SEVERITY_COLORS.None;

  return (
    <div className="rounded-xl border border-hud-border bg-hud-card/60 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-hud-red" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-[9px] font-extrabold uppercase tracking-widest text-hud-textMuted/70">
            Root Cause Analysis
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-hud-border bg-hud-bg1/60 px-2 py-0.5 text-[10px] font-bold text-white">
            {rcaResult.leakLocation.replace(/_/g, " ")}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${sevColors.bg} ${sevColors.border} ${sevColors.text}`}>
            {rcaResult.severity}
          </span>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-hud-border/50 bg-hud-bg1/50 px-3 py-2">
        <p className="mb-1 text-[9px] font-extrabold uppercase tracking-wider text-hud-textMuted/70">
          SHAP Pattern
        </p>
        <p className="text-xs leading-relaxed text-hud-textMuted">{rcaResult.shapPatternSummary}</p>
      </div>

      {rcaResult.cascadeExplanation && (
        <div className="mb-4 rounded-lg border border-hud-border/40 bg-hud-bg1/40">
          <button
            type="button"
            onClick={() => setCascadeOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-left"
          >
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-hud-textMuted/70">
              Physical cascade chain →
            </span>
            <svg
              className={`h-4 w-4 text-hud-textMuted transition-transform ${cascadeOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {cascadeOpen && (
            <p className="border-t border-hud-border/30 px-3 py-2 text-xs leading-relaxed text-hud-textMuted">
              {rcaResult.cascadeExplanation}
            </p>
          )}
        </div>
      )}

      {rcaResult.isNovelAnomaly ? (
        <div className="mb-4 space-y-2 rounded-lg border border-[#F59E0B]/50 bg-[#F59E0B]/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-[#F59E0B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#F59E0B]">
              NOVEL ANOMALY DETECTED
            </span>
          </div>
          <p className="text-xs text-[#F59E0B]/90 leading-relaxed">
            Historical knowledge base match confidence is too low. The physical root cause and inspection steps must be deduced dynamically by the AI Diagnostic Assistant.
          </p>
        </div>
      ) : (
        <div className="mb-4 space-y-2">
          <p className="mb-2 text-[9px] font-extrabold uppercase tracking-wider text-hud-textMuted/70">
            Ranked Root Causes
          </p>
          {rcaResult.rankedCauses.map((cause) => (
            <CauseCard
              key={cause.rank}
              cause={cause}
              expanded={expandedRank === cause.rank}
              onToggle={() => toggleRank(cause.rank)}
              disambiguationApplied={rcaResult.disambiguationApplied}
            />
          ))}
        </div>
      )}

      {rcaResult.disambiguationApplied?.length > 0 && (
        <div className="mb-3 space-y-2">
          <p className="mb-1 text-[9px] font-extrabold uppercase tracking-wider text-hud-textMuted/70">
            Disambiguation Rules Applied
          </p>
          {rcaResult.disambiguationApplied.map((rule, i) => (
            <DisambiguationChip key={i} rule={rule} />
          ))}
        </div>
      )}

      {rcaResult.notes?.length > 0 && (
        <div className="space-y-2">
          {rcaResult.notes
            .filter((n) => typeof n === "object" && n.type === "warning")
            .map((note, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 px-3 py-2"
              >
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[11px] leading-relaxed text-[#F59E0B]/80">{note.message}</p>
              </div>
            ))}
        </div>
      )}

      {isMulti && (multiRcaResults.length > 1 ? multiRcaResults.slice(1) : secondaryRcaResult ? [secondaryRcaResult] : []).map((secRca, idx) => (
        <div key={secRca.leakLocation || idx} className="mt-4 rounded-lg border border-[#7C3AED]/40 bg-[#1A0B2E]/60 p-3">
          <p className="mb-2 text-[9px] font-extrabold uppercase tracking-wider text-[#7C3AED]">
            {idx === 0 ? "Secondary Leak" : `Leak ${idx + 2}`} — Root Cause
          </p>
          <p className="mb-2 text-xs font-semibold text-white">
            {(secRca.leakLocation || "").replace(/_/g, " ")}
          </p>
          {(secRca.rankedCauses || []).slice(0, 2).map((cause) => (
            <div key={cause.rank} className="mb-2 rounded-md border border-[#7C3AED]/25 bg-black/20 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-purple-100">{cause.label}</span>
                <span className="text-[10px] font-bold text-[#7C3AED]">{cause.probabilityPct}</span>
              </div>
              <p className="mt-1 text-[11px] text-purple-200/70">{cause.physicalReasoning}</p>
            </div>
          ))}
        </div>
      ))}

      <p className="mt-3 text-right text-[9px] font-mono text-hud-textMuted/30">
        RCA computed at {new Date(rcaResult.timestamp).toLocaleTimeString()}
      </p>
    </div>
  );
}
