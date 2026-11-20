import React from "react";

const FLAG_ICONS = {
  SPIKE: { icon: "⚡", color: "text-[#F59E0B]" },
  DRIFT: { icon: "📉", color: "text-[#F59E0B]" },
  MISSING: { icon: "○", color: "text-[#94A3B8]" },
  HF_NOISE: { icon: "〰", color: "text-[#38BDF8]" },
  BOUNDS_VIOLATION: { icon: "🚨", color: "text-[#EF4444]" },
};

function scoreTint(score) {
  if (score >= 90) return "dq-tint-good";
  if (score >= 70) return "dq-tint-warn";
  return "dq-tint-bad";
}

function scoreBarColor(score) {
  if (score >= 90) return "bg-[#22C55E]";
  if (score >= 70) return "bg-[#F59E0B]";
  return "bg-[#EF4444]";
}

function healthPill(score, flagCount, isStreaming) {
  if (flagCount === 0 && score >= 90) {
    return {
      text: isStreaming ? "Pipeline Clean · Live" : "Pipeline Clean · Standby",
      dot: isStreaming ? "bg-[#22C55E]" : "bg-[#94A3B8]",
      ping: isStreaming,
      className: isStreaming
        ? "border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E]"
        : "border-[#94A3B8]/30 bg-[#94A3B8]/10 text-[#94A3B8]",
    };
  }
  if (score >= 70) {
    return {
      text: "Degraded",
      dot: "bg-[#F59E0B]",
      ping: true,
      className: "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B]",
    };
  }
  return {
    text: "Poor Quality",
    dot: "bg-[#EF4444]",
    ping: true,
    className: "border-[#EF4444]/40 bg-[#EF4444]/10 text-[#EF4444]",
  };
}

function StatusPill({ pill }) {
  return (
    <div className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${pill.className}`}>
      <span className="relative flex h-2 w-2">
        {pill.ping && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${pill.dot}`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${pill.dot}`} />
      </span>
      {pill.text}
    </div>
  );
}

function shortSensor(name) {
  return name.replace(/_kPa|_kgph|_RPM|_Pct|_C|_bar/g, "");
}

/**
 * @param {{
 *   dataQuality: object | null | undefined;
 *   pipelineStats: object | null | undefined;
 * }} props
 */
export default function DataQualityPanel({ dataQuality, pipelineStats, isStreaming, compact = false, scrollable = false }) {
  const score = dataQuality?.score ?? 100;
  const flags = dataQuality?.flags ?? [];
  const stats = pipelineStats ?? {};
  const statusPill = healthPill(score, flags.length, isStreaming);

  return (
    <div className={`data-quality-stack ${scoreTint(score)} ${compact ? "data-quality-compact" : ""} ${scrollable ? "data-quality-scrollable" : ""}`}>
      <div className="dq-block">
        <div className="dq-block-title">Data Quality Monitor</div>
        <div className="dq-score-row">
          <span className="text-xs text-[#94A3B8]">Score</span>
          <div className="dq-score-bar">
            <div
              className={`h-full transition-all duration-500 ${scoreBarColor(score)}`}
              style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
            />
          </div>
          <span className="font-mono text-sm font-bold text-white">{score}/100</span>
        </div>
        <div className="dq-meta-row">
          <span>Readings: <strong className="font-mono text-white">{stats.total_readings_processed ?? 0}</strong></span>
          <span>Flag rate: <strong className="font-mono text-white">{stats.flag_rate_pct ?? 0}%</strong></span>
        </div>
        <div className="dq-status-row">
          <StatusPill pill={statusPill} />
        </div>
      </div>

      <div className="dq-block dq-block--flags">
        <div className="dq-block-title">Flagged Sensors</div>
        {flags.length > 0 ? (
          <ul className={`dq-flag-list ${scrollable ? "dq-flag-scroll" : ""}`}>
            {flags.map((f, i) => {
              const meta = FLAG_ICONS[f.type] ?? FLAG_ICONS.HF_NOISE;
              const isCrit = f.severity === "CRITICAL";
              return (
                <li
                  key={`${f.sensor}-${i}`}
                  className={`dq-flag-item ${isCrit ? "dq-flag-crit" : "dq-flag-warn"}`}
                >
                  <span className={meta.color}>
                    {meta.icon} <span className="font-bold">{f.type}</span>
                  </span>
                  <span className="font-mono text-[#E2E8F0]">{shortSensor(f.sensor)}</span>
                  <span className="text-[#94A3B8]">
                    {f.original != null ? f.original : "null"} → {f.cleaned}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="dq-clean-msg">
            <span className="text-[#22C55E]">✓</span>
            <span>No active flags — sensor stream within expected bounds</span>
          </div>
        )}
      </div>
    </div>
  );
}
