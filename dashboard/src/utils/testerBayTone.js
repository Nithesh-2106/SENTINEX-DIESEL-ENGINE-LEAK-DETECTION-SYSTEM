/** Panel tone for cell community dashboard. */
export const BAY_TONE_META = {
  offline: { label: "OFFLINE", color: "offline" },
  leak: { label: "LEAK DETECTED", color: "leak" },
  sensorFault: { label: "SENSOR FAULT", color: "sensor-fault" },
  normal: { label: "NORMAL", color: "normal" },
  steady: { label: "STEADY STATE", color: "steady" },
  transitioning: { label: "TRANSITIONING", color: "transitioning" },
};

function sensorFaultActive(tester) {
  const snap = tester?.snap;
  const p = tester?.presence;
  if (p?.sensorFaultDetected || snap?.sensorFaultActive) return true;
  return Boolean(snap?.latestPrediction?.Sensor_Fault_Isolation?.is_sensor_fault);
}

export function getTesterBayTone(tester) {
  if (!tester?.online) return "offline";

  if (sensorFaultActive(tester)) return "sensorFault";

  const snap = tester.snap;
  const p = tester.presence;
  const leak = Boolean(p?.leakDetected || snap?.leakActive);
  if (leak) return "leak";

  const pred = snap?.latestPrediction;
  const suppressed = Boolean(pred?.Suppressed);
  const actRpm = Number(snap?.opRpm ?? p?.opRpm);
  const spRpm = Number(snap?.spRpm ?? p?.spRpm);
  const actLoad = Number(snap?.opLoad ?? p?.opLoad);
  const spLoad = Number(snap?.spLoad ?? p?.spLoad);

  const settling = suppressed
    || (Number.isFinite(actRpm) && Number.isFinite(spRpm) && Math.abs(actRpm - spRpm) > 2)
    || (Number.isFinite(actLoad) && Number.isFinite(spLoad) && Math.abs(actLoad - spLoad) > 0.5);

  // Steady-state guard suppression and setpoint settling share the same panel tone.
  if (settling) return "transitioning";

  const streaming = Boolean(p?.isStreaming || snap?.isStreaming);
  if (!streaming) return "steady";

  return "normal";
}
