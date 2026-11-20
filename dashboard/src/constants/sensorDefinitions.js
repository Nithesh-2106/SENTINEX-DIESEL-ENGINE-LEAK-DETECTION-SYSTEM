/**
 * Single source of truth for all 42 live-stream sensor definitions.
 * Used by: sensor panels, engine-part tooltips, sensor dots, GNN nodes, RCA, chat.
 */

export const COMPONENT_META = {
  AIR_FILTER: {
    displayName: "Air Filter",
    airPathOrder: 1,
    leakScenarios: ["Intake_PreTurbo", "Minor_Intake_Leak"],
  },
  TURBOCHARGER: {
    displayName: "Turbocharger",
    airPathOrder: 2,
    leakScenarios: ["Intake_PreTurbo", "Exhaust_PostTurbine"],
  },
  CAC: {
    displayName: "Charge Air Cooler",
    airPathOrder: 3,
    leakScenarios: ["Intake_PostTurbo_CAC", "CAC_Direct_Leak"],
  },
  ENGINE_BLOCK: {
    displayName: "Engine Block",
    airPathOrder: 4,
    leakScenarios: ["Exhaust_PreTurbine"],
  },
  EGR_COOLER: {
    displayName: "EGR Cooler",
    airPathOrder: 5,
    leakScenarios: ["EGR_Leak"],
  },
  DPF_DOC: {
    displayName: "DPF / DOC",
    airPathOrder: 6,
    leakScenarios: ["Exhaust_PostTurbine"],
  },
  SCR: {
    displayName: "SCR",
    airPathOrder: 7,
    leakScenarios: [],
  },
  EXHAUST_OUT: {
    displayName: "Exhaust Out",
    airPathOrder: 8,
    leakScenarios: [],
  },
};

/** @type {Record<string, SensorDef>} */
export const SENSOR_DEFINITIONS = {
  Engine_Speed_Setpoint_RPM: {
    shortLabel: "RPM SP", fullLabel: "Engine Speed Setpoint", unit: "RPM", baseline: 1800,
    component: "ENGINE_BLOCK",
    physicalDescription: "Operator-requested engine speed setpoint from the ECU.",
    localOffset: { x: -0.35, y: -0.25, z: 0.15 },
    gnnConnections: ["Engine_Speed_Actual_RPM"],
  },
  Engine_Load_Setpoint_Pct: {
    shortLabel: "Load SP", fullLabel: "Engine Load Setpoint", unit: "%", baseline: 75,
    component: "ENGINE_BLOCK",
    physicalDescription: "Operator-requested engine load setpoint.",
    localOffset: { x: 0.35, y: -0.25, z: 0.15 },
    gnnConnections: ["Engine_Load_Actual_Pct"],
  },
  Engine_Speed_Actual_RPM: {
    shortLabel: "RPM Act", fullLabel: "Engine Speed Actual", unit: "RPM", baseline: 1800,
    component: "ENGINE_BLOCK",
    physicalDescription: "Crankshaft speed measured at the flywheel housing.",
    localOffset: { x: -0.35, y: -0.25, z: -0.15 },
    gnnConnections: ["Engine_Speed_Setpoint_RPM", "Turbocharger_Speed_RPM", "Fuel_Flow_Rate_kgph"],
  },
  Engine_Load_Actual_Pct: {
    shortLabel: "Load", fullLabel: "Engine Load Actual", unit: "%", baseline: 75,
    component: "ENGINE_BLOCK",
    physicalDescription: "ECU-calculated engine load percentage.",
    localOffset: { x: 0, y: -0.35, z: 0 },
    gnnConnections: ["Engine_Load_Setpoint_Pct", "Fuel_Flow_Rate_kgph"],
  },
  Fuel_Flow_Rate_kgph: {
    shortLabel: "Fuel Flow", fullLabel: "Fuel Flow Rate", unit: "kg/h", baseline: 42,
    component: "ENGINE_BLOCK",
    physicalDescription: "Fuel metering on the common rail supply line.",
    localOffset: { x: -0.2, y: -0.3, z: 0 },
    gnnConnections: ["Engine_Speed_Actual_RPM", "Intake_Mass_Balance_Error_kgph"],
  },
  Engine_Coolant_Temp_C: {
    shortLabel: "Coolant T", fullLabel: "Engine Coolant Temperature", unit: "°C", baseline: 88,
    component: "ENGINE_BLOCK",
    physicalDescription: "Coolant temperature at the engine outlet gallery.",
    localOffset: { x: 0.2, y: -0.3, z: 0 },
    gnnConnections: ["Engine_Oil_Pressure_bar"],
  },
  Engine_Oil_Pressure_bar: {
    shortLabel: "Oil P", fullLabel: "Engine Oil Pressure", unit: "bar", baseline: 4.2,
    component: "ENGINE_BLOCK",
    physicalDescription: "Oil gallery pressure transducer on the block.",
    localOffset: { x: 0.1, y: -0.3, z: 0.1 },
    gnnConnections: ["Engine_Coolant_Temp_C"],
  },
  Ambient_Temp_C: {
    shortLabel: "Amb T", fullLabel: "Ambient Temperature", unit: "°C", baseline: 32,
    component: "AIR_FILTER",
    physicalDescription: "Ambient air temperature at the intake inlet.",
    localOffset: { x: -0.1, y: 0.15, z: 0.1 },
    gnnConnections: ["Ambient_Pressure_kPa"],
  },
  Ambient_Pressure_kPa: {
    shortLabel: "Amb P", fullLabel: "Ambient Pressure", unit: "kPa", baseline: 101.3,
    component: "AIR_FILTER",
    physicalDescription: "Barometric pressure reference at the intake inlet.",
    localOffset: { x: 0, y: 0.1, z: 0.1 },
    gnnConnections: ["Intake_Ambient_Pressure_kPa", "Ambient_Temp_C"],
  },
  Ambient_Humidity_Pct: {
    shortLabel: "Amb Hum", fullLabel: "Ambient Humidity", unit: "%", baseline: 68,
    component: "AIR_FILTER",
    physicalDescription: "Relative humidity at the intake inlet.",
    localOffset: { x: -0.2, y: 0.1, z: 0.1 },
    gnnConnections: ["Ambient_Pressure_kPa"],
  },
  Intake_Ambient_Pressure_kPa: {
    shortLabel: "Int Amb P", fullLabel: "Intake Ambient Pressure", unit: "kPa", baseline: 101.3,
    component: "AIR_FILTER",
    physicalDescription: "Pressure at the air filter housing inlet.",
    localOffset: { x: 0, y: 0.1, z: 0.1 },
    gnnConnections: ["MAF_Sensor_Reading_kgph"],
  },
  MAF_Sensor_Reading_kgph: {
    shortLabel: "MAF", fullLabel: "Mass Air Flow", unit: "kg/h", baseline: 720,
    component: "AIR_FILTER",
    physicalDescription: "Hot-wire mass airflow sensor inside the intake duct.",
    localOffset: { x: 0.4, y: 0.05, z: 0 },
    gnnConnections: ["Pre_Compressor_Pressure_kPa", "Intake_Mass_Balance_Error_kgph"],
  },
  Pre_Compressor_Pressure_kPa: {
    shortLabel: "Pre-Comp P", fullLabel: "Pre-Compressor Pressure", unit: "kPa", baseline: 99.5,
    component: "AIR_FILTER",
    physicalDescription: "Intake air pressure at the air filter outlet, before the turbo compressor.",
    localOffset: { x: 0.8, y: 0, z: 0 },
    gnnConnections: ["Post_Compressor_Pressure_kPa", "MAF_Sensor_Reading_kgph"],
  },
  Pre_Compressor_Temp_C: {
    shortLabel: "Pre-Comp T", fullLabel: "Pre-Compressor Temperature", unit: "°C", baseline: 38,
    component: "TURBOCHARGER",
    physicalDescription: "Charge air temperature at the compressor inlet.",
    localOffset: { x: -0.3, y: 0.1, z: 0 },
    gnnConnections: ["Post_Compressor_Temp_C"],
  },
  Post_Compressor_Pressure_kPa: {
    shortLabel: "Post-Comp P", fullLabel: "Post-Compressor Pressure", unit: "kPa", baseline: 218,
    component: "TURBOCHARGER",
    physicalDescription: "Compressed air pressure leaving the turbocharger compressor.",
    localOffset: { x: 0.2, y: 0.2, z: 0 },
    gnnConnections: ["Pre_Compressor_Pressure_kPa", "CAC_Pressure_Drop_kPa", "Boost_Pressure_kPa"],
  },
  Post_Compressor_Temp_C: {
    shortLabel: "Post-Comp T", fullLabel: "Post-Compressor Temperature", unit: "°C", baseline: 167.9,
    component: "TURBOCHARGER",
    physicalDescription: "Charge air temperature after compression.",
    localOffset: { x: 0.2, y: 0.25, z: 0.1 },
    gnnConnections: ["Intake_Temp_Rise_Across_CAC_C"],
  },
  Post_CAC_Pressure_kPa: {
    shortLabel: "Post-CAC P", fullLabel: "Post-CAC Pressure", unit: "kPa", baseline: 213,
    component: "CAC",
    physicalDescription: "Pressure at the charge air cooler outlet.",
    localOffset: { x: -0.3, y: 0.1, z: 0 },
    gnnConnections: ["CAC_Pressure_Drop_kPa", "Boost_Pressure_kPa"],
  },
  Post_CAC_Temp_C: {
    shortLabel: "Post-CAC T", fullLabel: "Post-CAC Temperature", unit: "°C", baseline: 52,
    component: "CAC",
    physicalDescription: "Charge air temperature after the CAC core.",
    localOffset: { x: 0, y: 0.15, z: 0.1 },
    gnnConnections: ["Intake_Temp_Rise_Across_CAC_C"],
  },
  Intake_Manifold_Pressure_kPa: {
    shortLabel: "Int Man P", fullLabel: "Intake Manifold Pressure", unit: "kPa", baseline: 211,
    component: "ENGINE_BLOCK",
    physicalDescription: "Charge air pressure in the intake manifold — final downstream effect of intake leaks.",
    localOffset: { x: -0.2, y: 0.4, z: 0.1 },
    gnnConnections: ["Boost_Pressure_kPa", "EGR_Flow_Rate_kgph"],
  },
  Intake_Manifold_Temp_C: {
    shortLabel: "Int Man T", fullLabel: "Intake Manifold Temperature", unit: "°C", baseline: 55,
    component: "ENGINE_BLOCK",
    physicalDescription: "Charge air temperature in the intake manifold.",
    localOffset: { x: -0.1, y: 0.4, z: 0.2 },
    gnnConnections: ["Intake_Manifold_Pressure_kPa"],
  },
  Turbocharger_Speed_RPM: {
    shortLabel: "Turbo RPM", fullLabel: "Turbocharger Speed", unit: "RPM", baseline: 92000,
    component: "TURBOCHARGER",
    physicalDescription: "Rotational speed of the turbocharger shaft — key disambiguation sensor.",
    localOffset: { x: 0, y: 0, z: 0 },
    gnnConnections: ["Pre_Compressor_Pressure_kPa", "Post_Compressor_Pressure_kPa", "Pre_Turbine_Pressure_kPa"],
  },
  Boost_Pressure_kPa: {
    shortLabel: "Boost P", fullLabel: "Boost Pressure", unit: "kPa", baseline: 116.7,
    component: "CAC",
    physicalDescription: "Gauge boost pressure above atmospheric at the intake manifold inlet.",
    localOffset: { x: -0.4, y: 0, z: 0 },
    gnnConnections: ["CAC_Pressure_Drop_kPa", "Intake_Manifold_Pressure_kPa"],
  },
  Exhaust_Manifold_Pressure_kPa: {
    shortLabel: "Exh Man P", fullLabel: "Exhaust Manifold Pressure", unit: "kPa", baseline: 230,
    component: "ENGINE_BLOCK",
    physicalDescription: "Exhaust gas pressure in the manifold before the turbine.",
    localOffset: { x: 0.3, y: 0.3, z: 0 },
    gnnConnections: ["Pre_Turbine_Pressure_kPa", "Exhaust_Manifold_Temp_C"],
  },
  Exhaust_Manifold_Temp_C: {
    shortLabel: "Exh Man T", fullLabel: "Exhaust Manifold Temperature", unit: "°C", baseline: 680,
    component: "ENGINE_BLOCK",
    physicalDescription: "Exhaust gas temperature in the manifold — rises on pre-turbine leaks.",
    localOffset: { x: 0.3, y: 0.2, z: 0.1 },
    gnnConnections: ["Exhaust_Manifold_Pressure_kPa", "Pre_Turbine_Temp_C"],
  },
  Pre_Turbine_Pressure_kPa: {
    shortLabel: "Pre-Turb P", fullLabel: "Pre-Turbine Pressure", unit: "kPa", baseline: 225,
    component: "TURBOCHARGER",
    physicalDescription: "Exhaust pressure at the turbine inlet.",
    localOffset: { x: 0.1, y: -0.2, z: 0.2 },
    gnnConnections: ["Post_Turbine_Pressure_kPa", "Exhaust_Manifold_Pressure_kPa"],
  },
  Pre_Turbine_Temp_C: {
    shortLabel: "Pre-Turb T", fullLabel: "Pre-Turbine Temperature", unit: "°C", baseline: 670,
    component: "TURBOCHARGER",
    physicalDescription: "Exhaust gas temperature at the turbine inlet.",
    localOffset: { x: 0.2, y: -0.1, z: 0.2 },
    gnnConnections: ["Pre_Turbine_Pressure_kPa"],
  },
  Post_Turbine_Pressure_kPa: {
    shortLabel: "Post-Turb P", fullLabel: "Post-Turbine Pressure", unit: "kPa", baseline: 112,
    component: "DPF_DOC",
    physicalDescription: "Exhaust pressure downstream of the turbine.",
    localOffset: { x: -0.3, y: 0.1, z: 0 },
    gnnConnections: ["Pre_Turbine_Pressure_kPa", "DPF_Delta_Pressure_kPa"],
  },
  Post_Turbine_Temp_C: {
    shortLabel: "Post-Turb T", fullLabel: "Post-Turbine Temperature", unit: "°C", baseline: 480.2,
    component: "DPF_DOC",
    physicalDescription: "Exhaust temperature after the turbine.",
    localOffset: { x: -0.2, y: 0.2, z: 0 },
    gnnConnections: ["Post_Turbine_Pressure_kPa"],
  },
  Post_DOC_Pressure_kPa: {
    shortLabel: "Post-DOC P", fullLabel: "Post-DOC Pressure", unit: "kPa", baseline: 109.5,
    component: "DPF_DOC",
    physicalDescription: "Exhaust pressure downstream of the diesel oxidation catalyst.",
    localOffset: { x: -0.1, y: 0.15, z: 0.05 },
    gnnConnections: ["Post_Turbine_Pressure_kPa", "DPF_Delta_Pressure_kPa"],
  },
  Post_DOC_Temp_C: {
    shortLabel: "Post-DOC T", fullLabel: "Post-DOC Temperature", unit: "°C", baseline: 490,
    component: "DPF_DOC",
    physicalDescription: "Exhaust temperature after the DOC.",
    localOffset: { x: 0.1, y: 0.2, z: 0 },
    gnnConnections: ["Post_DOC_Pressure_kPa"],
  },
  Post_DPF_Pressure_kPa: {
    shortLabel: "Post-DPF P", fullLabel: "Post-DPF Pressure", unit: "kPa", baseline: 106,
    component: "DPF_DOC",
    physicalDescription: "Exhaust pressure downstream of the DPF.",
    localOffset: { x: 0.2, y: 0.1, z: 0 },
    gnnConnections: ["Post_DOC_Pressure_kPa", "Post_SCR_Pressure_kPa"],
  },
  Post_DPF_Temp_C: {
    shortLabel: "Post-DPF T", fullLabel: "Post-DPF Temperature", unit: "°C", baseline: 469.9,
    component: "DPF_DOC",
    physicalDescription: "Exhaust temperature after the DPF.",
    localOffset: { x: 0.2, y: 0.2, z: 0 },
    gnnConnections: ["Post_DPF_Pressure_kPa"],
  },
  Post_SCR_Pressure_kPa: {
    shortLabel: "SCR P", fullLabel: "Post-SCR Pressure", unit: "kPa", baseline: 103.5,
    component: "SCR",
    physicalDescription: "Exhaust pressure at the SCR outlet.",
    localOffset: { x: 0, y: 0.1, z: 0 },
    gnnConnections: ["Post_DPF_Pressure_kPa", "Tailpipe_BackPressure_kPa"],
  },
  Post_SCR_Temp_C: {
    shortLabel: "SCR T", fullLabel: "Post-SCR Temperature", unit: "°C", baseline: 420.1,
    component: "SCR",
    physicalDescription: "Exhaust temperature at the SCR outlet.",
    localOffset: { x: 0, y: 0.15, z: 0.1 },
    gnnConnections: ["Post_SCR_Pressure_kPa"],
  },
  Tailpipe_BackPressure_kPa: {
    shortLabel: "Backpressure", fullLabel: "Tailpipe Backpressure", unit: "kPa", baseline: 102,
    component: "EXHAUST_OUT",
    physicalDescription: "Backpressure at the tailpipe exit.",
    localOffset: { x: 0, y: 0.1, z: 0 },
    gnnConnections: ["Post_SCR_Pressure_kPa"],
  },
  EGR_Flow_Rate_kgph: {
    shortLabel: "EGR Flow", fullLabel: "EGR Mass Flow Rate", unit: "kg/h", baseline: 58,
    component: "EGR_COOLER",
    physicalDescription: "Recirculated exhaust gas mass flow — drops during EGR circuit leaks.",
    localOffset: { x: 0, y: 0.2, z: -0.2 },
    gnnConnections: ["Intake_Manifold_Pressure_kPa", "Exhaust_Manifold_Pressure_kPa"],
  },
  Intake_Mass_Balance_Error_kgph: {
    shortLabel: "Δ Mass", fullLabel: "Intake Mass Balance Error", unit: "kg/h", baseline: 7.4,
    component: "ENGINE_BLOCK",
    physicalDescription: "Derived residual between measured intake mass and fuel flow.",
    localOffset: { x: -0.45, y: 0.35, z: -0.2 },
    gnnConnections: ["MAF_Sensor_Reading_kgph", "Fuel_Flow_Rate_kgph"],
  },
  Compressor_Pressure_Ratio: {
    shortLabel: "Comp Ratio", fullLabel: "Compressor Pressure Ratio", unit: "", baseline: 2.19,
    component: "TURBOCHARGER",
    physicalDescription: "Derived ratio of compressor outlet to inlet pressure.",
    localOffset: { x: 0.1, y: 0.1, z: -0.1 },
    gnnConnections: ["Pre_Compressor_Pressure_kPa", "Post_Compressor_Pressure_kPa"],
  },
  Turbine_Expansion_Ratio: {
    shortLabel: "Turb Exp", fullLabel: "Turbine Expansion Ratio", unit: "", baseline: 2.01,
    component: "TURBOCHARGER",
    physicalDescription: "Derived ratio across the turbine stage.",
    localOffset: { x: 0.1, y: -0.1, z: -0.1 },
    gnnConnections: ["Pre_Turbine_Pressure_kPa", "Post_Turbine_Pressure_kPa"],
  },
  CAC_Pressure_Drop_kPa: {
    shortLabel: "CAC ΔP", fullLabel: "Charge Air Cooler Pressure Drop", unit: "kPa", baseline: 5,
    component: "CAC",
    physicalDescription: "Pressure difference across the CAC — spikes on CAC leaks.",
    localOffset: { x: 0, y: 0.3, z: 0 },
    gnnConnections: ["Post_Compressor_Pressure_kPa", "Post_CAC_Pressure_kPa", "Boost_Pressure_kPa"],
  },
  DPF_Delta_Pressure_kPa: {
    shortLabel: "DPF ΔP", fullLabel: "DPF Delta Pressure", unit: "kPa", baseline: 3.5,
    component: "DPF_DOC",
    physicalDescription: "Differential pressure across the diesel particulate filter.",
    localOffset: { x: 0, y: 0.2, z: 0 },
    gnnConnections: ["Post_DOC_Pressure_kPa", "Post_DPF_Pressure_kPa"],
  },
  Intake_Temp_Rise_Across_CAC_C: {
    shortLabel: "CAC ΔT", fullLabel: "Intake Temp Rise Across CAC", unit: "°C", baseline: -116,
    component: "CAC",
    physicalDescription: "Derived temperature change across the charge air cooler core.",
    localOffset: { x: 0, y: 0.25, z: 0.1 },
    gnnConnections: ["Post_Compressor_Temp_C", "Post_CAC_Temp_C"],
  },
};

/** Build component → sensor list from definitions */
export function buildComponentSensorMap() {
  const map = {};
  for (const [key, def] of Object.entries(SENSOR_DEFINITIONS)) {
    const comp = def.component;
    if (!map[comp]) {
      const meta = COMPONENT_META[comp];
      map[comp] = {
        displayName: meta.displayName,
        airPathOrder: meta.airPathOrder,
        leakScenarios: meta.leakScenarios,
        sensors: [],
      };
    }
    map[comp].sensors.push({
      key,
      label: def.shortLabel,
      baseline: def.baseline,
      unit: def.unit,
    });
  }
  return map;
}

export const COMPONENT_SENSOR_MAP = buildComponentSensorMap();

export const AIR_PATH_SEQUENCE = [
  "AIR_FILTER", "TURBOCHARGER", "CAC", "ENGINE_BLOCK",
  "EGR_COOLER", "DPF_DOC", "SCR", "EXHAUST_OUT",
];

export const LEAK_ORIGIN_COMPONENT = {
  Intake_PreTurbo: "AIR_FILTER",
  Intake_PostTurbo_CAC: "CAC",
  Exhaust_PreTurbine: "ENGINE_BLOCK",
  Exhaust_PostTurbine: "DPF_DOC",
  EGR_Leak: "EGR_COOLER",
  CAC_Direct_Leak: "CAC",
  Minor_Intake_Leak: "AIR_FILTER",
  Normal: null,
};

export const ZONE_TO_COMPONENT = {
  zone_airfilter: "AIR_FILTER",
  zone_turbo: "TURBOCHARGER",
  zone_cac: "CAC",
  zone_block: "ENGINE_BLOCK",
  zone_egr: "EGR_COOLER",
  zone_aftertreat: "DPF_DOC",
  zone_scr: "SCR",
  zone_exhaust: "EXHAUST_OUT",
};

export const ALL_SENSOR_KEYS = Object.keys(SENSOR_DEFINITIONS);

export function getSensorDef(key) {
  return SENSOR_DEFINITIONS[key] ?? null;
}

export function getBaseline(key, dynamicBaselines) {
  if (dynamicBaselines?.[key] != null) return dynamicBaselines[key];
  return SENSOR_DEFINITIONS[key]?.baseline ?? null;
}

export function deviationColour(value, baseline) {
  if (value == null || Number.isNaN(Number(value))) return "#555555";
  if (baseline == null || baseline === 0) return "#555555";
  const pct = Math.abs(((Number(value) - baseline) / Math.abs(baseline)) * 100);
  if (pct < 2) return "#1D9E75";
  if (pct <= 8) return "#EF9F27";
  return "#E24B4A";
}

export function signedDeviationPct(value, baseline) {
  if (value == null || baseline == null || baseline === 0) return null;
  return ((Number(value) - baseline) / Math.abs(baseline)) * 100;
}

/** Cross-component GNN edges (subtle system connections) */
export const GNN_CROSS_EDGES = [
  ["Pre_Compressor_Pressure_kPa", "Post_Compressor_Pressure_kPa"],
  ["Post_Compressor_Pressure_kPa", "CAC_Pressure_Drop_kPa"],
  ["CAC_Pressure_Drop_kPa", "Boost_Pressure_kPa"],
  ["EGR_Flow_Rate_kgph", "Intake_Manifold_Pressure_kPa"],
  ["Exhaust_Manifold_Pressure_kPa", "Pre_Turbine_Pressure_kPa"],
  ["Post_Turbine_Pressure_kPa", "Post_DPF_Pressure_kPa"],
];
