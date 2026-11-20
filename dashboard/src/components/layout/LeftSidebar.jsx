import React, { useState } from "react";
import { SCENARIO_LABELS, MULTI_LEAK_SCENARIOS } from "../../simulator.js";
import StatusRow from "./StatusRow.jsx";
import ProductBrandLockup from "../ProductBrandLockup.jsx";

const ENGINE_SPECS = {
  CAT_C7: { name: "CAT C7", displacement: "7.2L", power: "168–224 kW" },
  CAT_C13: { name: "CAT C13", displacement: "12.5L", power: "287–388 kW" },
  CAT_C15: { name: "CAT C15", displacement: "15.2L", power: "354–433 kW" },
};

const SCENARIOS = [
  {
    id: "normal",
    type: "normal",
    badge: "BASELINE",
    hint: "Nominal steady-state — no injected fault",
    icon: "✓",
  },
  {
    id: "intake_preturbo",
    type: "leak",
    group: "intake",
    badge: "INTAKE",
    severity: "SEVERE",
    hint: "Pre-turbo pressure drop · 4-sensor pattern",
    icon: "↑",
  },
  {
    id: "intake_cac",
    type: "leak",
    group: "intake",
    badge: "INTAKE",
    severity: "SEVERE",
    hint: "Post-turbo / CAC charge-air loss",
    icon: "↑",
  },
  {
    id: "exhaust_preturbine",
    type: "leak",
    group: "exhaust",
    badge: "EXHAUST",
    severity: "SEVERE",
    hint: "Pre-turbine exhaust leak signature",
    icon: "↓",
  },
  {
    id: "exhaust_postturbine",
    type: "leak",
    group: "exhaust",
    badge: "EXHAUST",
    severity: "MINOR",
    hint: "Post-turbine back-pressure anomaly — early stage",
    icon: "↓",
  },
  {
    id: "egr_leak",
    type: "leak",
    group: "egr",
    badge: "EGR",
    severity: "MODERATE",
    hint: "EGR cooler / valve leak path",
    icon: "↺",
  },
  {
    id: "cac_direct_leak",
    type: "leak",
    group: "cac",
    badge: "CAC",
    severity: "MODERATE",
    hint: "Direct charge-air cooler breach",
    icon: "◎",
  },
  {
    id: "minor_intake_leak",
    type: "leak",
    group: "intake",
    badge: "EARLY",
    severity: "MINOR",
    hint: "Sub-threshold intake leak — early warning",
    icon: "△",
  },
  ...MULTI_LEAK_SCENARIOS.map((s) => ({
    id: s.id,
    type: "leak",
    group: "multi",
    badge: "MULTI",
    severity: "MODERATE",
    hint: s.combo,
    icon: "⚡⚡",
  })),
  {
    id: "sensor_fault_demo",
    type: "fault",
    badge: "SFI",
    hint: "Pre-compressor P alone — 0/2 correlated confirm",
    icon: "⚡",
  },
  {
    id: "sensor_fault_exhaust",
    type: "fault",
    badge: "SFI",
    hint: "Exhaust manifold P isolated — not a real exhaust leak",
    icon: "⚡",
  },
  {
    id: "sensor_fault_egr",
    type: "fault",
    badge: "SFI",
    hint: "EGR flow collapsed alone — intake/EGR temps normal",
    icon: "⚡",
  },
  {
    id: "sensor_fault_cac",
    type: "fault",
    badge: "SFI",
    hint: "CAC ΔP spike without downstream pressure cascade",
    icon: "⚡",
  },
];

const SINGLE_LEAK_SCENARIOS = SCENARIOS.filter((s) => s.type === "leak" && s.group !== "multi");
const MULTI_LEAK_SIDEBAR_SCENARIOS = SCENARIOS.filter((s) => s.type === "leak" && s.group === "multi");
const BASELINE_SCENARIO = SCENARIOS.find((s) => s.type === "normal");
const FAULT_SCENARIOS = SCENARIOS.filter((s) => s.type === "fault");

const SPEED_OPTIONS = [
  { label: "0.5s", ms: 500 },
  { label: "1s", ms: 1000 },
  { label: "2s", ms: 2000 },
];

function prettyAction(a) {
  return (a || "—").replace(/_/g, " ");
}

function ScenarioCard({ scenario, activeScenario, onSelect, readOnly }) {
  const isActive = activeScenario === scenario.id;
  const isLeak = scenario.type === "leak";
  const isFault = scenario.type === "fault";

  return (
    <button
      type="button"
      className={`scenario-card ${isActive ? "active" : ""} ${isLeak ? "leak" : ""} ${isFault ? "fault" : ""} ${scenario.type === "normal" ? "normal" : ""} scenario-card--${scenario.group || scenario.type}`}
      onClick={() => !readOnly && onSelect(scenario.id)}
      disabled={readOnly}
    >
      <span className="scenario-card__icon" aria-hidden>{scenario.icon}</span>
      <span className="scenario-card__body">
        <span className="scenario-card__title-row">
          <span className="scenario-card__name">{SCENARIO_LABELS[scenario.id] || scenario.id}</span>
          {scenario.badge && (
            <span className={`scenario-card__badge scenario-card__badge--${(scenario.badge || "").toLowerCase()}`}>
              {scenario.badge}
            </span>
          )}
        </span>
        {scenario.severity && (
          <span className={`scenario-card__severity scenario-card__severity--${scenario.severity.toLowerCase()}`}>
            {scenario.severity}
          </span>
        )}
        {scenario.hint && <span className="scenario-card__hint">{scenario.hint}</span>}
      </span>
      {isActive && <span className="scenario-card__active-pip" aria-hidden />}
    </button>
  );
}

function ScenarioDropdownSection({
  label,
  labelClass = "",
  intro,
  scenarios,
  activeScenario,
  onSelect,
  readOnly,
  expanded,
  onToggleExpand,
  sectionTone = "",
}) {
  if (!scenarios.length) return null;

  const activeInGroup = scenarios.find((s) => s.id === activeScenario);
  const visibleScenario = activeInGroup || scenarios[0];
  const hasMore = scenarios.length > 1;

  return (
    <div className={`scenario-dropdown-section ${sectionTone ? `scenario-dropdown-section--${sectionTone}` : ""}`}>
      {label && <div className={`scenario-dropdown-label ${labelClass}`}>{label}</div>}
      {intro && <p className="sidebar-leak-intro">{intro}</p>}

      {expanded && hasMore ? (
        <div className="scenario-leak-grid">
          {scenarios.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              activeScenario={activeScenario}
              onSelect={onSelect}
              readOnly={readOnly}
            />
          ))}
        </div>
      ) : (
        <ScenarioCard
          scenario={visibleScenario}
          activeScenario={activeScenario}
          onSelect={onSelect}
          readOnly={readOnly}
        />
      )}

      {hasMore && (
        <button
          type="button"
          className="scenario-expand-btn"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          disabled={readOnly}
        >
          <span className="scenario-expand-btn__text">
            {expanded ? "Show less" : `Show all scenarios (${scenarios.length})`}
          </span>
          <span className={`scenario-expand-btn__chevron ${expanded ? "is-open" : ""}`} aria-hidden>
            ▾
          </span>
        </button>
      )}
    </div>
  );
}

export default function LeftSidebar({
  selectedEngine,
  setSelectedEngine,
  activeScenario,
  setActiveScenario,
  isStreaming,
  setIsStreaming,
  streamingSpeed,
  setStreamingSpeed,
  latestPrediction,
  apiOnline,
  engineSwitching,
  switchingLabel,
  readOnly = false,
  sensorHealthScore,
  sensorStatusCounts,
  faultInjectionActive = false,
  canFaultInject = false,
  faultInjectionPreset = null,
  onToggleFaultInjection,
}) {
  const dqpScore = latestPrediction?.Data_Quality?.score ?? 100;
  const dqpMessage = latestPrediction?.Data_Quality?.summary || "Awaiting data";
  const steady = Boolean(latestPrediction?.Steady_State_Metrics?.is_steady);
  const suppressed = Boolean(latestPrediction?.Suppressed);
  const leak = isStreaming && latestPrediction?.Leak_Present === 1 && !suppressed;
  const sensorFault = isStreaming && Boolean(latestPrediction?.Sensor_Fault_Isolation?.is_sensor_fault);

  const leakLabel = !isStreaming
    ? "IDLE"
    : suppressed
      ? "SUPPRESSED"
      : leak
        ? "DETECTED"
        : sensorFault
          ? "SENSOR FAULT"
          : "NORMAL";
  const leakColour = !isStreaming
    ? "info"
    : leak
      ? "leak"
      : sensorFault || suppressed
        ? "warning"
        : "normal";
  const actionLabel = prettyAction(latestPrediction?.Recommended_Action);

  const healthScore = sensorHealthScore ?? 100;
  const statusCounts = sensorStatusCounts ?? { OK: 0, WATCH: 0, FAULT: 0, STALE: 0 };
  const healthColour =
    healthScore >= 90 ? "var(--color-normal)" : healthScore >= 70 ? "var(--color-warning)" : "var(--color-leak)";

  const [expandedSingleLeak, setExpandedSingleLeak] = useState(false);
  const [expandedMultiLeak, setExpandedMultiLeak] = useState(false);
  const [expandedSfi, setExpandedSfi] = useState(false);

  return (
    <aside className={`sidebar ${readOnly ? "sidebar--readonly" : ""}`}>
      {readOnly && (
        <div className="sidebar-mirror-badge">Mirroring tester bay — read only</div>
      )}

      <div className="sidebar-section sidebar-section--stream">
        <div className="sidebar-label">STREAM CONTROL</div>
        <button
          type="button"
          className={`stream-btn stream-btn--hero ${isStreaming ? "active" : ""}`}
          onClick={() => !readOnly && setIsStreaming((s) => !s)}
          disabled={readOnly}
        >
          <span className="stream-indicator" />
          <span className="stream-btn__text">
            <span className="stream-btn__label">{isStreaming ? "STOP STREAMING" : "START STREAMING"}</span>
            <span className="stream-btn__sub">
              {isStreaming
                ? "Session report recording — stop to export PDF"
                : "Start session — report logs until you stop"}
            </span>
          </span>
        </button>
        <div className="speed-selector">
          <span className="speed-label">INTERVAL</span>
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              className={`speed-btn ${streamingSpeed === s.ms ? "active" : ""}`}
              onClick={() => !readOnly && setStreamingSpeed(s.ms)}
              disabled={readOnly}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {isStreaming && canFaultInject && (
        <div className="sidebar-section sidebar-section--fault-inject">
          <div className="sidebar-label">SFI DEMO</div>
          <button
            type="button"
            className={`fault-inject-btn ${faultInjectionActive ? "active" : ""}`}
            onClick={() => onToggleFaultInjection?.()}
            disabled={readOnly || !onToggleFaultInjection}
            title={
              faultInjectionPreset
                ? `Simulate bad ${faultInjectionPreset.label} on top of "${SCENARIO_LABELS[activeScenario] || activeScenario}"`
                : "Inject sensor fault"
            }
          >
            <span className="fault-inject-btn__icon" aria-hidden>⚡</span>
            <span className="fault-inject-btn__text">
              <span className="fault-inject-btn__label">
                {faultInjectionActive ? "CLEAR SENSOR FAULT" : "INJECT SENSOR FAULT"}
              </span>
              <span className="fault-inject-btn__sub">
                {faultInjectionActive
                  ? "Resume scenario leak physics"
                  : faultInjectionPreset
                    ? `Bad ${faultInjectionPreset.label} → SFI should override ML`
                    : "Isolated transducer fault demo"}
              </span>
            </span>
          </button>
          {faultInjectionActive && (
            <div className="fault-inject-active-pill" role="status">
              FAULT INJECTION ACTIVE
            </div>
          )}
        </div>
      )}

      <div className="sidebar-section">
        <div className="sidebar-label">SELECT ENGINE</div>
        <div className="engine-list">
          {["CAT_C7", "CAT_C13", "CAT_C15"].map((eng) => {
            const specs = ENGINE_SPECS[eng];
            const isActive = selectedEngine === eng;
            return (
              <button
                key={eng}
                type="button"
                className={`engine-card ${isActive ? "active" : ""}`}
                onClick={() => !readOnly && setSelectedEngine(eng)}
                disabled={engineSwitching || readOnly}
              >
                <div className="engine-indicator">
                  {isActive && <span className="engine-dot" />}
                </div>
                <div className="engine-info">
                  <span className="engine-name">{specs.name}</span>
                  <span className="engine-spec">{specs.displacement}</span>
                  <span className="engine-power">{specs.power}</span>
                </div>
                {isActive && <span className="engine-active-badge">ACTIVE</span>}
              </button>
            );
          })}
        </div>
        {engineSwitching && <div className="sidebar-switching">Switching engine…</div>}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">BASELINE</div>
        {BASELINE_SCENARIO && (
          <ScenarioCard
            scenario={BASELINE_SCENARIO}
            activeScenario={activeScenario}
            onSelect={setActiveScenario}
            readOnly={readOnly}
          />
        )}
      </div>

      <div className="sidebar-section sidebar-section--leak-demos">
        <div className="sidebar-label sidebar-label--leak">LEAK DEMO SCENARIOS</div>
        <p className="sidebar-leak-intro">
          Select as fault, then hit <strong>START STREAMING</strong> — ML detects location, severity, and RCA in real time.
        </p>

        <ScenarioDropdownSection
          label="SINGLE LEAK"
          labelClass="scenario-dropdown-label--leak"
          scenarios={SINGLE_LEAK_SCENARIOS}
          activeScenario={activeScenario}
          onSelect={setActiveScenario}
          readOnly={readOnly}
          expanded={expandedSingleLeak}
          onToggleExpand={() => setExpandedSingleLeak((v) => !v)}
          sectionTone="single"
        />

        <ScenarioDropdownSection
          label="MULTI-LEAK"
          labelClass="scenario-dropdown-label--multi"
          scenarios={MULTI_LEAK_SIDEBAR_SCENARIOS}
          activeScenario={activeScenario}
          onSelect={setActiveScenario}
          readOnly={readOnly}
          expanded={expandedMultiLeak}
          onToggleExpand={() => setExpandedMultiLeak((v) => !v)}
          sectionTone="multi"
        />

        {switchingLabel && <div className="sidebar-switching">{switchingLabel}</div>}
      </div>

      {FAULT_SCENARIOS.length > 0 && (
        <div className="sidebar-section sidebar-section--fault">
          <ScenarioDropdownSection
            label="SENSOR FAULT (SFI)"
            labelClass="scenario-dropdown-label--fault"
            scenarios={FAULT_SCENARIOS}
            activeScenario={activeScenario}
            onSelect={setActiveScenario}
            readOnly={readOnly}
            expanded={expandedSfi}
            onToggleExpand={() => setExpandedSfi((v) => !v)}
            sectionTone="sfi"
          />
        </div>
      )}

      <div className="sidebar-section sidebar-status">
        <div className="sidebar-label">
          SYSTEM STATUS
          <span className="api-badge">{apiOnline ? "API ONLINE" : "DEMO MODE"}</span>
        </div>
        <div className="status-rows">
          <StatusRow label="STEADY STATE" value={suppressed ? "GUARD ACTIVE" : steady ? "STEADY" : "TRANSITIONING"} colour={steady && !suppressed ? "normal" : "warning"} />
          <StatusRow label="LEAK STATUS" value={leakLabel} colour={leakColour} />
          <StatusRow label="ACTION" value={actionLabel} colour="info" />
        </div>
      </div>

      <div className="sidebar-section">
        <div className="dqp-bar">
          <div className="dqp-label">
            <span>DATA QUALITY</span>
            <span className="dqp-score mono">{dqpScore}/100</span>
          </div>
          <div className="dqp-track">
            <div className="dqp-fill" style={{ width: `${dqpScore}%` }} />
          </div>
          <div className="dqp-status">
            <span className="dqp-dot" />
            {dqpMessage}
          </div>
        </div>
      </div>

      <div className="sidebar-section">
        <div className="dqp-label">
          <span>SENSOR HEALTH</span>
          <span className="dqp-score mono" style={{ color: healthColour }}>
            {healthScore}/100
          </span>
        </div>
        <div className="sh-sidebar-row">
          <span style={{ color: "var(--color-normal)" }}>✓ {statusCounts.OK} OK</span>
          {statusCounts.WATCH > 0 && (
            <span style={{ color: "var(--color-warning)" }}>⚠ {statusCounts.WATCH} WATCH</span>
          )}
          {statusCounts.FAULT > 0 && (
            <span style={{ color: "var(--color-leak)" }}>✕ {statusCounts.FAULT} FAULT</span>
          )}
          {statusCounts.STALE > 0 && (
            <span style={{ color: "var(--color-purple)" }}>◌ {statusCounts.STALE} STALE</span>
          )}
        </div>
      </div>

      <div className="sidebar-brand">
        <ProductBrandLockup variant="compact" />
      </div>
    </aside>
  );
}
