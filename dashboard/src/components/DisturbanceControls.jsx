import React, { useMemo } from "react";

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function Slider({ label, value, actual, min, max, step, unit, onChange, colorClass }) {
  const displayValue =
    step < 1 ? Number(value).toFixed(1) : Number(value).toFixed(0);
  const actPct = actual != null
    ? clamp(((actual - min) / (max - min)) * 100, 0, 100)
    : null;
  const showAct = actPct != null && Math.abs(actual - value) > (step < 1 ? 0.15 : 1);

  return (
    <div className="min-w-0 rounded-md border border-hud-border bg-hud-card/70 p-2">
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase leading-tight tracking-wide text-hud-textMuted">
          {label}
        </div>
        <div className={`mt-0.5 font-mono text-sm font-bold tabular-nums ${colorClass}`}>
          {displayValue} {unit}
          {showAct && (
            <span className="ml-2 text-[10px] font-semibold text-amber-300/90">
              ACT {step < 1 ? actual.toFixed(1) : actual.toFixed(0)}
            </span>
          )}
        </div>
      </div>
      <div className="disturbance-slider-wrap relative mt-1.5">
        <input
          type="range"
          className="w-full min-w-0 accent-[var(--accent)]"
          style={{ "--accent": "#22D3EE" }}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {showAct && (
          <div
            className="disturbance-slider-act"
            style={{ left: `calc(${actPct}% - 5px)` }}
            title={`Engine actual: ${step < 1 ? actual.toFixed(1) : actual.toFixed(0)} ${unit}`}
            aria-hidden
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-hud-textMuted/70">
        <span className="shrink-0 font-mono">{min}</span>
        <span className="shrink-0 font-mono">{max}</span>
      </div>
    </div>
  );
}

/**
 * @param {{
 *  rpm: number;
 *  load: number;
 *  ambientPressure: number;
 *  mode: "step" | "ramp";
 *  rampSeconds: number;
 *  reason: string;
 *  onReasonChange: (r: string) => void;
 *  onRpmChange: (v: number) => void;
 *  onLoadChange: (v: number) => void;
 *  onAmbientPressureChange: (v: number) => void;
 *  onModeChange: (m: "step" | "ramp") => void;
 *  onRampSecondsChange: (s: number) => void;
 *  onRequestChange: () => void;
 *  onApplyChange?: () => void;
 *  onReturnSteady: () => void;
 *  role?: "tester" | "head";
 *  disabled?: boolean;
 * }} props
 */
export default function DisturbanceControls({
  rpm,
  load,
  ambientPressure,
  mode,
  rampSeconds,
  reason,
  onReasonChange,
  onRpmChange,
  onLoadChange,
  onAmbientPressureChange,
  onModeChange,
  onRampSecondsChange,
  onRequestChange,
  onApplyChange,
  onReturnSteady,
  role = "tester",
  disabled = false,
  wide = false,
  liveTesters = [],
  applyTargets = [],
  onApplyTargetsChange,
  actRpm,
  actLoad,
  actAmbient,
  isStreaming = false,
}) {
  const isHead = role === "head";
  const onlineTesters = liveTesters.filter((t) => t.online);

  const toggleApplyTarget = (id) => {
    if (!onApplyTargetsChange) return;
    onApplyTargetsChange((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
  };

  const selectAllOnline = () => {
    onApplyTargetsChange?.(onlineTesters.map((t) => t.id));
  };

  const clearApplyTargets = () => {
    onApplyTargetsChange?.([]);
  };
  const presets = useMemo(
    () => [
      { id: "steady", label: "Steady (Ref)", rpm: 1800, load: 75, p: 101.3 },
      { id: "rpm_jump", label: "RPM Step", rpm: 2100, load: 75, p: 101.3 },
      { id: "load_jump", label: "Load Step", rpm: 1800, load: 90, p: 101.3 },
      { id: "ambient_drop", label: "Ambient Drop", rpm: 1800, load: 75, p: 98.0 },
    ],
    []
  );

  return (
    <div className="min-w-0 rounded-xl border border-hud-border bg-hud-bg1/60 p-3 hud-glow sm:p-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-extrabold uppercase tracking-wide text-hud-purple sm:text-[14px]">
            Manual Disturbance Controls
          </div>
          <div className="mt-1 text-xs leading-relaxed text-hud-textMuted">
            Start in steady state, then apply a controlled deviation to demonstrate suppression.
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-hud-textMuted/70">
            Mode
          </span>
          <div className="flex shrink-0 rounded-lg border border-hud-border bg-hud-card/70 p-0.5">
            {["step", "ramp"].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onModeChange(m)}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold sm:px-3 sm:text-xs ${
                  mode === m ? "bg-hud-border/70 text-hud-cyan" : "text-hud-textMuted hover:text-white"
                }`}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-hud-textMuted/70">
              Ramp
            </span>
            <input
              type="number"
              min={2}
              max={12}
              step={1}
              value={rampSeconds}
              onChange={(e) => onRampSecondsChange(clamp(Number(e.target.value), 2, 12))}
              className="w-14 rounded-md border border-hud-border bg-hud-card/70 px-2 py-1 font-mono text-xs text-white outline-none focus:ring-2 focus:ring-hud-cyan/40"
              disabled={mode !== "ramp"}
            />
            <span className="text-xs text-hud-textMuted">s</span>
          </div>
        </div>
      </div>

      {isHead && onApplyTargetsChange && (
        <div className="head-apply-targets mt-2 rounded-lg border border-hud-border bg-hud-card/60 p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-bold uppercase tracking-wide text-hud-textMuted">
              Apply to tester bay(s)
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className="head-apply-targets__action"
                onClick={selectAllOnline}
                disabled={onlineTesters.length === 0}
              >
                All online
              </button>
              <button
                type="button"
                className="head-apply-targets__action"
                onClick={clearApplyTargets}
              >
                Clear
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {liveTesters.map((t) => {
              const selected = applyTargets.includes(t.id);
              const scenarioLabel = t.presence?.scenarioLabel || t.presence?.scenario || "—";
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`head-apply-target-chip ${selected ? "active" : ""} ${t.online ? "online" : "offline"}`}
                  onClick={() => toggleApplyTarget(t.id)}
                  title={t.online ? scenarioLabel : "Offline — open this tester in another tab"}
                >
                  <span className={`head-apply-target-chip__dot ${t.online ? "on" : ""}`} aria-hidden />
                  <span className="head-apply-target-chip__name">{t.displayName}</span>
                  {t.online && (
                    <span className="head-apply-target-chip__meta">{scenarioLabel}</span>
                  )}
                </button>
              );
            })}
          </div>
          {applyTargets.length === 0 && (
            <p className="head-apply-targets__hint">Select at least one bay before Apply or Return to steady.</p>
          )}
          {applyTargets.length > 0 && (
            <p className="head-apply-targets__hint head-apply-targets__hint--ok">
              Will apply to: {applyTargets.map((id) => liveTesters.find((t) => t.id === id)?.displayName || id).join(", ")}
            </p>
          )}
        </div>
      )}

      <div className={`mt-2 grid min-w-0 gap-1.5 ${wide ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1"}`}>
        {isStreaming && (actRpm != null || actLoad != null) && (
          <p className="col-span-full text-[10px] text-amber-300/80">
            Slider = setpoint (SP) · amber tick = engine actual (ACT) while settling
          </p>
        )}
        <Slider
          label="Engine RPM Setpoint"
          value={rpm}
          actual={isStreaming ? actRpm : null}
          min={1200}
          max={2500}
          step={10}
          unit="RPM"
          onChange={onRpmChange}
          colorClass="text-hud-cyan"
        />
        <Slider
          label="Engine Load Setpoint"
          value={load}
          actual={isStreaming ? actLoad : null}
          min={30}
          max={95}
          step={1}
          unit="%"
          onChange={onLoadChange}
          colorClass="text-hud-lime"
        />
        <Slider
          label="Ambient Pressure"
          value={ambientPressure}
          actual={isStreaming ? actAmbient : null}
          min={95}
          max={105}
          step={0.1}
          unit="kPa"
          onChange={onAmbientPressureChange}
          colorClass="text-hud-pink"
        />
      </div>

      <div className="mt-2 min-w-0 rounded-lg border border-hud-border bg-hud-card/60 p-2.5">
        <div className="text-[10px] font-bold uppercase tracking-wide text-hud-textMuted">
          {isHead ? "Change reason" : "Change reason (for approval)"}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {[
            "Ramp Test",
            "Diagnostics",
            "Calibration",
            "Safety Check",
          ].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onReasonChange(r)}
              className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider ${
                reason === r
                  ? "bg-hud-cyan/15 text-hud-cyan ring-1 ring-hud-cyan/25"
                  : "bg-hud-bg1/40 text-hud-textMuted ring-1 ring-hud-border/60 hover:text-white"
              }`}
              disabled={disabled}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex min-w-0 flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              className="shrink-0 rounded-lg border border-hud-border bg-hud-card/60 px-2.5 py-2 text-[10px] font-bold uppercase tracking-wide text-hud-textMuted hover:text-white sm:px-3 sm:text-xs"
              onClick={() => {
                onRpmChange(p.rpm);
                onLoadChange(p.load);
                onAmbientPressureChange(p.p);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex min-w-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={onReturnSteady}
            disabled={isHead && applyTargets.length === 0}
            className="shrink-0 rounded-lg bg-hud-border/70 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-hud-amber ring-2 ring-hud-amber/30 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4 sm:text-xs"
          >
            Return to steady
          </button>
          {isHead ? (
            <button
              type="button"
              onClick={onApplyChange}
              disabled={applyTargets.length === 0}
              className="shrink-0 rounded-lg bg-gradient-to-r from-hud-cyan to-hud-purple px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-black hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:px-5 sm:text-xs"
            >
              Apply
            </button>
          ) : (
            <button
              type="button"
              onClick={onRequestChange}
              className="shrink-0 rounded-lg bg-gradient-to-r from-hud-cyan to-hud-purple px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-black hover:brightness-110 sm:px-5 sm:text-xs"
              disabled={disabled}
            >
              Request change
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

