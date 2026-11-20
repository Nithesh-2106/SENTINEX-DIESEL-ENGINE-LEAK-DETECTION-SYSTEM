import React from "react";
import { formatModelAccuracy, displayModelName } from "../utils/modelSelection.js";
import {
  formatLeakLocation,
  isMultiLeakPrediction,
  stabilizeActiveLeaks,
} from "../utils/multiLeak.js";

function pillClass(kind) {
  if (kind === "ok") return "judge-answer-pill--ok";
  if (kind === "warn") return "judge-answer-pill--warn";
  if (kind === "bad") return "judge-answer-pill--bad";
  if (kind === "info") return "judge-answer-pill--info";
  return "judge-answer-pill--muted";
}

function JudgeStatusRow({ label, answer, tone = "muted", answerClass = "" }) {
  return (
    <div className="judge-status-row">
      <span className="judge-status-label">{label}</span>
      <span className={`judge-answer-pill ${pillClass(tone)} ${answerClass}`}>
        {answer}
      </span>
    </div>
  );
}

function prettyAction(a) {
  return (a || "—").replace(/_/g, " ");
}

function prettyLocation(loc) {
  return (loc || "None").replace(/_/g, " ");
}

function severityTone(sev) {
  const s = (sev || "").toLowerCase();
  if (s === "critical" || s === "severe") return "bad";
  if (s === "moderate") return "warn";
  return "ok";
}

/**
 * @param {{
 *   prediction: any | null;
 *   modelSelection?: any | null;
 *   apiOnline: boolean;
 *   multiPattern?: object | null;
 *   activeScenario?: string | null;
 * }} props
 */
export default function JudgeSummaryCard({
  prediction,
  modelSelection: modelSelectionProp,
  apiOnline,
  multiPattern,
  activeScenario = null,
}) {
  const suppressed = Boolean(prediction?.Suppressed);
  const leak = prediction?.Leak_Present === 1;
  const multi = multiPattern ?? prediction?.Multi_Pattern ?? null;
  const isMultiLeak = isMultiLeakPrediction(prediction);
  const activeLeaks = stabilizeActiveLeaks(prediction, activeScenario);
  const sensorFault = Boolean(prediction?.Sensor_Fault_Isolation?.is_sensor_fault);
  const steady = Boolean(prediction?.Steady_State_Metrics?.is_steady);
  const dqScore = prediction?.Data_Quality?.score ?? 100;
  const sfi = prediction?.Sensor_Fault_Isolation;
  const conf = sensorFault && sfi?.fault_confidence != null
    ? (sfi.fault_confidence * 100).toFixed(1)
    : prediction?.Confidence_Score != null
      ? (prediction.Confidence_Score * 100).toFixed(1)
      : null;
  const topShap = prediction?.top_5_sensors_driving_prediction?.[0];

  const steadyPill = suppressed ? "warn" : steady ? "ok" : "warn";
  const leakPill = suppressed ? "muted" : leak ? "bad" : sensorFault ? "warn" : "ok";
  const leakLabel = suppressed
    ? "SUPPRESSED"
    : leak
      ? "DETECTED"
      : sensorFault
        ? "SENSOR FAULT"
        : "NORMAL";

  const modelSelection = modelSelectionProp ?? prediction?.Model_Selection;
  const activeModel = displayModelName(
    modelSelection?.active_model_id,
    modelSelection?.active_model_name
  );
  const modelRows = modelSelection?.models ?? [];

  return (
    <div className="section-card compact judge-summary-card">
      <div className="section-card-header">
        <div>
          <div className="section-card-title">JUDGE SUMMARY</div>
        </div>
        <span
          className={`api-badge ${apiOnline ? "" : ""}`}
          style={
            apiOnline
              ? {}
              : {
                  color: "var(--color-warning)",
                  borderColor: "rgba(239,159,39,0.3)",
                  background: "var(--bg-amber)",
                }
          }
        >
          {apiOnline ? "API ONLINE" : "DEMO MODE"}
        </span>
      </div>
      <div className="section-card-body judge-summary-body text-sm">
        <div className="judge-summary-pinned">
          <div className="judge-status-list">
            <JudgeStatusRow
              label="Steady state"
              answer={suppressed ? "GUARD ACTIVE" : steady ? "STEADY" : "TRANSITION"}
              tone={steadyPill}
            />
            <JudgeStatusRow label="Leak" answer={leakLabel} tone={leakPill} />
            {leak && !suppressed && isMultiLeak && (
              <JudgeStatusRow
                label="Anomalies"
                answer="MULTIPLE"
                tone="info"
                answerClass="judge-answer-pill--purple"
              />
            )}
            {leak && !suppressed && !isMultiLeak && (
              <JudgeStatusRow label="Anomalies" answer="SINGLE" tone="ok" />
            )}
            {leak && !suppressed && isMultiLeak && activeLeaks.length >= 2 && (
              <>
                {activeLeaks.map((leakDetail, idx) => (
                  <JudgeStatusRow
                    key={leakDetail.location}
                    label={idx === 0 ? "Primary" : "Secondary"}
                    answer={`${formatLeakLocation(leakDetail.location)} · ${leakDetail.severity || "—"}`}
                    tone={severityTone(leakDetail.severity)}
                    answerClass={idx > 0 ? "judge-answer-pill--purple" : ""}
                  />
                ))}
              </>
            )}
            {leak && !suppressed && isMultiLeak && activeLeaks.length < 2 && (
              <>
                <JudgeStatusRow
                  label="Primary"
                  answer={prettyLocation(multi?.primary_location || prediction?.Leak_Location)}
                  tone="bad"
                />
                <JudgeStatusRow
                  label="Secondary"
                  answer={prettyLocation(multi?.secondary_location)}
                  tone="info"
                  answerClass="judge-answer-pill--purple"
                />
              </>
            )}
            {leak && !suppressed && !isMultiLeak && (
              <JudgeStatusRow
                label="Location"
                answer={prettyLocation(prediction?.Leak_Location)}
                tone="bad"
              />
            )}
            <JudgeStatusRow
              label="Action"
              answer={prettyAction(
                (leak || sensorFault) && !suppressed
                  ? prediction?.Recommended_Action
                  : "Continue_Testing"
              )}
              tone="info"
            />
          </div>

          <div className="judge-detail-grid judge-detail-grid--pinned">
            <div className="judge-detail-cell">
              <span className="judge-detail-label">
                {sensorFault ? "SFI Confidence" : "Confidence"}
              </span>
              <span className={`judge-detail-value ${leak ? "leak" : sensorFault ? "warn" : ""}`}>
                {conf != null ? `${conf}%` : "—"}
              </span>
            </div>
            <div className="judge-detail-cell">
              <span className="judge-detail-label">Severity</span>
              {leak && !suppressed ? (
                <span className={`judge-answer-pill judge-answer-pill--sm ${pillClass(severityTone(prediction?.Leak_Severity))}`}>
                  {prediction?.Leak_Severity || "—"}
                </span>
              ) : (
                <span className="judge-detail-value">—</span>
              )}
            </div>
            <div className="judge-detail-cell">
              <span className="judge-detail-label">DQ Score</span>
              <span className={`judge-detail-value ${dqScore >= 90 ? "ok" : dqScore >= 70 ? "warn" : "bad"}`}>
                {dqScore}/100
              </span>
            </div>
            <div className="judge-detail-cell">
              <span className="judge-detail-label">SFI Status</span>
              <span className={`judge-answer-pill judge-answer-pill--sm ${pillClass(sensorFault ? "warn" : "ok")}`}>
                {sensorFault ? "FAULT SUSPECT" : "CLEAR"}
              </span>
            </div>
          </div>

          {modelSelection && (
            <div className="judge-model-header">
              <span className="judge-status-label">Active model</span>
              <span className="judge-answer-pill judge-answer-pill--sm judge-answer-pill--purple">
                {activeModel ?? "—"}
                {modelSelection.active_leak_location_accuracy != null && (
                  <span className="judge-pill-mono">
                    {formatModelAccuracy(modelSelection.active_leak_location_accuracy)}
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        <div className="judge-summary-scroll">
          <div className="judge-detail-stack">
            <div className="judge-detail-cell judge-detail-wide">
              <span className="judge-detail-label">Top SHAP driver</span>
              <span className="judge-detail-mono">
                {topShap
                  ? `${(topShap.sensor || "").replace(/_/g, " ")} (${topShap.deviation_pct >= 0 ? "+" : ""}${Number(topShap.deviation_pct).toFixed(1)}%)`
                  : leak && !suppressed
                    ? "Computing…"
                    : "—"}
              </span>
            </div>
            <div className="judge-detail-cell judge-detail-wide">
              <span className="judge-detail-label">Pipeline stage</span>
              <span className="judge-detail-mono">
                {suppressed
                  ? "Stage 2 SSG — detection suppressed"
                  : sensorFault
                    ? "Stage 5 SFI — hardware fault check"
                    : leak
                      ? "Stage 3–4 ML + SHAP — leak classified"
                      : "Stage 1–3 DQP + ML — monitoring"}
              </span>
            </div>
          </div>

          {!steady && prediction?.Steady_State_Metrics?.reason && (
            <div className="judge-ssg-note rounded-lg border border-hud-border bg-hud-bg1/60 px-3 py-2 font-mono text-xs text-[#E2E8F0]">
              SSG: {prediction.Steady_State_Metrics.reason}
            </div>
          )}
          {sensorFault && sfi?.faulty_sensor && (
            <div className="judge-ssg-note rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-xs text-amber-200/90">
              SFI flagged <strong>{sfi.faulty_sensor.replace(/_/g, " ")}</strong>
              {sfi.fault_confidence != null
                ? ` — ${(sfi.fault_confidence * 100).toFixed(0)}% fault confidence`
                : sfi.confidence != null
                  ? ` (${(sfi.confidence * 100).toFixed(0)}% confidence)`
                  : ""}
              {sfi.correlated_deviating != null && sfi.correlated_required != null && (
                <span className="block mt-1 text-amber-100/70">
                  Cascade check: {sfi.correlated_deviating}/{sfi.correlated_required} correlated sensors — leak confidence zeroed
                </span>
              )}
            </div>
          )}

          {modelSelection && (
            <div className="judge-model-block">
              <div className="judge-model-block-title">Model accuracy</div>
              <div className="judge-model-rows">
                {modelRows.map((m) => {
                  const pct = Math.max(4, (m.leak_location_accuracy ?? 0) * 100);
                  return (
                    <div key={m.id} className={`judge-model-row ${m.is_active ? "judge-model-row--active" : ""}`}>
                      <div className="judge-model-row-head">
                        <span className="judge-model-row-name">{displayModelName(m)}</span>
                        <span className="judge-model-row-pct">
                          {formatModelAccuracy(m.leak_location_accuracy)}
                        </span>
                      </div>
                      <div className="judge-model-row-track">
                        <div
                          className="judge-model-row-fill"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
