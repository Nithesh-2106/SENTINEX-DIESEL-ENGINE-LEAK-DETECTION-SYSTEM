/**
 * rootCauseEngine.js — physics-accurate Root Cause Analysis engine.
 * Mirrors src/root_cause_analyzer.py for frontend / chatbot use.
 */

const RCA_KNOWLEDGE_BASE = {
  Intake_PreTurbo: [
    {
      id: "loose_vclamp_inlet",
      label: "Loose V-clamp at turbo inlet",
      baseProbability: 0.60,
      physicalReasoning:
        "Proportional pressure drop with no temperature rise indicates a mechanical gap at a connection point, not a thermal crack",
      inspectAction: "Check V-clamp torque at turbocharger air inlet",
      tool: "Torque wrench — 25 Nm",
      visualSign: "Look for air hiss sound, oil mist around clamp",
    },
    {
      id: "cracked_intake_pipe",
      label: "Cracked intake pipe near bend",
      baseProbability: 0.25,
      physicalReasoning:
        "Hairline cracks develop at pipe bends under heat cycling — unlikely without a temperature rise signature",
      inspectAction: "Visual inspection of all pipe bends, dye penetrant test",
      tool: "Dye penetrant kit",
      visualSign: "Hairline cracks, discolouration near bend apex",
    },
    {
      id: "failed_rubber_boot",
      label: "Failed rubber boot or connector",
      baseProbability: 0.15,
      physicalReasoning:
        "Aged rubber loses elasticity and develops micro-gaps — consistent with mechanical gap and no thermal signature",
      inspectAction: "Squeeze-test all rubber boot sections in intake path",
      tool: "None — manual inspection",
      visualSign: "Surface cracking, hardening, visible gap at bead",
    },
  ],

  Intake_PostTurbo_CAC: [
    {
      id: "cac_end_tank_crack",
      label: "CAC end tank crack",
      baseProbability: 0.50,
      physicalReasoning:
        "Large CAC pressure drop with boost drop indicates pressurised charge air escaping at the CAC housing",
      inspectAction: "Pressure test CAC assembly at 200 kPa, look for coolant mixing in intake",
      tool: "Pressure test kit — 200 kPa",
      visualSign: "Coolant smell in intake air, air bubbles in coolant reservoir",
    },
    {
      id: "loose_cac_outlet_clamp",
      label: "Loose CAC outlet hose clamp",
      baseProbability: 0.35,
      physicalReasoning:
        "Moderate pressure drop at CAC outlet suggests a partial seal failure at the hose-to-manifold connection",
      inspectAction: "Torque check on CAC outlet hose clamp, inspect hose bead seating",
      tool: "Torque wrench — 10 Nm",
      visualSign: "Hose slightly off-centre on pipe bead",
    },
    {
      id: "cac_internal_tube_failure",
      label: "CAC internal tube failure",
      baseProbability: 0.15,
      physicalReasoning:
        "Internal tube fracture allows charge air to mix with coolant inside the core",
      inspectAction: "Borescope inspection of CAC internal tubes, check coolant for exhaust contamination",
      tool: "Borescope",
      visualSign: "Coolant discolouration, milky residue in intake",
    },
  ],

  Exhaust_PreTurbine: [
    {
      id: "blown_exhaust_gasket",
      label: "Blown exhaust manifold gasket",
      baseProbability: 0.55,
      physicalReasoning:
        "Pressure drop WITH temperature rise means hot combustion gas is escaping before reaching the turbine",
      inspectAction: "Inspect gasket face between cylinder head and exhaust manifold on all cylinders",
      tool: "Feeler gauge, UV dye if needed",
      visualSign: "Carbon deposits around gasket edge, uneven surface contact",
    },
    {
      id: "cracked_exhaust_manifold",
      label: "Cracked exhaust manifold",
      baseProbability: 0.30,
      physicalReasoning:
        "Thermal cycling causes cracks — often localised to one cylinder with uneven temperature distribution",
      inspectAction: "Thermal camera scan across entire manifold surface, dye penetrant on suspect areas",
      tool: "Thermal camera, dye penetrant kit",
      visualSign: "Hot spot on thermal image, carbon streak along crack line",
    },
    {
      id: "loose_manifold_bolt",
      label: "Loose exhaust manifold bolt",
      baseProbability: 0.15,
      physicalReasoning:
        "Bolt loosening creates a gap that opens and closes with thermal expansion",
      inspectAction: "Torque all exhaust manifold bolts to specification",
      tool: "Torque wrench — 45 Nm",
      visualSign: "Carbon soot track around loose bolt, slight manifold movement",
    },
  ],

  Exhaust_PostTurbine: [
    {
      id: "cracked_flex_pipe",
      label: "Cracked flex pipe or bellows after turbine",
      baseProbability: 0.45,
      physicalReasoning:
        "Post-turbine pressure drop with temperature drop indicates expanding gas cooling as it escapes through a crack",
      inspectAction: "Apply soapy water along entire flex pipe and bellows section while engine runs",
      tool: "Soapy water spray bottle",
      visualSign: "Bubbling at crack, slight soot downstream of leak point",
    },
    {
      id: "failed_turbo_outlet_gasket",
      label: "Failed turbo outlet gasket",
      baseProbability: 0.40,
      physicalReasoning:
        "Gasket failure at turbine housing to downpipe flange face is a common wear point on high-cycle engines",
      inspectAction: "Retorque turbine outlet flange bolts, inspect gasket condition",
      tool: "Torque wrench — 35 Nm",
      visualSign: "Carbon ring around flange face, soot deposits on housing",
    },
    {
      id: "loose_vband_turbine_outlet",
      label: "Loose V-band clamp at turbine outlet",
      baseProbability: 0.15,
      physicalReasoning:
        "V-band clamps can back off from vibration — typical of minor post-turbine deviations",
      inspectAction: "Inspect and retorque V-band clamp at turbine outlet",
      tool: "Torque wrench — 20 Nm",
      visualSign: "Clamp slightly rotated from original position",
    },
  ],

  EGR_Leak: [
    {
      id: "egr_pipe_gasket_failure",
      label: "Failed EGR pipe gasket or seal",
      baseProbability: 0.55,
      physicalReasoning:
        "EGR flow drop with rising mass balance error means recirculated exhaust is escaping before reaching intake manifold",
      inspectAction: "Apply soapy water along all EGR pipe joints and connections while engine runs",
      tool: "Soapy water spray bottle",
      visualSign: "Bubbling at joint, soot staining on EGR pipe exterior",
    },
    {
      id: "cracked_egr_cooler",
      label: "Cracked EGR cooler",
      baseProbability: 0.30,
      physicalReasoning:
        "EGR cooler cracks allow exhaust gas to mix with coolant — detectable by coolant temperature deviation",
      inspectAction: "Pressure test EGR cooler at 150 kPa, smell coolant reservoir for exhaust odour",
      tool: "Pressure test kit — 150 kPa",
      visualSign: "White smoke from coolant overflow, exhaust smell in coolant",
    },
    {
      id: "egr_valve_seating_issue",
      label: "EGR valve seating failure",
      baseProbability: 0.15,
      physicalReasoning:
        "Valve seat wear or carbon buildup causes intermittent flow rather than steady reduction",
      inspectAction: "Check EGR valve position sensor feedback, inspect valve seat for carbon deposits",
      tool: "Diagnostic scanner for valve position",
      visualSign: "Erratic EGR flow readings, carbon deposits on valve face",
    },
  ],

  CAC_Direct_Leak: [
    {
      id: "cac_core_tube_fracture",
      label: "CAC core tube fracture",
      baseProbability: 0.50,
      physicalReasoning:
        "CAC pressure drop jumping dramatically means charge air is bypassing across the CAC core — internal tube fracture",
      inspectAction: "Pressure test CAC at 250 kPa, look for air bubbles in coolant circuit",
      tool: "Pressure test kit — 250 kPa",
      visualSign: "Air bubbles in coolant reservoir, unusual coolant loss",
    },
    {
      id: "cac_end_tank_weld_crack",
      label: "CAC end tank weld crack",
      baseProbability: 0.35,
      physicalReasoning:
        "Weld seams on aluminium end tanks are fatigue failure points under pressure cycling",
      inspectAction: "Inspect all weld seams on both CAC end tanks, dye penetrant on seams",
      tool: "Dye penetrant kit",
      visualSign: "Fine crack along weld line, slight coolant seep at weld",
    },
    {
      id: "loose_cac_inlet_connection",
      label: "Loose CAC inlet connection",
      baseProbability: 0.15,
      physicalReasoning:
        "Partially recovers under light load — connection gap opens and closes with pressure differential changes",
      inspectAction: "Inspect CAC inlet hose clamp torque and hose seating",
      tool: "Torque wrench — 10 Nm",
      visualSign: "Hose movement under load, slight hiss from inlet",
    },
  ],

  Minor_Intake_Leak: [
    {
      id: "distributed_clamp_looseness",
      label: "Multiple loose clamps (distributed)",
      baseProbability: 0.45,
      physicalReasoning:
        "Small uniform drops across ALL intake sensors with no single dominant sensor means systemic small gaps at multiple clamp points",
      inspectAction: "Walk the entire intake path from airbox to intake manifold, check every clamp and connection sequentially",
      tool: "Torque wrench — check spec per clamp",
      visualSign: "No single obvious point — listen for multiple small hiss sounds",
    },
    {
      id: "aged_rubber_intake_ducting",
      label: "Aged or hardened rubber intake ducting",
      baseProbability: 0.35,
      physicalReasoning:
        "Rubber intake sections harden over time, developing multiple micro-gaps along their length",
      inspectAction: "Squeeze test every rubber intake section — stiff sections need replacement",
      tool: "None — manual squeeze test",
      visualSign: "Surface crazing, hairline cracks on bends, hardness when squeezed",
    },
    {
      id: "airbox_filter_housing_seal",
      label: "Airbox or filter housing seal degradation",
      baseProbability: 0.20,
      physicalReasoning:
        "If MAF reading diverges slightly from Intake_Ambient_P, air is entering after the MAF",
      inspectAction: "Inspect airbox lid gasket condition and filter housing seal",
      tool: "None — visual inspection",
      visualSign: "Compressed or missing gasket material, lid not fully sealed",
    },
  ],
};

const INTAKE_SCENARIOS = new Set([
  "Intake_PreTurbo",
  "Intake_PostTurbo_CAC",
  "Minor_Intake_Leak",
]);

/** Seven defined leak scenarios — novel anomaly must never fire for these. */
const KNOWN_LEAK_SCENARIOS = new Set([
  "Intake_PreTurbo",
  "Intake_PostTurbo_CAC",
  "Exhaust_PreTurbine",
  "Exhaust_PostTurbine",
  "EGR_Leak",
  "CAC_Direct_Leak",
  "Minor_Intake_Leak",
]);

const EXHAUST_TEMP_SENSORS = new Set([
  "Exhaust_Manifold_Temp_C",
  "Pre_Turbine_Temp_C",
  "Post_Turbine_Temp_C",
  "Exhaust_Manifold_Temp_Bank1_C",
  "Exhaust_Manifold_Temp_Bank2_C",
]);

const CASCADE_EXPLANATIONS = {
  Intake_PreTurbo:
    "Physical cascade: Gap in intake duct → atmospheric air escapes before entering compressor → less air mass reaches turbocharger inlet → Pre_Compressor_Pressure drops → turbocharger compressor has less air to compress → boost output drops proportionally → intake manifold receives less pressurised air → all downstream pressures and temperatures drop proportionally.",
  Intake_PostTurbo_CAC:
    "Physical cascade: Gap in charge-air path between compressor and intake manifold → pressurised air (2× ambient) escapes violently → CAC pressure differential spikes because less air exits the CAC than enters → boost pressure drops → intake manifold starved of pressurised charge → power output reduced. The pre-compressor side is unaffected.",
  Exhaust_PreTurbine:
    "Physical cascade: Gap in exhaust manifold or gasket → hot combustion gas (680°C) escapes before reaching turbine → exhaust manifold pressure drops → turbine receives less gas energy → turbine spins slower → compressor produces less boost → intake side pressures drop as secondary effect. Temperature RISES at leak point (opposite of intake leaks).",
  Exhaust_PostTurbine:
    "Physical cascade: Gap in exhaust pipe after turbine → exhaust gas expands through gap and COOLS (adiabatic expansion) → post-turbine pressure and temperature both drop. The turbocharger and entire engine intake/boost system is UNAFFECTED — this leak is on the outlet side only. Engine performance continues normally.",
  EGR_Leak:
    "Physical cascade: Gap in EGR circuit → recirculated exhaust gas escapes to atmosphere instead of reaching intake manifold → EGR flow rate drops → intake mass balance error increases → combustion runs slightly leaner → exhaust temperature rises marginally. Boost pressure system is largely unaffected since leak is in the recirculation path.",
  CAC_Direct_Leak:
    "Physical cascade: Internal CAC tube fractures → compressed charge air crosses from the high-pressure air side to the coolant side → CAC pressure drop rises dramatically → less pressurised air reaches intake manifold → boost drops → in severe cases, coolant contamination in intake can cause hydro-lock risk.",
  Minor_Intake_Leak:
    "Physical cascade: Multiple small gaps at connection points throughout the intake path → small amounts of air escape at each gap → cumulative effect creates uniform small pressure drop across all intake sensors → no single sensor shows dominant deviation because no single failure point exists.",
  Normal: null,
};

const _APPROX_BASELINES = {
  Pre_Compressor_Pressure_kPa: 99.5,
  Post_Compressor_Pressure_kPa: 218.0,
  Post_Compressor_Temp_C: 120.0,
  Post_CAC_Temp_C: 52.0,
  Exhaust_Manifold_Temp_C: 680.0,
  Exhaust_Manifold_Pressure_kPa: 230.0,
  Pre_Turbine_Temp_C: 650.0,
  Post_Turbine_Pressure_kPa: 108.0,
  Post_Turbine_Temp_C: 420.0,
  MAF_Sensor_Reading_kgph: 720.0,
  Turbocharger_Speed_RPM: 92000,
  EGR_Flow_Rate_kgph: 58.0,
  CAC_Pressure_Drop_kPa: 5.0,
  Boost_Pressure_kPa: 111.7,
  Post_CAC_Pressure_kPa: 213.0,
  Engine_Coolant_Temp_C: 89.0,
  EGR_Cooler_Outlet_Temp_C: 180.0,
};

const DISAMBIG_LABELS = {
  exhaust_temp_rise_during_intake_leak: "Exhaust temp rise during intake leak",
  no_thermal_signature_mechanical_gap_indicated: "No thermal signature — mechanical gap",
  turbo_amplification_confirms_pre_turbo_location: "Turbo amplification confirms pre-turbo",
  egr_cascade_consequence: "EGR reduction — expected consequence",
  egr_disproportionate_possible_secondary_failure: "EGR disproportionate — possible secondary fault",
  minor_severity_mechanical_connection_not_structural: "Minor severity — connection not crack",
  turbo_speed_stable_moderate_gap_indicated: "Stable turbo speed — moderate gap",
};

function _buildDeviationMap(top5Sensors) {
  const map = {};
  if (!Array.isArray(top5Sensors)) return map;
  for (const entry of top5Sensors) {
    if (entry?.sensor) map[entry.sensor] = entry.deviation_pct ?? 0;
  }
  return map;
}

function _getDeviation(sensorName, deviationMap, liveReadings) {
  if (sensorName in deviationMap) return deviationMap[sensorName];
  const actual = liveReadings?.[sensorName];
  const baseline = _APPROX_BASELINES[sensorName];
  if (actual == null || baseline == null || baseline === 0) return null;
  return ((actual - baseline) / Math.abs(baseline)) * 100;
}

function _cloneCauses(location) {
  const template = RCA_KNOWLEDGE_BASE[location];
  if (!template) return [];
  return template.map((cause) => ({
    ...cause,
    probability: cause.baseProbability,
    disambiguationReasons: [],
  }));
}

function _normalise(causes) {
  const total = causes.reduce((sum, c) => sum + c.probability, 0);
  if (total === 0) return causes;
  for (const c of causes) c.probability /= total;
  return causes;
}

function _dedupeDisambiguation(rules) {
  const seen = new Set();
  return rules.filter((rule) => {
    const label = typeof rule === "object" ? rule.label : rule;
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });
}

function _findSensor(shapTop5, sensorId) {
  return shapTop5.find((s) => s?.sensor === sensorId) ?? null;
}

export function buildCascadeExplanation(leakLocation, shapTop5) {
  return CASCADE_EXPLANATIONS[leakLocation] ?? null;
}

export function buildShapPatternSummary(leakLocation, shapTop5, liveReadings) {
  if (!Array.isArray(shapTop5) || shapTop5.length === 0) {
    return "Insufficient sensor data for pattern analysis.";
  }

  const sortedByDeviation = [...shapTop5].sort(
    (a, b) => Math.abs(b.deviation_pct ?? 0) - Math.abs(a.deviation_pct ?? 0)
  );
  const primary = sortedByDeviation[0];
  const secondary = sortedByDeviation[1];
  const primaryDir = (primary.deviation_pct ?? 0) < 0 ? "dropped" : "risen";
  const primaryAbs = Math.abs(primary.deviation_pct ?? 0).toFixed(1);

  switch (leakLocation) {
    case "Intake_PreTurbo": {
      const preComp = _findSensor(shapTop5, "Pre_Compressor_Pressure_kPa");
      const postComp = _findSensor(shapTop5, "Post_Compressor_Pressure_kPa");
      const postCompTemp = _findSensor(shapTop5, "Post_Compressor_Temp_C");
      if (preComp && postComp) {
        const amplification =
          Math.abs(postComp.deviation_pct) - Math.abs(preComp.deviation_pct);
        const tempNote =
          postCompTemp && postCompTemp.deviation_pct < 0
            ? ` Post-compressor temperature has also dropped ${Math.abs(postCompTemp.deviation_pct).toFixed(1)}% — less compression heat confirms reduced air mass entering the turbo.`
            : "";
        return (
          `Pre-compressor pressure has dropped ${Math.abs(preComp.deviation_pct).toFixed(1)}% ` +
          `(${preComp.your_value.toFixed(1)} vs baseline ${preComp.normal_baseline.toFixed(1)} kPa), ` +
          `with post-compressor pressure dropping a further ${Math.abs(postComp.deviation_pct).toFixed(1)}%. ` +
          `The ${amplification.toFixed(1)}% amplification across the turbocharger — where outlet pressure drops more than inlet — ` +
          `is the physical signature of a mechanical gap in the pre-turbo intake path. ` +
          `The turbocharger is operating correctly but receiving insufficient inlet air.${tempNote}`
        );
      }
      const sec = secondary
        ? `, with ${secondary.sensor.replace(/_/g, " ")} also deviating ${Math.abs(secondary.deviation_pct).toFixed(1)}%`
        : "";
      return `${primary.sensor.replace(/_/g, " ")} has ${primaryDir} ${primaryAbs}%${sec}. The pattern indicates reduced airflow in the pre-turbo intake path.`;
    }

    case "Intake_PostTurbo_CAC": {
      const cacDrop = _findSensor(shapTop5, "CAC_Pressure_Drop_kPa");
      const boostP = _findSensor(shapTop5, "Boost_Pressure_kPa");
      if (cacDrop) {
        const boostNote = boostP
          ? ` Boost pressure has dropped ${Math.abs(boostP.deviation_pct).toFixed(1)}%, confirming less pressurised air is reaching the engine.`
          : "";
        return (
          `CAC pressure drop has risen ${Math.abs(cacDrop.deviation_pct).toFixed(1)}% above normal ` +
          `(${cacDrop.your_value.toFixed(1)} vs baseline ${cacDrop.normal_baseline.toFixed(1)} kPa), ` +
          `indicating pressurised charge air is escaping between the turbocharger compressor outlet and the intake manifold.` +
          `${boostNote} The compressor inlet sensors are stable, confirming the leak is on the high-pressure charge-air side (post-compressor), not upstream.`
        );
      }
      return `Charge air pressure anomaly detected downstream of the turbocharger. ${primary.sensor.replace(/_/g, " ")} has deviated ${primaryAbs}%, suggesting a pressurised air leak on the charge-air path.`;
    }

    case "Exhaust_PreTurbine": {
      const exhManP = _findSensor(shapTop5, "Exhaust_Manifold_Pressure_kPa");
      const exhManT = _findSensor(shapTop5, "Exhaust_Manifold_Temp_C");
      if (exhManP && exhManT) {
        const tempDir = exhManT.deviation_pct > 0 ? "risen" : "dropped";
        return (
          `Exhaust manifold pressure has dropped ${Math.abs(exhManP.deviation_pct).toFixed(1)}% while manifold ` +
          `temperature has ${tempDir} ${Math.abs(exhManT.deviation_pct).toFixed(1)}%. This simultaneous pressure loss ` +
          `and temperature ${tempDir} is the definitive physical signature of an exhaust manifold leak — hot combustion ` +
          `gas is escaping before reaching the turbocharger turbine. The turbine is receiving less exhaust energy, ` +
          `explaining the reduction in boost pressure. This is unambiguously an exhaust-side leak, not an intake leak.`
        );
      }
      return `Exhaust manifold sensors show ${primaryAbs}% deviation in ${primary.sensor.replace(/_/g, " ")}. The pattern suggests exhaust gas escaping upstream of the turbocharger turbine.`;
    }

    case "Exhaust_PostTurbine": {
      const postTurbP = _findSensor(shapTop5, "Post_Turbine_Pressure_kPa");
      const postTurbT = _findSensor(shapTop5, "Post_Turbine_Temp_C");
      if (postTurbP && postTurbT) {
        return (
          `Post-turbine pressure has dropped ${Math.abs(postTurbP.deviation_pct).toFixed(1)}% and post-turbine temperature ` +
          `has dropped ${Math.abs(postTurbT.deviation_pct).toFixed(1)}%. The temperature DROP (not rise) distinguishes this ` +
          `from pre-turbine exhaust leaks — gas expanding through a post-turbine gap undergoes adiabatic cooling. ` +
          `Engine performance sensors (boost, manifold pressure, MAF) are normal, confirming this leak is on the exhaust outlet side and not affecting engine air supply.`
        );
      }
      return `Post-turbine sensors show ${primaryAbs}% deviation. The pattern indicates exhaust gas escaping downstream of the turbocharger, with engine performance largely unaffected.`;
    }

    case "EGR_Leak": {
      const egrFlow = _findSensor(shapTop5, "EGR_Flow_Rate_kgph");
      if (egrFlow) {
        return (
          `EGR flow rate has dropped ${Math.abs(egrFlow.deviation_pct).toFixed(1)}% ` +
          `(${egrFlow.your_value.toFixed(1)} vs baseline ${egrFlow.normal_baseline.toFixed(1)} kg/h). ` +
          `This EGR flow reduction is occurring independently of boost pressure — boost pressure sensors are relatively stable, ` +
          `confirming the EGR circuit itself is the source of the fault (not a cascade consequence of a boost-side leak). ` +
          `Recirculated exhaust gas is escaping somewhere between the exhaust manifold and the intake manifold.`
        );
      }
      return `EGR circuit sensors show significant deviation. ${primaryAbs}% drop in ${primary.sensor.replace(/_/g, " ")} indicates recirculated exhaust gas escaping the EGR circuit.`;
    }

    case "CAC_Direct_Leak": {
      const cacDrop = _findSensor(shapTop5, "CAC_Pressure_Drop_kPa");
      if (cacDrop) {
        return (
          `CAC internal pressure drop has risen dramatically from a normal ~5 kPa to ${cacDrop.your_value.toFixed(1)} kPa — ` +
          `a ${Math.abs(cacDrop.deviation_pct).toFixed(0)}% increase. This large internal pressure drop indicates charge air is crossing ` +
          `through the CAC core rather than flowing through it normally. An internal tube fracture creates a crossflow path from the ` +
          `hot charge-air side to the coolant side, causing this characteristic large delta-P spike. Unlike an external CAC connection failure, this is an internal structural failure of the core.`
        );
      }
      return "CAC internal pressure differential has risen dramatically, indicating an internal CAC core failure allowing charge air to bypass through the core structure.";
    }

    case "Minor_Intake_Leak": {
      const deviations = shapTop5.map((s) => s.deviation_pct ?? 0);
      const neg = deviations.filter((d) => d < 0);
      const meanDev = deviations.reduce((a, b) => a + b, 0) / deviations.length;
      const minNeg = neg.length ? Math.min(...neg) : 0;
      const maxNeg = neg.length ? Math.max(...neg) : 0;
      return (
        `All monitored intake path sensors show a uniform ${Math.abs(meanDev).toFixed(1)}% reduction with no single dominant sensor ` +
        `(ranging ${Math.abs(minNeg).toFixed(1)}% to ${Math.abs(maxNeg).toFixed(1)}%). This distributed pattern — where multiple sensors deviate equally ` +
        `rather than one sensor deviating dramatically — is the signature of air escaping at multiple small gaps along the intake path, rather than one large single-point failure.`
      );
    }

    default:
      return (
        `${primary.sensor.replace(/_/g, " ")} has ${primaryDir} ${primaryAbs}% from baseline. ` +
        `Additional sensors confirm anomalous readings across the monitored air path.`
      );
  }
}

export function computeRCA(predictionResponse, liveReadings) {
  const {
    Leak_Present,
    Leak_Location,
    Leak_Severity,
    top_5_sensors_driving_prediction,
  } = predictionResponse ?? {};

  const leakLocation = Leak_Location ?? "None";
  const severity = Leak_Severity ?? "None";

  if (!Leak_Present || leakLocation === "None") {
    return {
      leakLocation: "None",
      severity: "None",
      shapPatternSummary: "No leak detected. All sensor readings are within normal operating bounds.",
      cascadeExplanation: null,
      rankedCauses: [],
      disambiguationApplied: [],
      notes: [],
      timestamp: Date.now(),
    };
  }

  const deviationMap = _buildDeviationMap(top_5_sensors_driving_prediction);
  const causes = _cloneCauses(leakLocation);

  if (causes.length === 0) {
    const isNovelAnomaly =
      leakLocation !== "None" &&
      leakLocation !== "Normal" &&
      !KNOWN_LEAK_SCENARIOS.has(leakLocation);
    return {
      leakLocation,
      severity,
      shapPatternSummary: `Leak detected at ${leakLocation} — no knowledge base entry for this location.`,
      cascadeExplanation: buildCascadeExplanation(leakLocation, top_5_sensors_driving_prediction),
      rankedCauses: [],
      isNovelAnomaly,
      disambiguationApplied: [],
      notes: [],
      timestamp: Date.now(),
    };
  }

  const disambiguationApplied = [];
  const notes = [];

  const addInfo = (label, message) => {
    disambiguationApplied.push({ label, type: "info", message });
  };

  const addWarning = (label, message) => {
    disambiguationApplied.push({ label, type: "warning", message });
  };

  const shapTop5 = top_5_sensors_driving_prediction || [];

  // Rule 1 — intake temperature signature (exhaust sensors in SHAP top 5 only)
  if (INTAKE_SCENARIOS.has(leakLocation)) {
    const exhaustTempRising = shapTop5.some(
      (s) => EXHAUST_TEMP_SENSORS.has(s?.sensor) && (s.deviation_pct ?? 0) > 3
    );
    if (exhaustTempRising) {
      addWarning(
        "exhaust_temp_rise_during_intake_leak",
        "Elevated exhaust temperature alongside intake leak signature. Two possible explanations: " +
        "(1) lean combustion from air restriction causing hotter exhaust — consequence of the intake leak, OR " +
        "(2) simultaneous exhaust manifold leak. Complete the primary repair first, then verify exhaust temperatures have normalised."
      );
    }
  }

  // Rule 2 — no thermal signature
  if (leakLocation === "Intake_PreTurbo") {
    const postCompT = _getDeviation("Post_Compressor_Temp_C", deviationMap, liveReadings);
    const postCacT = _getDeviation("Post_CAC_Temp_C", deviationMap, liveReadings);
    const exhT = _getDeviation("Exhaust_Manifold_Temp_C", deviationMap, liveReadings);
    if (
      postCompT != null && postCompT <= 0 &&
      postCacT != null && postCacT <= 0 &&
      exhT != null && exhT <= 2
    ) {
      let removed = 0;
      for (const c of causes) {
        if (c.id.includes("crack")) {
          removed += c.probability * 0.60;
          c.probability *= 0.40;
          c.disambiguationReasons.push("no_thermal_signature_mechanical_gap_indicated");
        }
      }
      const clamp = causes.find((c) => c.id === "loose_vclamp_inlet");
      const boot = causes.find((c) => c.id === "failed_rubber_boot");
      if (clamp) {
        clamp.probability += removed * 0.70;
        clamp.disambiguationReasons.push("no_thermal_signature_mechanical_gap_indicated");
      }
      if (boot) {
        boot.probability += removed * 0.30;
        boot.disambiguationReasons.push("no_thermal_signature_mechanical_gap_indicated");
      }
      _normalise(causes);
      const postVal = liveReadings?.Post_Compressor_Temp_C;
      const baseVal = _APPROX_BASELINES.Post_Compressor_Temp_C;
      addInfo(
        "no_thermal_signature_mechanical_gap_indicated",
        `Post-compressor temperature is ${postVal}°C vs baseline ${baseVal}°C (dropping, not rising). ` +
        "Thermal cracks develop from heat cycling stress and produce rising temperatures near the crack. " +
        "The absence of any temperature rise strongly indicates a mechanical connection failure (loose clamp or aged boot) rather than a structural crack."
      );
    }
  }

  // Rule 3 — turbo amplification
  if (leakLocation === "Intake_PreTurbo") {
    const preP = _getDeviation("Pre_Compressor_Pressure_kPa", deviationMap, liveReadings);
    const postP = _getDeviation("Post_Compressor_Pressure_kPa", deviationMap, liveReadings);
    if (preP != null && postP != null && Math.abs(postP) - Math.abs(preP) > 2) {
      addInfo(
        "turbo_amplification_confirms_pre_turbo_location",
        `Post-compressor pressure dropping more than pre-compressor pressure (${Math.abs(postP).toFixed(1)}% vs ${Math.abs(preP).toFixed(1)}%) ` +
        "confirms the turbocharger is functioning correctly but receiving insufficient inlet air. " +
        "The turbocharger amplifies the inlet air deficit — this is expected physics for a pre-turbo intake gap."
      );
    }
  }

  // Rule 4 — EGR cascade consequence (NOT co-failure)
  if (leakLocation !== "EGR_Leak") {
    const egr = _getDeviation("EGR_Flow_Rate_kgph", deviationMap, liveReadings);
    const boost = _getDeviation("Boost_Pressure_kPa", deviationMap, liveReadings);
    if (egr != null && egr >= -45 && egr <= -10 && boost != null && boost < 0) {
      addInfo(
        "egr_cascade_consequence",
        `EGR flow has reduced ${Math.abs(egr).toFixed(1)}% alongside the primary leak. This is an expected consequence — ` +
        "EGR recirculation uses boost pressure differential as its driving force. As boost pressure recovers after repair, " +
        "EGR flow will return to normal automatically. No separate EGR inspection needed unless EGR flow remains abnormal after primary repair."
      );
    }
  }

  // Rule 5 — disproportionate EGR
  if (leakLocation !== "EGR_Leak") {
    const egr = _getDeviation("EGR_Flow_Rate_kgph", deviationMap, liveReadings);
    const boost = _getDeviation("Boost_Pressure_kPa", deviationMap, liveReadings);
    if (egr != null && egr < -50 && boost != null && boost > -15) {
      addWarning(
        "egr_disproportionate_possible_secondary_failure",
        `EGR flow has dropped ${Math.abs(egr).toFixed(1)}% while boost pressure only dropped ${Math.abs(boost).toFixed(1)}%. ` +
        `This disproportionate EGR reduction suggests the EGR circuit has a separate fault in addition to the primary ${leakLocation} leak. ` +
        "After primary repair, inspect the EGR system independently."
      );
    }
  }

  // Rule 6 — minor severity
  if (severity === "Minor") {
    let removed = 0;
    for (const c of causes) {
      if (/crack|fracture/.test(c.id)) {
        removed += c.probability * 0.70;
        c.probability *= 0.30;
        c.disambiguationReasons.push("minor_severity_mechanical_connection_not_structural");
      }
    }
    const mech = causes
      .filter((c) => /clamp|boot|loose|gasket|distributed|rubber|seal/.test(c.id))
      .sort((a, b) => b.probability - a.probability)[0];
    if (mech && removed > 0) {
      mech.probability += removed;
      mech.disambiguationReasons.push("minor_severity_mechanical_connection_not_structural");
    }
    _normalise(causes);
    addInfo(
      "minor_severity_mechanical_connection_not_structural",
      "Minor severity deviations are inconsistent with structural cracks, which typically cause sudden moderate-to-severe failures. " +
      "This pattern suggests a small mechanical gap at a connection point."
    );
  }

  // Rule 7 — stable turbo speed
  if (leakLocation === "Intake_PreTurbo" || leakLocation === "Minor_Intake_Leak") {
    const turbo = _getDeviation("Turbocharger_Speed_RPM", deviationMap, liveReadings);
    const preP = _getDeviation("Pre_Compressor_Pressure_kPa", deviationMap, liveReadings);
    if (turbo != null && turbo >= -2 && turbo <= 2 && preP != null && preP < -5) {
      const rpm = liveReadings?.Turbocharger_Speed_RPM;
      const base = _APPROX_BASELINES.Turbocharger_Speed_RPM;
      addInfo(
        "turbo_speed_stable_moderate_gap_indicated",
        `Turbocharger speed is stable (${rpm} RPM vs ${base} RPM baseline) despite pressure deviation. ` +
        "The leak is creating pressure loss but not severely restricting air volume — consistent with a small-to-medium gap rather than a large structural failure."
      );
    }
  }

  // Scenario-specific: Intake_PostTurbo_CAC
  if (leakLocation === "Intake_PostTurbo_CAC") {
    const cacDrop = _getDeviation("CAC_Pressure_Drop_kPa", deviationMap, liveReadings);
    const coolant = _getDeviation("Engine_Coolant_Temp_C", deviationMap, liveReadings);
    if (cacDrop != null && cacDrop > 300) {
      for (const c of causes) {
        if (c.id === "loose_cac_outlet_clamp") {
          c.probability *= 0.80;
          c.disambiguationReasons.push("cac_large_delta_p_shift");
        } else if (c.id === "cac_end_tank_crack" || c.id === "cac_internal_tube_failure") {
          c.probability *= 1.10;
          c.disambiguationReasons.push("cac_large_delta_p_shift");
        }
      }
      _normalise(causes);
    }
    if (coolant != null && Math.abs(coolant) > 3) {
      for (const c of causes) {
        if (c.id === "cac_internal_tube_failure") {
          c.probability *= 1.30;
          c.disambiguationReasons.push("coolant_deviation_internal_cac");
        } else if (c.id === "cac_end_tank_crack") {
          c.probability *= 0.90;
        }
      }
    } else if (coolant != null) {
      for (const c of causes) {
        if (c.id === "cac_end_tank_crack") {
          c.probability *= 1.20;
          c.disambiguationReasons.push("coolant_stable_end_tank");
        }
      }
    }
    _normalise(causes);
  }

  // Scenario-specific: Exhaust_PreTurbine
  if (leakLocation === "Exhaust_PreTurbine") {
    const exhP = _getDeviation("Exhaust_Manifold_Pressure_kPa", deviationMap, liveReadings);
    const exhT = _getDeviation("Exhaust_Manifold_Temp_C", deviationMap, liveReadings);
    if (exhP != null && exhP < -5 && exhT != null && exhT > 3) {
      for (const c of causes) {
        if (c.id === "blown_exhaust_gasket") {
          c.probability *= 1.05;
          c.disambiguationReasons.push("exhaust_p_drop_t_rise_confirmed");
        }
      }
      _normalise(causes);
    }
  }

  // Scenario-specific: Exhaust_PostTurbine
  if (leakLocation === "Exhaust_PostTurbine") {
    if (severity === "Minor") {
      for (const c of causes) {
        if (c.id === "loose_vband_turbine_outlet") {
          c.probability *= 1.20;
          c.disambiguationReasons.push("minor_post_turbine_vband");
        }
      }
    } else if (
      severity === "Moderate" ||
      severity === "Severe" ||
      severity === "Critical"
    ) {
      for (const c of causes) {
        if (c.id === "cracked_flex_pipe") {
          c.probability *= 1.15;
          c.disambiguationReasons.push("moderate_post_turbine_flex");
        }
      }
    }
    _normalise(causes);
  }

  // Scenario-specific: EGR_Leak
  if (leakLocation === "EGR_Leak") {
    const coolant = _getDeviation("Engine_Coolant_Temp_C", deviationMap, liveReadings);
    const egrOut = _getDeviation("EGR_Cooler_Outlet_Temp_C", deviationMap, liveReadings);
    if ((coolant != null && Math.abs(coolant) > 3) || (egrOut != null && Math.abs(egrOut) > 5)) {
      for (const c of causes) {
        if (c.id === "cracked_egr_cooler") {
          c.probability *= 1.35;
          c.disambiguationReasons.push("coolant_cross_contamination_egr");
        }
      }
      _normalise(causes);
    }
  }

  _normalise(causes);
  causes.sort((a, b) => b.probability - a.probability);

  const topProb = causes.length > 0 ? causes[0].probability : 0;
  const isNovelAnomaly =
    leakLocation !== "None" &&
    leakLocation !== "Normal" &&
    !KNOWN_LEAK_SCENARIOS.has(leakLocation);

  if (typeof console !== "undefined" && console.debug) {
    console.debug(
      "[RCA]",
      leakLocation,
      "cause IDs:",
      causes.map((c) => c.id),
      "topProb:",
      topProb.toFixed(3),
      "isNovelAnomaly:",
      isNovelAnomaly
    );
  }

  const rankedCauses = isNovelAnomaly
    ? []
    : causes.slice(0, 3).map((cause, idx) => ({
      id: cause.id,
      rank: idx + 1,
      label: cause.label,
      probability: Math.round(cause.probability * 1000) / 1000,
      probabilityPct: `${Math.round(cause.probability * 100)}%`,
      physicalReasoning: cause.physicalReasoning,
      inspectAction: cause.inspectAction,
      tool: cause.tool,
      visualSign: cause.visualSign,
      disambiguationReasons: [...new Set(cause.disambiguationReasons || [])],
    }));

  const dedupedDisambiguation = _dedupeDisambiguation(disambiguationApplied);

  return {
    leakLocation,
    severity,
    shapPatternSummary: buildShapPatternSummary(
      leakLocation,
      top_5_sensors_driving_prediction,
      liveReadings
    ),
    cascadeExplanation: buildCascadeExplanation(
      leakLocation,
      top_5_sensors_driving_prediction
    ),
    rankedCauses,
    isNovelAnomaly,
    disambiguationApplied: dedupedDisambiguation,
    notes,
    timestamp: Date.now(),
  };
}

export function buildChatbotRCABlock(rcaResult) {
  if (!rcaResult) return "ROOT CAUSE ANALYSIS:\nNo RCA data available.";

  const {
    leakLocation,
    severity,
    shapPatternSummary,
    cascadeExplanation,
    rankedCauses,
    isNovelAnomaly,
    disambiguationApplied,
    notes,
  } = rcaResult;

  const lines = [];
  lines.push("ROOT CAUSE ANALYSIS:");
  lines.push(`Location: ${leakLocation} | Severity: ${severity}`);
  lines.push(`SHAP Pattern: ${shapPatternSummary}`);
  if (cascadeExplanation) {
    lines.push(`Cascade: ${cascadeExplanation}`);
  }
  lines.push("");

  if (rankedCauses?.length > 0) {
    lines.push("Ranked Causes:");
    for (const cause of rankedCauses) {
      lines.push(`${cause.rank}. ${cause.label} — ${cause.probabilityPct}`);
      lines.push(`   Physical reasoning: ${cause.physicalReasoning}`);
      lines.push(`   Inspect: ${cause.inspectAction}`);
      lines.push(`   Tool: ${cause.tool}`);
      lines.push(`   Visual sign: ${cause.visualSign}`);
      if (cause.disambiguationReasons?.length) {
        lines.push(`   Disambiguation: ${cause.disambiguationReasons.join(", ")}`);
      }
      lines.push("");
    }
  } else if (isNovelAnomaly) {
    lines.push("NOVEL ANOMALY DETECTED: True (Historical KB confidence too low)");
    lines.push("");
  } else {
    lines.push("Ranked Causes: None — no leak detected.");
    lines.push("");
  }

  if (disambiguationApplied?.length > 0) {
    lines.push("Disambiguation:");
    for (const rule of disambiguationApplied) {
      const label = typeof rule === "string" ? rule : (DISAMBIG_LABELS[rule.label] || rule.label);
      const type = typeof rule === "string" ? "info" : rule.type;
      const msg = typeof rule === "string" ? rule : rule.message;
      lines.push(`  [${type}] ${label}: ${msg}`);
    }
  } else {
    lines.push("Disambiguation: None");
  }

  const warningNotes = (notes || [])
    .filter((n) => (typeof n === "string" ? true : n.type === "warning"))
    .map((n) => (typeof n === "string" ? n : n.message));
  lines.push(`Warnings: ${warningNotes.length ? warningNotes.join(" | ") : "None"}`);

  return lines.join("\n");
}

export { DISAMBIG_LABELS };
