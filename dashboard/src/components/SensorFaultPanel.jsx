/**
 * Sensor Fault Isolator panel — shown when SFI metadata is present.
 */

function shortSensor(name) {
  return (name || "").replace(/_kPa|_kgph|_RPM|_Pct|_C|_bar/g, "");
}

function parseDeviatingSensors(faultReason) {
  if (!faultReason) return [];
  const match = faultReason.match(/Deviating:\s*([^.]+)/i);
  if (!match) return [];
  return match[1].split(",").map((s) => s.trim()).filter(Boolean);
}

function parsePhysicalBasis(faultReason) {
  if (!faultReason) return "";
  const parts = faultReason.split(/Deviating:\s*[^.]+\.\s*/i);
  return parts[parts.length - 1]?.trim() || "";
}

/**
 * @param {{ sfiData: object }} props
 */
export default function SensorFaultPanel({ sfiData }) {
  if (!sfiData?.checked) return null;

  if (sfiData.is_sensor_fault) {
    return (
      <div className="sfi-panel fault">
        <div className="sfi-panel-title text-amber-300">Sensor fault detected</div>
        <ul className="sfi-sensor-list">
          <li className="font-mono text-amber-200">{shortSensor(sfiData.faulty_sensor)}</li>
        </ul>
        <p className="sfi-panel-body">
          {sfiData.correlated_deviating}/{sfiData.correlated_required} correlated sensors — isolated anomaly, not a leak
        </p>
        {sfiData.fault_confidence != null && (
          <p className="sfi-panel-body mono text-amber-200/90">
            SFI fault confidence: {(sfiData.fault_confidence * 100).toFixed(1)}%
            <span className="block text-[10px] text-amber-100/60 mt-1 font-sans">
              Leak confidence intentionally 0% — no cascade confirmed
            </span>
          </p>
        )}
      </div>
    );
  }

  if (sfiData.is_confirmed_leak) {
    const cascadeConfirmed =
      sfiData.correlated_deviating >= sfiData.correlated_required;
    const partial =
      !cascadeConfirmed &&
      (sfiData.fault_reason || "").includes("Primary sensor not deviating");
    const deviating = parseDeviatingSensors(sfiData.fault_reason);
    const physicalBasis = parsePhysicalBasis(sfiData.fault_reason);

    return (
      <div className="sfi-panel confirmed">
        <div className="sfi-panel-title text-[#22C55E]">
          {cascadeConfirmed
            ? "Leak pattern confirmed"
            : partial
              ? "ML leak signal — partial physics match"
              : "Leak pattern under review"}
        </div>
        <p className="sfi-panel-body">
          {sfiData.correlated_deviating}/{sfiData.correlated_required} correlated sensors
          {cascadeConfirmed ? " deviating consistently" : " matched"}
        </p>
        {deviating.length > 0 && (
          <div className="sfi-list-block">
            <div className="sfi-list-label">Deviating sensors</div>
            <ul className="sfi-sensor-list">
              {deviating.map((sensor) => (
                <li key={sensor} className="font-mono text-[#CBD5E1]">
                  {shortSensor(sensor)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {physicalBasis && (
          <p className="sfi-panel-body sfi-physical-basis">
            <span className="text-[#94A3B8]">Physical basis: </span>
            {physicalBasis}
          </p>
        )}
      </div>
    );
  }

  return null;
}
