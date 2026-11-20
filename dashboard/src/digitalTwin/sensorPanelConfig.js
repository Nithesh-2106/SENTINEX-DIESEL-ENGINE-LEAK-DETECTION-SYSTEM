/**
 * SENSORS mode panel layout — safe-area positioning that avoids zoom controls & edges.
 */
import {
  COMPONENT_SENSOR_MAP,
  deviationColour,
  signedDeviationPct,
} from "../constants/sensorDefinitions.js";

export { deviationColour, signedDeviationPct };

export const COMPONENT_COLOURS = {
  AIR_FILTER: "#1D9E75",
  TURBOCHARGER: "#534AB7",
  CAC: "#378ADD",
  ENGINE_BLOCK: "#E24B4A",
  EGR_COOLER: "#BA7517",
  DPF_DOC: "#639922",
  SCR: "#185FA5",
  EXHAUST_OUT: "#5F5E5A",
};

/** Max sensors shown per panel card (keeps cards compact) */
export const PANEL_PRIMARY_SENSORS = {
  AIR_FILTER: ["MAF_Sensor_Reading_kgph", "Pre_Compressor_Pressure_kPa", "Ambient_Pressure_kPa", "Ambient_Temp_C"],
  TURBOCHARGER: ["Turbocharger_Speed_RPM", "Post_Compressor_Pressure_kPa", "Pre_Turbine_Pressure_kPa", "Compressor_Pressure_Ratio"],
  CAC: ["CAC_Pressure_Drop_kPa", "Post_CAC_Pressure_kPa", "Boost_Pressure_kPa"],
  ENGINE_BLOCK: ["Intake_Manifold_Pressure_kPa", "Exhaust_Manifold_Temp_C", "Exhaust_Manifold_Pressure_kPa", "Engine_Speed_Actual_RPM"],
  EGR_COOLER: ["EGR_Flow_Rate_kgph"],
  DPF_DOC: ["Post_Turbine_Pressure_kPa", "DPF_Delta_Pressure_kPa", "Post_Turbine_Temp_C"],
  SCR: ["Post_SCR_Pressure_kPa", "Post_SCR_Temp_C"],
  EXHAUST_OUT: ["Tailpipe_BackPressure_kPa"],
};

const SAFE = {
  top: 78,
  bottom: 248,
  left: 10,
  right: 92,
};

/** Compute panel positions from container size — stacks in safe columns */
export function computePanelLayout(containerWidth, containerHeight) {
  const pw = Math.min(158, Math.floor(containerWidth * 0.12));
  const ph = Math.min(200, Math.floor(containerHeight * 0.26));
  const gap = 6;
  const leftX = SAFE.left;
  const rightX = containerWidth - pw - SAFE.right;
  const centerX = Math.floor((containerWidth - pw) / 2);
  const topY = SAFE.top;
  const midY = Math.floor(containerHeight * 0.42);
  const lowY = containerHeight - SAFE.bottom - ph;
  const bottomY = containerHeight - 40 - ph;

  return {
    panelWidth: pw,
    panelMaxHeight: ph,
    fontSize: 9,
    positions: {
      EGR_COOLER: { top: topY, left: leftX, zIndex: 310 },
      AIR_FILTER: { top: topY + ph + gap, left: leftX, zIndex: 310 },
      TURBOCHARGER: { top: topY, left: rightX, zIndex: 310 },
      DPF_DOC: { top: midY, left: rightX, zIndex: 310 },
      SCR: { top: midY + ph + gap, left: rightX, zIndex: 310 },
      EXHAUST_OUT: { top: bottomY, left: rightX, zIndex: 310 },
      CAC: { top: topY, left: centerX, zIndex: 300 },
      ENGINE_BLOCK: { top: lowY, left: centerX, zIndex: 300 },
    },
  };
}

/** @deprecated static fallback */
export const PANEL_POSITIONS = {
  EGR_COOLER: { top: "78px", left: "10px", zIndex: 310 },
  AIR_FILTER: { top: "214px", left: "10px", zIndex: 310 },
  CAC: { top: "78px", left: "50%", transform: "translateX(-50%)", zIndex: 300 },
  ENGINE_BLOCK: { bottom: "248px", left: "50%", transform: "translateX(-50%)", zIndex: 300 },
  TURBOCHARGER: { top: "78px", right: "92px", zIndex: 310 },
  DPF_DOC: { top: "42%", right: "92px", zIndex: 310 },
  SCR: { top: "58%", right: "92px", zIndex: 310 },
  EXHAUST_OUT: { bottom: "40px", right: "92px", zIndex: 310 },
};

export const PANEL_ORDER = [
  "AIR_FILTER", "TURBOCHARGER", "CAC", "ENGINE_BLOCK",
  "EGR_COOLER", "DPF_DOC", "SCR", "EXHAUST_OUT",
];

export function buildPanelSensorGroups() {
  const groups = {};
  for (const [key, comp] of Object.entries(COMPONENT_SENSOR_MAP)) {
    const sensors = comp.sensors.map((s) => ({
      key: s.key,
      shortLabel: s.label,
      fullLabel: s.label,
      unit: s.unit,
      baseline: s.baseline,
    }));
    groups[key] = { displayName: comp.displayName, sensors };
  }
  return groups;
}

export const PANEL_SENSOR_GROUPS = buildPanelSensorGroups();

export function computePanelDimensions(containerWidth, containerHeight) {
  const layout = computePanelLayout(containerWidth, containerHeight);
  return {
    maxWidth: layout.panelWidth,
    maxHeight: layout.panelMaxHeight,
    fontSize: layout.fontSize,
    positions: layout.positions,
  };
}

export function nearestPanelEdgeRay(panelRect, anchorX, anchorY, containerRect) {
  const left = panelRect.left - containerRect.left;
  const top = panelRect.top - containerRect.top;
  const right = left + panelRect.width;
  const bottom = top + panelRect.height;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const hw = panelRect.width / 2;
  const hh = panelRect.height / 2;
  const angle = Math.atan2(anchorY - cy, anchorX - cx);
  const tx = Math.cos(angle);
  const ty = Math.sin(angle);
  const tX = hw / (Math.abs(tx) || 1e-6);
  const tY = hh / (Math.abs(ty) || 1e-6);
  const t = Math.min(tX, tY);
  return { x: cx + tx * t, y: cy + ty * t };
}

export function nearestPanelEdge(panelRect, anchorX, anchorY, containerRect) {
  return nearestPanelEdgeRay(panelRect, anchorX, anchorY, containerRect);
}
