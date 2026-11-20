/** Offsets and primary sensors for grouped SENSORS mode component cards. */

export const SENSOR_CARD_OFFSETS = {
  AIR_FILTER: { x: -180, y: 0 },
  TURBOCHARGER: { x: 120, y: -40 },
  CAC: { x: 0, y: -120 },
  ENGINE_BLOCK: { x: -60, y: 80 },
  EGR_COOLER: { x: -80, y: -60 },
  DPF_DOC: { x: 80, y: 40 },
  SCR: { x: 60, y: 0 },
  EXHAUST_OUT: { x: 80, y: 0 },
};

export const PRIMARY_SENSOR_KEYS = {
  AIR_FILTER: "MAF_Sensor_Reading_kgph",
  TURBOCHARGER: "Turbocharger_Speed_RPM",
  CAC: "CAC_Pressure_Drop_kPa",
  ENGINE_BLOCK: "Exhaust_Manifold_Temp_C",
  EGR_COOLER: "EGR_Flow_Rate_kgph",
  DPF_DOC: "Post_Turbine_Pressure_kPa",
  SCR: "Post_SCR_Pressure_kPa",
  EXHAUST_OUT: "Tailpipe_Backpressure_kPa",
};

export const DEVIATION_COLORS = {
  ok: "#1D9E75",
  warn: "#EF9F27",
  alert: "#E24B4A",
  none: "#666666",
};

export function deviationPct(value, baseline) {
  if (value == null || baseline == null || baseline === 0) return null;
  return Math.abs(((Number(value) - baseline) / Math.abs(baseline)) * 100);
}

export function deviationColor(value, baseline) {
  const pct = deviationPct(value, baseline);
  if (pct == null) return DEVIATION_COLORS.none;
  if (pct < 2) return DEVIATION_COLORS.ok;
  if (pct <= 8) return DEVIATION_COLORS.warn;
  return DEVIATION_COLORS.alert;
}

export function worstDeviationColor(sensors, readings) {
  let worst = DEVIATION_COLORS.none;
  let worstPct = -1;
  sensors.forEach((s) => {
    const pct = deviationPct(readings?.[s.key], s.baseline);
    if (pct == null) return;
    if (pct > worstPct) {
      worstPct = pct;
      worst = deviationColor(readings[s.key], s.baseline);
    }
  });
  return worst;
}
