import { SCENARIO_LABELS, ENGINE_DISPLAY } from "../simulator.js";
import { getTesterDisplayName, isTesterRole } from "./testerRegistry.js";
import { getTesterBayTone } from "./testerBayTone.js";

/** Build compact per-bay summaries for head ARIA comparisons. */
export function buildCellTesterSummaries(boardTesters = []) {
  return boardTesters
    .filter((t) => isTesterRole(t.id))
    .map((t) => {
      const snap = t.snap;
      const p = t.presence;
      const pred = snap?.latestPrediction;
      const rca = snap?.latestRca;
      const tone = getTesterBayTone(t);
      const scenario = p?.scenario || snap?.currentScenario;
      const scenarioLabel = SCENARIO_LABELS[scenario] || scenario || "Normal";
      const leak = Boolean(pred?.Leak_Present === 1 && !pred?.Suppressed);
      const topCause = rca?.rankedCauses?.[0];

      return {
        tester_id: t.id,
        display_name: t.displayName || getTesterDisplayName(t.id),
        online: Boolean(t.online),
        bay_tone: tone,
        engine: ENGINE_DISPLAY[p?.engine || snap?.activeEngine] || p?.engine || snap?.activeEngine,
        scenario: scenarioLabel,
        streaming: Boolean(p?.isStreaming || snap?.isStreaming),
        readings: p?.readingCount ?? snap?.readingCount ?? 0,
        op_rpm: snap?.opRpm ?? p?.opRpm,
        op_load: snap?.opLoad ?? p?.opLoad,
        op_ambient_kpa: snap?.opAmbientPressure ?? p?.opAmbientPressure,
        leak_detected: leak,
        leak_location: pred?.Leak_Location?.replace(/_/g, " ") || "None",
        severity: pred?.Leak_Severity || "None",
        confidence_pct: pred?.Confidence_Score != null
          ? Number((pred.Confidence_Score * 100).toFixed(1))
          : null,
        dq_score: pred?.Data_Quality?.score ?? null,
        top_rca_cause: topCause
          ? `${topCause.label} (${topCause.probabilityPct})`
          : null,
        rca_ranked_causes: (rca?.rankedCauses || []).slice(0, 3).map((c) => ({
          rank: c.rank,
          label: c.label,
          probability: c.probabilityPct,
        })),
      };
    });
}

export function formatCellSummariesForPrompt(summaries = []) {
  if (!summaries.length) return "No tester bay data available.";
  return summaries.map((s) => {
    const status = s.online
      ? (s.leak_detected ? `LEAK — ${s.leak_location} (${s.severity})` : "NORMAL")
      : "OFFLINE";
    const rca = s.top_rca_cause ? ` | Top RCA: ${s.top_rca_cause}` : "";
    const op = s.op_rpm != null
      ? ` | OP ${s.op_rpm} RPM / ${s.op_load}% / ${s.op_ambient_kpa} kPa`
      : "";
    return (
      `- ${s.display_name}: ${status} | ${s.engine || "—"} | ${s.scenario}${op}`
      + ` | ${s.streaming ? "LIVE" : "paused"} | #${s.readings}${rca}`
    );
  }).join("\n");
}
