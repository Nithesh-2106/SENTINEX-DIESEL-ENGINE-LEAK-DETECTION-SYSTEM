import React from "react";
import { SCENARIO_LABELS, MULTI_LEAK_SCENARIOS } from "../simulator.js";

const SCENARIOS = [
  "normal",
  "intake_preturbo",
  "intake_cac",
  "exhaust_preturbine",
  "exhaust_postturbine",
  "egr_leak",
  "cac_direct_leak",
  "minor_intake_leak",
  "sensor_fault_demo",
  "sensor_fault_exhaust",
  "sensor_fault_egr",
  "sensor_fault_cac",
];

const MULTI_LEAK_UI = MULTI_LEAK_SCENARIOS.map((s) => ({
  id: s.id,
  label: SCENARIO_LABELS[s.id] || s.id,
  description: `Dataset combo: ${s.combo}`,
}));

const INTERVAL_OPTIONS = [
  { label: "0.5s", ms: 500 },
  { label: "1s", ms: 1000 },
  { label: "2s", ms: 2000 },
];

function scenarioButtonClasses(id, selected) {
  if (id === "normal") {
    return selected
      ? "border-2 border-hud-lime bg-hud-card/80 text-white shadow-[0_0_16px_rgba(163,230,53,0.18)]"
      : "border border-hud-border bg-hud-card/70 text-hud-textMuted hover:border-hud-cyan/50 hover:text-white";
  }
  if (id === "egr_leak") {
    return selected
      ? "border-2 border-orange-500 bg-hud-card/80 text-white shadow-[0_0_16px_rgba(249,115,22,0.3)]"
      : "border border-orange-500/50 bg-hud-card/70 text-hud-textMuted hover:border-orange-400 hover:text-white";
  }
  if (id === "cac_direct_leak") {
    return selected
      ? "border-2 border-purple-500 bg-hud-card/80 text-white shadow-[0_0_16px_rgba(168,85,247,0.3)]"
      : "border border-purple-500/50 bg-hud-card/70 text-hud-textMuted hover:border-purple-400 hover:text-white";
  }
  if (id === "minor_intake_leak") {
    return selected
      ? "border-2 border-yellow-400 bg-hud-card/80 text-white shadow-[0_0_16px_rgba(250,204,21,0.28)]"
      : "border border-yellow-500/45 bg-hud-card/70 text-hud-textMuted hover:border-yellow-400 hover:text-white";
  }
  if (id.startsWith("sensor_fault")) {
    return selected
      ? "border-2 border-fuchsia-500 bg-hud-card/80 text-white shadow-[0_0_16px_rgba(217,70,239,0.35)]"
      : "border border-fuchsia-500/55 bg-hud-card/70 text-hud-textMuted hover:border-fuchsia-400 hover:text-white";
  }
  if (MULTI_LEAK_UI.some((s) => s.id === id)) {
    return selected
      ? "border-2 border-[#7C3AED] bg-[#7C3AED] text-white shadow-[0_0_16px_rgba(124,58,237,0.35)]"
      : "border-2 border-[#7C3AED] bg-[#1A0B2E] text-purple-200 hover:border-purple-400 hover:text-white";
  }
  return selected
    ? "border-2 border-hud-red bg-hud-card/80 text-white shadow-[0_0_16px_rgba(239,68,68,0.25)]"
    : "border border-hud-border bg-hud-card/70 text-hud-textMuted hover:border-hud-cyan/50 hover:text-white";
}

/**
 * @param {{
 *   currentScenario: string;
 *   onScenarioChange: (s: string) => void;
 *   isStreaming: boolean;
 *   onStreamingToggle: () => void;
 *   intervalMs: number;
 *   onIntervalChange: (ms: number) => void;
 *   switchingLabel: string | null;
 * }} props
 */
export default function ScenarioSelector({
  currentScenario,
  onScenarioChange,
  isStreaming,
  onStreamingToggle,
  intervalMs,
  onIntervalChange,
  switchingLabel,
}) {
  return (
    <div className="border-b border-hud-border bg-hud-bg1/40 px-6 py-4">
      <div className="mx-auto max-w-[1920px]">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          {SCENARIOS.map((id) => {
            const selected = currentScenario === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onScenarioChange(id)}
                className={`rounded-lg px-4 py-2 text-left text-xs font-semibold transition-all md:text-sm ${scenarioButtonClasses(
                  id,
                  selected
                )}`}
              >
                {SCENARIO_LABELS[id]}
              </button>
            );
          })}
        </div>

        <div className="scenario-section multi-leak mb-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-purple-300">
            MULTI-LEAK SCENARIOS
            <span className="rounded bg-[#7C3AED]/30 px-1.5 py-0.5 text-[9px] text-purple-200">NEW</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {MULTI_LEAK_UI.map((scenario) => {
              const selected = currentScenario === scenario.id;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  title={scenario.description}
                  onClick={() => onScenarioChange(scenario.id)}
                  className={`rounded-lg px-4 py-2 text-left text-xs font-semibold transition-all md:text-sm ${scenarioButtonClasses(
                    scenario.id,
                    selected
                  )}`}
                >
                  <span className="mr-1">⚡⚡</span>
                  {scenario.label}
                </button>
              );
            })}
          </div>
        </div>

        {switchingLabel && (
          <div className="mb-3">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
              Switching to {switchingLabel}…
            </p>
            <div className="h-1 w-full overflow-hidden rounded-full bg-[#243447]">
              <div
                key={switchingLabel}
                className="h-full bg-[#FFB800]"
                style={{ animation: "scenarioProgress 1.5s ease-out forwards" }}
              />
            </div>
            <style>{`
              @keyframes scenarioProgress {
                from { width: 0%; }
                to { width: 100%; }
              }
            `}</style>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={onStreamingToggle}
            className={`rounded-lg px-6 py-2.5 text-sm font-bold uppercase tracking-wider transition ${
              isStreaming
                ? "bg-hud-border/70 text-hud-amber ring-2 ring-hud-amber/40"
                : "bg-gradient-to-r from-hud-lime to-hud-cyan text-black hover:brightness-110"
            }`}
          >
            {isStreaming ? "Stop" : "Start"} streaming
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-hud-textMuted/70">
              Streaming speed
            </span>
            <div className="flex rounded-lg border border-hud-border bg-hud-card/70 p-0.5">
              {INTERVAL_OPTIONS.map((opt) => (
                <button
                  key={opt.ms}
                  type="button"
                  onClick={() => onIntervalChange(opt.ms)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                    intervalMs === opt.ms
                      ? "bg-hud-border/70 text-hud-cyan"
                      : "text-hud-textMuted hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
