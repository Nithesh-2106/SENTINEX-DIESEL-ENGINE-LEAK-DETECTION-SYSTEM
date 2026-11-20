/**
 * Manual sensor input — jury/test-cell raw readings through full SENTINEX pipeline.
 * POST /api/predict → predict_leak() (DQP → SSG → ML → SFI), same as streaming.
 */
import React, { useCallback, useMemo, useState } from "react";
import axios from "axios";
import {
  ENGINE_BASELINES,
  ENGINE_DISPLAY,
  buildPresetReading,
  JURY_SFI_DEMOS,
  buildJurySfiReading,
  getJurySfiDemo,
  isJurySfiPreset,
  resolveManualMockScenario,
} from "../simulator.js";
import { ALL_SENSOR_KEYS, SENSOR_DEFINITIONS } from "../constants/sensorDefinitions.js";
import { buildSensorGroups } from "../utils/sensorHealthMerge.js";
import { formatAction, getSystemState } from "../lib/systemState.js";
import { getMockPrediction } from "../mockPredictions.js";
import SensorFaultPanel from "./SensorFaultPanel.jsx";
import SteadyStatePanel from "./SteadyStatePanel.jsx";

const SENSOR_GROUPS = buildSensorGroups();

const PRESET_SCENARIOS = [
  { id: "normal", label: "Normal baseline" },
  { id: "intake_preturbo", label: "Intake Pre-Turbo" },
  { id: "intake_cac", label: "Intake CAC" },
  { id: "exhaust_preturbine", label: "Exhaust Pre-Turbine" },
  { id: "exhaust_postturbine", label: "Exhaust Post-Turbine" },
  { id: "egr_leak", label: "EGR Leak" },
  { id: "cac_direct_leak", label: "CAC Direct" },
  { id: "minor_intake_leak", label: "Minor Intake" },
];

function formatLocation(loc) {
  if (!loc || loc === "None") return "—";
  return loc.replace(/_/g, " ");
}

function severityClass(sev) {
  const s = (sev || "").toLowerCase();
  if (s === "critical" || s === "severe") return "manual-result__severity--high";
  if (s === "moderate") return "manual-result__severity--med";
  if (s === "minor") return "manual-result__severity--low";
  return "manual-result__severity--none";
}

function ManualPipelineStrip({ result }) {
  if (!result) return null;

  const dqp = result.Data_Quality;
  const ssg = result.Steady_State_Metrics;
  const sfi = result.Sensor_Fault_Isolation;
  const suppressed = Boolean(result.Suppressed);
  const mlRan = !suppressed;
  const dqpScore = dqp?.score ?? null;
  const dqpFlags = dqp?.flags?.length ?? 0;

  const stages = [
    {
      key: "dqp",
      label: "1 · DQP",
      title: "Data Quality",
      status: dqpScore == null
        ? "—"
        : dqpScore >= 90
          ? "CLEAN"
          : dqpFlags > 0
            ? `${dqpFlags} FLAG${dqpFlags === 1 ? "" : "S"}`
            : "DEGRADED",
      detail: dqp?.summary || (dqpScore != null ? `${dqpScore}/100` : "Not run"),
      tone: dqpScore == null ? "muted" : dqpScore >= 90 ? "ok" : "warn",
    },
    {
      key: "ssg",
      label: "2 · SSG",
      title: "Steady State",
      status: suppressed ? "SUPPRESSED" : ssg?.is_steady ? "STEADY" : "TRANSITION",
      detail: suppressed
        ? (result.Suppression_Reason || "Guard blocked inference")
        : (ssg?.reason || (ssg?.is_steady ? "ML enabled" : "Awaiting steady window")),
      tone: suppressed ? "guard" : ssg?.is_steady ? "ok" : "warn",
    },
    {
      key: "ml",
      label: "3 · ML",
      title: "Inference",
      status: !mlRan
        ? "SKIPPED"
        : result.Leak_Present === 1
          ? "LEAK"
          : "NO LEAK",
      detail: !mlRan
        ? "Gated by SSG"
        : formatLocation(result.Leak_Location),
      tone: !mlRan ? "muted" : result.Leak_Present === 1 ? "leak" : "ok",
    },
    {
      key: "sfi",
      label: "5 · SFI",
      title: "Sensor Fault",
      status: !sfi?.checked
        ? "—"
        : sfi.is_sensor_fault
          ? "FAULT"
          : sfi.is_confirmed_leak
            ? "CONFIRMED"
            : "CLEAR",
      detail: sfi?.is_sensor_fault
        ? (sfi.faulty_sensor?.replace(/_/g, " ") || "Hardware fault")
        : sfi?.checked
          ? `${sfi.correlated_deviating}/${sfi.correlated_required} correlated`
          : "Not evaluated",
      tone: sfi?.is_sensor_fault ? "fault" : sfi?.is_confirmed_leak ? "ok" : "muted",
    },
  ];

  return (
    <div className="manual-pipeline-strip" role="list" aria-label="SENTINEX pipeline stages">
      {stages.map((stage) => (
        <div
          key={stage.key}
          className={`manual-pipeline-stage manual-pipeline-stage--${stage.tone}`}
          role="listitem"
        >
          <span className="manual-pipeline-stage__label">{stage.label}</span>
          <span className="manual-pipeline-stage__title">{stage.title}</span>
          <span className="manual-pipeline-stage__status">{stage.status}</span>
          <span className="manual-pipeline-stage__detail">{stage.detail}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * @param {{ defaultEngineId?: string; apiOnline?: boolean }} props
 */
export default function ManualInputPanel({ defaultEngineId = "CAT_C13", apiOnline = true }) {
  const [engineId, setEngineId] = useState(defaultEngineId);
  const [values, setValues] = useState(() => buildPresetReading("normal", defaultEngineId));
  const [activePreset, setActivePreset] = useState("normal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [usedDemoFallback, setUsedDemoFallback] = useState(false);

  const groupedKeys = useMemo(() => {
    const used = new Set();
    const groups = [];
    for (const [title, keys] of Object.entries(SENSOR_GROUPS)) {
      const filtered = keys.filter((k) => ALL_SENSOR_KEYS.includes(k));
      filtered.forEach((k) => used.add(k));
      if (filtered.length) groups.push({ title, keys: filtered });
    }
    const rest = ALL_SENSOR_KEYS.filter((k) => !used.has(k));
    if (rest.length) groups.push({ title: "OTHER", keys: rest });
    return groups;
  }, []);

  const systemState = useMemo(() => {
    if (!result) return null;
    const dqpScore = result.Data_Quality?.score ?? 100;
    return getSystemState(result, dqpScore, activePreset === "custom" ? null : activePreset);
  }, [result, activePreset]);

  const activeJuryDemo = useMemo(
    () => getJurySfiDemo(activePreset),
    [activePreset],
  );

  const faultySensorKey = activeJuryDemo?.faultySensor ?? null;

  const loadPreset = useCallback(
    (scenarioId) => {
      setActivePreset(scenarioId);
      setValues(buildPresetReading(scenarioId, engineId));
      setResult(null);
      setError(null);
      setUsedDemoFallback(false);
    },
    [engineId]
  );

  const loadJuryDemo = useCallback(
    (demoId) => {
      setActivePreset(demoId);
      setValues(buildJurySfiReading(demoId, engineId));
      setResult(null);
      setError(null);
      setUsedDemoFallback(false);
    },
    [engineId]
  );

  const loadBaseline = useCallback(() => {
    const base = { ...(ENGINE_BASELINES[engineId] || ENGINE_BASELINES.CAT_C13) };
    setValues(base);
    setActivePreset("custom");
    setResult(null);
    setError(null);
    setUsedDemoFallback(false);
  }, [engineId]);

  const handleEngineChange = (nextEngine) => {
    setEngineId(nextEngine);
    if (isJurySfiPreset(activePreset)) {
      setValues(buildJurySfiReading(activePreset, nextEngine));
    } else {
      setValues(buildPresetReading(activePreset === "custom" ? "normal" : activePreset, nextEngine));
    }
    setResult(null);
    setError(null);
    setUsedDemoFallback(false);
  };

  const updateField = (key, raw) => {
    setActivePreset("custom");
    const num = parseFloat(raw);
    setValues((prev) => ({
      ...prev,
      [key]: Number.isFinite(num) ? num : raw,
    }));
  };

  const runPrediction = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setUsedDemoFallback(false);

    const mockScenario = resolveManualMockScenario(activePreset);
    const payload = { ...values, engine_id: engineId, demo_scenario: "manual_input" };

    try {
      const res = await axios.post("/api/predict", payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      });
      setResult(res.data);
    } catch (err) {
      if (mockScenario) {
        setUsedDemoFallback(true);
        setResult(getMockPrediction(mockScenario, engineId));
        setError(
          "API offline — showing SFI demo mock. Start the API for live DQP → SSG → ML → SFI pipeline."
        );
      } else {
        const msg =
          err?.response?.data?.detail ||
          err?.message ||
          "Analysis unavailable. Start the detection API for full pipeline processing.";
        setError(typeof msg === "string" ? msg : JSON.stringify(msg));
      }
    } finally {
      setLoading(false);
    }
  };

  const runJuryDemo = async (demoId) => {
    const demo = getJurySfiDemo(demoId);
    if (!demo) return;
    setActivePreset(demoId);
    const reading = buildJurySfiReading(demoId, engineId);
    setValues(reading);
    setResult(null);
    setError(null);
    setUsedDemoFallback(false);
    setLoading(true);

    const payload = { ...reading, engine_id: engineId, demo_scenario: "manual_input" };

    try {
      const res = await axios.post("/api/predict", payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      });
      setResult(res.data);
    } catch (err) {
      setUsedDemoFallback(true);
      setResult(getMockPrediction(demo.mockId, engineId));
      setError(
        "API offline — loaded jury values + SFI mock result. Start the API for live pipeline walkthrough."
      );
    } finally {
      setLoading(false);
    }
  };

  const physics = result?.Physics_Severity;
  const sfiMeta = result?.Sensor_Fault_Isolation;
  const confPct = sfiMeta?.is_sensor_fault && sfiMeta?.fault_confidence != null
    ? (sfiMeta.fault_confidence * 100).toFixed(1)
    : ((result?.Confidence_Score ?? 0) * 100).toFixed(1);

  return (
    <div className="manual-input-page">
      <header className="manual-input-page__header">
        <div className="manual-input-page__intro">
          <h1 className="manual-input-page__title">Manual Sensor Input</h1>
          <p className="manual-input-page__subtitle">
            Enter raw test-cell sensor readings (all 42 channels) and run them through the
            same SENTINEX pipeline as live streaming:{" "}
            <strong>DQP → SSG → ML → SFI</strong> via <code>/api/predict</code> and{" "}
            <code>predict_leak()</code> — not ML-only.
          </p>
        </div>
        <div className="manual-input-page__engine">
          <label className="manual-input-page__engine-label" htmlFor="manual-engine">
            Engine
          </label>
          <select
            id="manual-engine"
            className="manual-input-page__select"
            value={engineId}
            onChange={(e) => handleEngineChange(e.target.value)}
          >
            {Object.entries(ENGINE_DISPLAY).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </header>

      <section className="manual-jury-panel" aria-labelledby="manual-jury-heading">
        <div className="manual-jury-panel__head">
          <div>
            <h2 id="manual-jury-heading" className="manual-jury-panel__title">
              Jury walkthrough — isolated sensor fault
            </h2>
            <p className="manual-jury-panel__desc">
              One-click demo: ML sees a leak-like spike, SFI overrides to{" "}
              <strong>Sensor Hardware Fault</strong>. All sensors except the bad transducer stay at baseline.
            </p>
          </div>
          <button
            type="button"
            className="manual-jury-panel__run-all"
            disabled={loading}
            onClick={() => runJuryDemo(JURY_SFI_DEMOS.find((d) => d.recommended)?.id || JURY_SFI_DEMOS[0].id)}
          >
            {loading && activeJuryDemo?.recommended ? "Running…" : "▶ Run recommended demo"}
          </button>
        </div>

        <div className="manual-jury-panel__cards">
          {JURY_SFI_DEMOS.map((demo) => {
            const isActive = activePreset === demo.id;
            const def = SENSOR_DEFINITIONS[demo.faultySensor];
            return (
              <article
                key={demo.id}
                className={`manual-jury-card ${isActive ? "is-active" : ""} ${demo.recommended ? "is-recommended" : ""}`}
              >
                {demo.recommended && (
                  <span className="manual-jury-card__badge">Recommended for judges</span>
                )}
                <h3 className="manual-jury-card__title">{demo.shortLabel}</h3>
                <p className="manual-jury-card__fault">
                  Bad reading:{" "}
                  <span className="mono manual-jury-card__fault-val">
                    {def?.shortLabel || demo.faultySensor.replace(/_/g, " ")} = {demo.faultyValue} {demo.unit}
                  </span>
                  <span className="manual-jury-card__fault-base">
                    (baseline ~{demo.baselineApprox} {demo.unit})
                  </span>
                </p>
                <ul className="manual-jury-card__expect">
                  <li><span>ML</span> {demo.mlExpectation}</li>
                  <li><span>SFI</span> {demo.sfiExpectation}</li>
                </ul>
                <div className="manual-jury-card__actions">
                  <button
                    type="button"
                    className="manual-jury-card__load"
                    onClick={() => loadJuryDemo(demo.id)}
                  >
                    Load values
                  </button>
                  <button
                    type="button"
                    className="manual-jury-card__run"
                    disabled={loading}
                    onClick={() => runJuryDemo(demo.id)}
                  >
                    Load &amp; run
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {activeJuryDemo && (
          <ol className="manual-jury-steps">
            {activeJuryDemo.steps.map((step, i) => (
              <li key={step}>
                <span className="manual-jury-steps__num">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="manual-input-page__toolbar">
        <span className="manual-input-page__toolbar-label">Scenario presets</span>
        <div className="manual-input-page__presets">
          {PRESET_SCENARIOS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`manual-input-page__preset ${activePreset === p.id ? "is-active" : ""}`}
              onClick={() => loadPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            className={`manual-input-page__preset ${activePreset === "custom" ? "is-active" : ""}`}
            onClick={loadBaseline}
          >
            Reset baseline
          </button>
        </div>
        <div className="manual-input-page__actions">
          <button
            type="button"
            className="manual-input-page__run"
            onClick={runPrediction}
            disabled={loading}
          >
            {loading ? "Running pipeline…" : "Run SENTINEX pipeline"}
          </button>
          {!apiOnline && !usedDemoFallback && (
            <span className="manual-input-page__offline">API offline — presets can use demo mocks</span>
          )}
        </div>
      </div>

      <div className="manual-input-page__layout">
        <div className="manual-input-page__form scroll-thin">
          {groupedKeys.map((group) => (
            <section key={group.title} className="manual-input-group">
              <h2 className="manual-input-group__title">{group.title}</h2>
              <div className="manual-input-group__grid">
                {group.keys.map((key) => {
                  const def = SENSOR_DEFINITIONS[key];
                  const unit = def?.unit || "";
                  const isFaultField = faultySensorKey === key;
                  return (
                    <label
                      key={key}
                      className={`manual-input-field ${isFaultField ? "manual-input-field--fault" : ""}`}
                    >
                      <span className="manual-input-field__label" title={key}>
                        {isFaultField && <span className="manual-input-field__fault-tag" aria-hidden>⚡ </span>}
                        {def?.shortLabel || key}
                      </span>
                      <div className="manual-input-field__row">
                        <input
                          type="number"
                          step="any"
                          className="manual-input-field__input mono"
                          value={values[key] ?? ""}
                          onChange={(e) => updateField(key, e.target.value)}
                        />
                        {unit && <span className="manual-input-field__unit">{unit}</span>}
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <aside className="manual-input-page__results">
          <div className="manual-result-card liquid-glass-card">
            <h2 className="manual-result-card__title">Pipeline result</h2>

            {error && (
              <div className={`manual-result-card__error ${usedDemoFallback ? "manual-result-card__error--warn" : ""}`} role="alert">
                {error}
              </div>
            )}

            {!result && !error && !loading && (
              <p className="manual-result-card__empty">
                Load a preset or edit sensor values, then select{" "}
                <strong>Run SENTINEX pipeline</strong>.
              </p>
            )}

            {loading && (
              <p className="manual-result-card__empty">DQP → SSG → ML → SFI…</p>
            )}

            {result && systemState && (
              <div className="manual-result-card__body">
                <ManualPipelineStrip result={result} />

                <div className={`manual-result__headline manual-result__headline--${systemState.color}`}>
                  <span className="manual-result__headline-icon">{systemState.icon}</span>
                  <div>
                    <div className="manual-result__headline-title">{systemState.title}</div>
                    <div className="manual-result__headline-msg">{systemState.message}</div>
                    {systemState.subtext && (
                      <div className="manual-result__headline-sub">{systemState.subtext}</div>
                    )}
                  </div>
                </div>

                {!usedDemoFallback && (
                  <div className="manual-result__stage-panels">
                    <div className="manual-result__stage-panel">
                      <h3 className="manual-result__stage-title">Steady State Guard</h3>
                      <SteadyStatePanel prediction={result} isStreaming={false} />
                    </div>
                  </div>
                )}

                <dl className="manual-result__grid">
                  <div>
                    <dt>Location</dt>
                    <dd>{formatLocation(result.Leak_Present === 1 ? result.Leak_Location : "None")}</dd>
                  </div>
                  <div>
                    <dt>Severity</dt>
                    <dd className={severityClass(result.Leak_Severity)}>
                      {result.Leak_Severity || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>{sfiMeta?.is_sensor_fault ? "SFI confidence" : "Confidence"}</dt>
                    <dd className="mono">{confPct}%</dd>
                  </div>
                  <div>
                    <dt>Action</dt>
                    <dd>{formatAction(result.Recommended_Action)}</dd>
                  </div>
                </dl>

                {physics?.performance_impact_pct > 0 && (
                  <div className="manual-result__impact">
                    <span className="manual-result__impact-label">Performance impact</span>
                    <span className="manual-result__impact-value mono">
                      {Number(physics.performance_impact_pct).toFixed(1)}%
                    </span>
                    {physics.impact_basis && (
                      <span className="manual-result__impact-basis">{physics.impact_basis}</span>
                    )}
                  </div>
                )}

                {result.Data_Quality?.flags?.length > 0 && (
                  <div className="manual-result__dqp-flags">
                    <h3 className="manual-result__shap-title">DQP cleaned sensors</h3>
                    <ul className="manual-result__shap-list">
                      {result.Data_Quality.flags.map((flag) => (
                        <li key={`${flag.sensor}-${flag.type}`}>
                          <span className="mono">{flag.sensor.replace(/_/g, " ")}</span>
                          <span>{flag.type}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {systemState.sfi && (
                  <SensorFaultPanel sfiData={systemState.sfi} />
                )}

                {(result.top_5_sensors_driving_prediction || []).length > 0 && (
                  <div className="manual-result__shap">
                    <h3 className="manual-result__shap-title">Primary sensor drivers (SHAP)</h3>
                    <ul className="manual-result__shap-list">
                      {result.top_5_sensors_driving_prediction.map((row) => (
                        <li key={row.sensor}>
                          <span className="mono">{row.sensor.replace(/_/g, " ")}</span>
                          <span className={row.shap_impact < 0 ? "neg" : "pos"}>
                            {row.deviation_pct != null ? `${row.deviation_pct.toFixed(1)}%` : "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
