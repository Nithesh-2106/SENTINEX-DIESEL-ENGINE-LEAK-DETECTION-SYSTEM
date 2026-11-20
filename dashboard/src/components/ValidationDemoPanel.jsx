/**
 * Validation demo — runs 15 clean-dataset examples live (8 single + 7 multi-leak).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

const SCENARIO_DISPLAY = {
  Normal: "Normal operation",
  Intake_PreTurbo: "Intake — Pre turbo",
  Intake_PostTurbo_CAC: "Intake — Post turbo / CAC",
  Exhaust_PreTurbine: "Exhaust — Pre turbine",
  Exhaust_PostTurbine: "Exhaust — Post turbine",
  EGR_Leak: "EGR system leak",
  CAC_Direct_Leak: "CAC direct leak",
  Minor_Intake_Leak: "Minor intake leak",
};

const LOCATION_DISPLAY = {
  None: "No leak",
  ...SCENARIO_DISPLAY,
};

function formatScenarioLabel(label) {
  if (!label) return "—";
  if (label.startsWith("Multi:")) return label;
  return SCENARIO_DISPLAY[label] || label.replace(/_/g, " ");
}

function formatLocationDisplay(ex) {
  if (ex.is_multi_leak && Array.isArray(ex.actual_locations) && ex.actual_locations.length >= 2) {
    return ex.actual_locations
      .map((loc) => LOCATION_DISPLAY[loc] || loc.replace(/_/g, " "))
      .join(" + ");
  }
  const loc = ex.actual_location;
  if (!loc || loc === "None") return "No leak";
  if (loc.includes(" + ")) {
    return loc
      .split(" + ")
      .map((part) => LOCATION_DISPLAY[part.trim()] || part.replace(/_/g, " "))
      .join(" + ");
  }
  return LOCATION_DISPLAY[loc] || loc.replace(/_/g, " ");
}

function formatPredictedDisplay(ex) {
  if (ex.is_multi_leak && Array.isArray(ex.predicted_locations) && ex.predicted_locations.length >= 2) {
    return ex.predicted_locations
      .map((loc) => LOCATION_DISPLAY[loc] || loc.replace(/_/g, " "))
      .join(" + ");
  }
  const loc = ex.predicted_location;
  if (!loc || loc === "None") return "No leak";
  if (loc.includes(" + ")) {
    return loc
      .split(" + ")
      .map((part) => LOCATION_DISPLAY[part.trim()] || part.replace(/_/g, " "))
      .join(" + ");
  }
  return LOCATION_DISPLAY[loc] || loc.replace(/_/g, " ");
}

function confidencePct(value) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * @param {{ apiOnline?: boolean }} props
 */
export default function ValidationDemoPanel({ apiOnline = true }) {
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState(null);
  const [payload, setPayload] = useState(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const revealTimer = useRef(null);

  const clearReveal = useCallback(() => {
    if (revealTimer.current) {
      clearInterval(revealTimer.current);
      revealTimer.current = null;
    }
  }, []);

  useEffect(() => () => clearReveal(), [clearReveal]);

  const startReveal = useCallback(
    (data) => {
      clearReveal();
      setVisibleCount(0);
      const total = data?.examples?.length ?? 0;
      if (!total) {
        setPhase("done");
        return;
      }
      let shown = 0;
      revealTimer.current = setInterval(() => {
        shown += 1;
        setVisibleCount(shown);
        if (shown >= total) {
          clearReveal();
          setPhase("done");
        }
      }, 380);
    },
    [clearReveal]
  );

  const runDemo = async () => {
    if (!apiOnline) {
      setError("Detection service offline — start the API server and try again.");
      return;
    }

    clearReveal();
    setPhase("running");
    setError(null);
    setPayload(null);
    setVisibleCount(0);

    try {
      const res = await axios.post("/api/validation-demo/run", null, {
        timeout: 180000,
      });
      setPayload(res.data);
      setPhase("revealing");
      startReveal(res.data);
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Validation demo failed. Check that the detection service is running.";
      setError(typeof msg === "string" ? msg : JSON.stringify(msg));
      setPhase("idle");
    }
  };

  const examples = payload?.examples ?? [];
  const isBusy = phase === "running" || phase === "revealing";
  const summaryReady = phase === "done" && payload;
  const singleCount = payload?.single_scenarios ?? 8;
  const multiCount = payload?.multi_scenarios ?? 7;

  return (
    <div className="validation-demo-page">
      <header className="validation-demo-page__header">
        <div className="validation-demo-page__intro">
          <h1 className="validation-demo-page__title">Validation Demo</h1>
          <p className="validation-demo-page__subtitle">
            Run <strong>15 clean test-cell readings</strong> through the production multilabel
            model in real time — <strong>{singleCount} single-leak scenarios</strong> (including
            normal) plus <strong>{multiCount} simultaneous multi-leak combinations</strong>.
            Training used the combined dataset ({payload?.training_dataset || "combined CSV"}{" "}
            with single + multi rows); this demo runs one representative row per scenario through
            live inference.
          </p>
        </div>
        <button
          type="button"
          className={`validation-demo-page__run-btn ${isBusy ? "is-running" : ""}`}
          onClick={runDemo}
          disabled={isBusy}
        >
          {phase === "running" ? "Running predictions…" : "Run validation demo"}
        </button>
      </header>

      {error && (
        <div className="validation-demo-page__error" role="alert">
          {error}
        </div>
      )}

      {payload && (
        <div className="validation-demo-page__meta">
          <span className="validation-demo-page__chip">
            Single: {singleCount} · Multi: {multiCount}
          </span>
          <span className="validation-demo-page__chip validation-demo-page__chip--muted">
            Trained on: {payload.training_dataset}
          </span>
        </div>
      )}

      {summaryReady && (
        <div
          className={`validation-demo-page__score ${
            payload.correct === payload.total
              ? "validation-demo-page__score--pass"
              : "validation-demo-page__score--partial"
          }`}
        >
          <span className="validation-demo-page__score-value">
            {payload.correct}/{payload.total}
          </span>
          <span className="validation-demo-page__score-label">
            correct across all scenarios ({payload.accuracy_pct}%)
          </span>
        </div>
      )}

      <div className="validation-demo-page__table-wrap">
        <table className="validation-demo-page__table">
          <thead>
            <tr>
              <th>#</th>
              <th>Scenario</th>
              <th>Actual</th>
              <th>Predicted</th>
              <th>Confidence</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {examples.length === 0 && phase === "idle" && (
              <tr>
                <td colSpan={6} className="validation-demo-page__empty">
                  Press <strong>Run validation demo</strong> to predict on 15 clean examples
                  (8 single-leak + 7 multi-leak).
                </td>
              </tr>
            )}
            {phase === "running" && examples.length === 0 && (
              <tr>
                <td colSpan={6} className="validation-demo-page__empty validation-demo-page__empty--busy">
                  Loading clean readings and running multilabel inference…
                </td>
              </tr>
            )}
            {examples.slice(0, visibleCount).map((ex, idx) => (
              <tr
                key={`${ex.dataset_source}-${ex.row_index}`}
                className={`validation-demo-page__row ${
                  ex.correct ? "validation-demo-page__row--ok" : "validation-demo-page__row--miss"
                } ${ex.is_multi_leak ? "validation-demo-page__row--multi" : ""} validation-demo-page__row--reveal`}
              >
                <td className="mono">{idx + 1}</td>
                <td>
                  {formatScenarioLabel(ex.scenario_label)}
                  {ex.is_multi_leak && (
                    <span className="validation-demo-page__multi-tag">MULTI</span>
                  )}
                </td>
                <td>{formatLocationDisplay(ex)}</td>
                <td>{formatPredictedDisplay(ex)}</td>
                <td className="mono">{confidencePct(ex.confidence)}</td>
                <td>
                  <span
                    className={`validation-demo-page__badge ${
                      ex.correct
                        ? "validation-demo-page__badge--ok"
                        : "validation-demo-page__badge--miss"
                    }`}
                  >
                    {ex.correct ? "Match" : "Mismatch"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {summaryReady && (
        <p className="validation-demo-page__footnote">
          Rows {examples.filter((e) => !e.is_multi_leak).map((e) => e.row_index).join(", ")} from
          the single-leak clean file; rows{" "}
          {examples.filter((e) => e.is_multi_leak).map((e) => e.row_index).join(", ")} from the
          multi-leak dataset. Multi-leak rows pass when both active locations match.
        </p>
      )}
    </div>
  );
}
