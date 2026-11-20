import React from "react";

function dots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#F59E0B]" />
      <span className="h-1.5 w-1.5 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-[#F59E0B]" />
      <span className="h-1.5 w-1.5 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-[#F59E0B]" />
    </span>
  );
}

/**
 * @param {{
 *  metrics: any | null;
 * }} props
 */
export default function SteadyStateIndicator({ metrics }) {
  const isSteady = Boolean(metrics?.is_steady);
  const rpmCv = metrics?.rpm_cv_pct;
  const loadCv = metrics?.load_cv_pct;
  const w = metrics?.readings_in_window;
  const steadyDur = metrics?.steady_duration_readings;

  const barBg = isSteady ? "bg-[#22C55E]/15" : "bg-[#F59E0B]/15";
  const barFill = isSteady ? "bg-[#22C55E]" : "bg-[#F59E0B]";
  const label = isSteady ? "STEADY STATE" : "TRANSITIONING";

  const frac = Math.min(1, Math.max(0, (Number(steadyDur) || 0) / (Number(w) || 10)));

  return (
    <div className="border-b border-[#243447] bg-[#0D1B2A] px-6 py-3">
      <div className="mx-auto flex max-w-[1920px] flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-[260px] items-center gap-3">
          <div className={`h-2 w-40 overflow-hidden rounded-full ${barBg}`}>
            <div className={`h-full ${barFill} transition-all duration-500`} style={{ width: `${frac * 100}%` }} />
          </div>
          <div className="text-xs font-extrabold uppercase tracking-wider text-white">
            {label} {!isSteady && dots()}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-[#94A3B8]">
          <span>
            RPM CV: <span className="font-mono text-white">{Number(rpmCv).toFixed(2)}%</span>
          </span>
          <span>
            Load CV: <span className="font-mono text-white">{Number(loadCv).toFixed(2)}%</span>
          </span>
          <span>
            Window: <span className="font-mono text-white">{w ?? 0}/10</span>
          </span>
          {!isSteady && metrics?.reason && (
            <span className="max-w-[900px] truncate text-[#F59E0B]">
              Reason: <span className="text-[#E2E8F0]">{metrics.reason}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

