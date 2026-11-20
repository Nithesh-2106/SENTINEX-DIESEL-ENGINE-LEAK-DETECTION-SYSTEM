/**
 * Consistent sensor value + unit formatting for Digital Twin overlays.
 * Data stays in SI (kg/h, kPa, °C); display matches dashboard SensorGrid.
 */
export function formatSensorValue(sensorId, value, unit) {
  if (value == null || Number.isNaN(Number(value))) {
    return { valueText: "—", unitText: unit || "" };
  }
  const v = Number(value);
  const u = unit || "";

  if (u === "RPM") {
    return { valueText: Math.round(v).toLocaleString("en-US"), unitText: "RPM" };
  }
  if (u === "%") {
    return { valueText: v.toFixed(1), unitText: "%" };
  }
  if (u === "°C") {
    return { valueText: v.toFixed(1), unitText: "°C" };
  }
  if (u === "kPa" || u === "bar") {
    return { valueText: v.toFixed(1), unitText: u };
  }
  if (u === "kg/h") {
    return { valueText: v.toFixed(1), unitText: "kg/h" };
  }
  if (u === "ratio") {
    return { valueText: v.toFixed(2), unitText: "" };
  }
  return { valueText: v.toFixed(2), unitText: u };
}
