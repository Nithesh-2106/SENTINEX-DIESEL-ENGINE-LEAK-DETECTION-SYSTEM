/**
 * Human-readable SFI (Sensor Fault Isolation) copy for twin / hologram UI.
 */

export function shortSensorName(name) {
  return (name || "")
    .replace(/_kPa|_kgph|_RPM|_Pct|_C|_bar/g, " ")
    .replace(/_/g, " ")
    .trim();
}

/**
 * Build UI copy explaining why SFI flagged a sensor as a hardware fault.
 *
 * @param {object|null|undefined} sfiData — Sensor_Fault_Isolation from prediction
 * @param {{ sensorKey?: string|null }} [options]
 * @returns {null | {
 *   headline: string,
 *   detail: string,
 *   shortDetail: string,
 *   correlatedLine: string,
 *   confidencePct: string|null,
 * }}
 */
export function buildSfiFaultExplanation(sfiData, { sensorKey } = {}) {
  if (!sfiData?.is_sensor_fault) return null;
  if (sensorKey && sfiData.faulty_sensor && sensorKey !== sfiData.faulty_sensor) {
    return null;
  }

  const deviating = sfiData.correlated_deviating ?? 0;
  const required = sfiData.correlated_required ?? 0;
  const correlatedLine =
    `${deviating}/${required} correlated sensors confirm the pattern — isolated anomaly, not a leak`;

  const reason = (sfiData.fault_reason || "").trim();
  const devMatch = reason.match(/deviated\s+([\d.]+)%/i);
  const deviationPct = devMatch ? devMatch[1] : null;
  const sensorLabel = shortSensorName(sfiData.faulty_sensor);

  const headline = deviationPct
    ? `${sensorLabel} deviated ${deviationPct}% with no matching cascade`
    : "Isolated sensor anomaly — no leak cascade confirmed";

  const detail = reason || `${correlatedLine}. Likely hardware fault — not a leak.`;

  const shortDetail = deviationPct
    ? `${deviating}/${required} correlated sensors matched · ${deviationPct}% deviation · hardware fault, not leak`
    : `${correlatedLine} · hardware fault, not leak`;

  return {
    headline,
    detail,
    shortDetail,
    correlatedLine,
    confidencePct:
      sfiData.fault_confidence != null
        ? (Number(sfiData.fault_confidence) * 100).toFixed(1)
        : null,
  };
}
