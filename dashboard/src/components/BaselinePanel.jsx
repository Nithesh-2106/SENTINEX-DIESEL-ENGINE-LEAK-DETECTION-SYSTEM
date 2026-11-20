import React, { useMemo, useState } from "react";

const KEY_SENSORS = [
  { key: "Pre_Turbine_Pressure_kPa", label: "Pre Turbine P", unit: "kPa" },
  { key: "Post_Compressor_Pressure_kPa", label: "Post Compressor P", unit: "kPa" },
  { key: "Post_Turbine_Pressure_kPa", label: "Post Turbine P", unit: "kPa" },
  { key: "Pre_Compressor_Pressure_kPa", label: "Pre Compressor P", unit: "kPa" },
  { key: "Post_CAC_Pressure_kPa", label: "Post CAC P", unit: "kPa" },
  { key: "Intake_Manifold_Pressure_kPa", label: "Intake Manifold P", unit: "kPa" },
  { key: "Exhaust_Manifold_Pressure_kPa", label: "Exhaust Manifold P", unit: "kPa" },
  { key: "Exhaust_Manifold_Temp_C", label: "Exhaust Manifold T", unit: "°C" },
];

function devPct(actual, expected) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || expected === 0) return 0;
  return ((actual - expected) / Math.abs(expected)) * 100;
}

/**
 * @param {{
 *  reading: Record<string, number> | null;
 *  baseline: Record<string, number> | null;
 *  open?: boolean;
 *  onToggle?: () => void;
 * }} props
 */
export default function BaselinePanel({ reading, baseline, open: openProp, onToggle }) {
  const [openInternal, setOpenInternal] = useState(false);
  const open = typeof openProp === "boolean" ? openProp : openInternal;
  const toggle = onToggle || (() => setOpenInternal((v) => !v));

  const rows = useMemo(() => {
    if (!reading || !baseline) return [];
    return KEY_SENSORS.map((s) => {
      const exp = Number(baseline[s.key]);
      const act = Number(reading[s.key]);
      const d = devPct(act, exp);
      return {
        ...s,
        exp,
        act,
        dev: d,
      };
    });
  }, [reading, baseline]);

  return (
    <div className="section-card">
      <button type="button" onClick={toggle} className="section-card-header w-full text-left">
        <div>
          <div className="section-card-title">PHYSICS BASELINE (EXPECTED VS ACTUAL)</div>
          <div className="mt-1 text-[10px] text-white/35">
            Expected values computed for current RPM / Load / Ambient
          </div>
        </div>
        <div className="mono text-sm" style={{ color: "var(--cat-yellow)" }}>{open ? "▲" : "▼"}</div>
      </button>

      {open && (
        <div className="section-card-body border-t border-white/5">
          {!reading || !baseline ? (
            <div className="dash-empty-state">
              <span className="dash-empty-state-icon">⚗</span>
              <span className="dash-empty-state-title">AWAITING BASELINE</span>
              <span className="dash-empty-state-hint">Start streaming to compute physics-based expected vs actual sensor values.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="physics-table">
                <thead>
                  <tr>
                    <th>Sensor</th>
                    <th>Expected</th>
                    <th>Actual</th>
                    <th>Dev%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const a = Math.abs(r.dev);
                    const devClass = r.dev >= 0 ? "positive" : a < 2 ? "negative mild" : a < 8 ? "negative moderate" : "negative severe";
                    return (
                      <tr key={r.key}>
                        <td>{r.label}</td>
                        <td className="expected">{r.exp.toFixed(1)} {r.unit}</td>
                        <td className="actual">{r.act.toFixed(1)} {r.unit}</td>
                        <td className={`deviation ${devClass}`}>
                          {r.dev >= 0 ? "+" : ""}{r.dev.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

