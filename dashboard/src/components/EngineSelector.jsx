import React, { useEffect, useState } from "react";
import axios from "axios";

const ENGINE_STYLES = {
  CAT_C7: {
    activeBorder: "border-[#0891B2]",
    chip: "bg-[#0891B2]/20 text-[#38BDF8]",
  },
  CAT_C13: {
    activeBorder: "border-[#FFB800]",
    chip: "bg-[#FFB800]/20 text-[#FFB800]",
  },
  CAT_C15: {
    activeBorder: "border-[#7C3AED]",
    chip: "bg-[#7C3AED]/20 text-[#A78BFA]",
  },
};

const FALLBACK_ENGINES = [
  {
    engine_id: "CAT_C7",
    display_name: "CAT C7 — 7.2L",
    displacement_L: 7.2,
    power_range_kw: "168–224 kW",
    has_scr: false,
  },
  {
    engine_id: "CAT_C13",
    display_name: "CAT C13 — 12.5L",
    displacement_L: 12.5,
    power_range_kw: "287–388 kW",
    has_scr: true,
  },
  {
    engine_id: "CAT_C15",
    display_name: "CAT C15 — 15.2L",
    displacement_L: 15.2,
    power_range_kw: "354–433 kW",
    has_scr: true,
  },
];

function fmtDelta(prev, next, unit) {
  if (prev == null || next == null) return null;
  const arrow = next >= prev ? "↑" : "↓";
  const color = next >= prev ? "text-[#22C55E]" : "text-[#EF4444]";
  return (
    <span className={color}>
      {prev} → {next} {unit} {arrow}
    </span>
  );
}

/**
 * @param {{
 *   activeEngine: string;
 *   onEngineSwitch: (id: string) => void | Promise<void>;
 *   engineSwitching: boolean;
 *   switchDetails: object | null;
 * }} props
 */
export default function EngineSelector({
  activeEngine,
  onEngineSwitch,
  engineSwitching,
  switchDetails,
}) {
  const [engines, setEngines] = useState(FALLBACK_ENGINES);

  useEffect(() => {
    axios
      .get("/api/engines", { timeout: 5000 })
      .then((res) => {
        if (res.data?.engines?.length) setEngines(res.data.engines);
      })
      .catch(() => {});
  }, []);

  return (
    <section className="border-b border-[#243447] bg-[#0D1B2A] px-4 py-4">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
        Select Engine
      </h2>
      <div className="mx-auto grid max-w-[1920px] grid-cols-1 gap-3 md:grid-cols-3">
        {engines.map((eng) => {
          const active = eng.engine_id === activeEngine;
          const style = ENGINE_STYLES[eng.engine_id] || ENGINE_STYLES.CAT_C13;
          return (
            <button
              key={eng.engine_id}
              type="button"
              disabled={engineSwitching}
              onClick={() => onEngineSwitch(eng.engine_id)}
              className={`rounded-xl border-2 bg-[#1B2D42] p-4 text-left transition hover:ring-1 hover:ring-white/10 disabled:opacity-60 ${
                active ? style.activeBorder : "border-[#243447]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-bold text-white">{eng.display_name}</div>
                  <div className="mt-1 text-sm text-[#94A3B8]">
                    {eng.displacement_L}L · {eng.power_range_kw}
                  </div>
                  {!eng.has_scr && (
                    <div className="mt-1 text-xs text-[#64748B]">No SCR system</div>
                  )}
                </div>
                {active && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${style.chip}`}
                  >
                    Active
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {(engineSwitching || switchDetails) && (
        <div className="mx-auto mt-4 max-w-[1920px] rounded-xl border border-[#243447] bg-[#1B2D42] p-4 animate-pulse">
          <p className="text-sm font-semibold text-white">
            ⚙ Switching engine configuration…
          </p>
          {switchDetails && (
            <ul className="mt-2 space-y-1 text-sm text-[#94A3B8]">
              <li>
                MAF reference:{" "}
                {fmtDelta(
                  switchDetails.previous_MAF_ref_kgph,
                  switchDetails.MAF_ref_kgph,
                  "kg/h"
                )}
              </li>
              <li>
                Boost pressure:{" "}
                {fmtDelta(
                  switchDetails.previous_Boost_P_kPa,
                  switchDetails.Boost_P_kPa,
                  "kPa"
                )}
              </li>
              <li>
                Exhaust temp:{" "}
                {fmtDelta(
                  undefined,
                  switchDetails.Exhaust_Manifold_T_C,
                  "°C"
                ) || `${switchDetails.Exhaust_Manifold_T_C} °C`}
              </li>
              <li>Turbo speed: {switchDetails.Turbo_RPM?.toLocaleString()} RPM</li>
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
