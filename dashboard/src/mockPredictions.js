/**
 * DEMO MODE — Offline fallback when FastAPI is unreachable.
 * Mirrors PredictionResponse + SHAP shape from api/schemas + predict.py
 */

import { ENGINE_BASELINES, getFaultInjectionForScenario } from "./simulator.js";
import { DEMO_MODEL_SELECTION } from "./utils/modelSelection.js";

const CONF = 0.9995;

function withModelSelection(obj) {
  return { ...obj, Model_Selection: DEMO_MODEL_SELECTION };
}

function buildActiveLeakDetails(multiPattern, primaryTop5, secondaryTop5) {
  const { primary_location: primary, secondary_location: secondary, location_probs: probs = {} } =
    multiPattern;
  const phys = (severity) => ({
    severity,
    recommended_action: "Pause_Test_Inspect_Component",
    performance_impact_pct: severity === "Severe" ? 12 : 8,
    impact_basis: "demo_physics",
    blend_score: 0.72,
    severity_method: "physics_rules_v1",
  });
  return [
    {
      location: primary,
      severity: "Severe",
      confidence: probs[primary] ?? 0.9,
      probability: probs[primary] ?? 0.9,
      recommended_action: "Pause_Test_Inspect_Component",
      physics_severity: phys("Severe"),
      top_5_sensors_driving_prediction: primaryTop5,
    },
    {
      location: secondary,
      severity: "Moderate",
      confidence: probs[secondary] ?? 0.85,
      probability: probs[secondary] ?? 0.85,
      recommended_action: "Pause_Test_Inspect_Component",
      physics_severity: phys("Moderate"),
      top_5_sensors_driving_prediction: secondaryTop5 || primaryTop5.slice(0, 3),
    },
  ];
}

function shapRow(sensor, your, baseline, deviation_pct, shap_impact, interpretation) {
  return {
    sensor,
    your_value: your,
    normal_baseline: baseline,
    deviation_pct,
    shap_impact,
    interpretation,
  };
}

function buildSfiMock({
  faultySensor,
  faultReason,
  correlatedDeviating = 0,
  correlatedRequired = 2,
  faultConfidence = 0.94,
  faultType = "ISOLATED_DEVIATION",
  dqpFlags = [],
  dqScore = 60,
}) {
  return withModelSelection({
    Leak_Present: 0,
    Leak_Location: "None",
    Leak_Severity: "None",
    Recommended_Action: "Inspect_Sensor_Hardware",
    Confidence_Score: 0.0,
    Sensor_Fault_Isolation: {
      checked: true,
      is_sensor_fault: true,
      is_confirmed_leak: false,
      faulty_sensor: faultySensor,
      fault_reason: faultReason,
      correlated_deviating: correlatedDeviating,
      correlated_required: correlatedRequired,
      confidence_modifier: 0.0,
      fault_type: faultType,
      fault_confidence: faultConfidence,
    },
    Data_Quality: {
      score: dqScore,
      is_usable: true,
      summary: dqpFlags.length
        ? `${dqpFlags.length}× flag (score: ${dqScore}/100)`
        : `Clean (score: ${dqScore}/100)`,
      flags: dqpFlags,
    },
    top_5_sensors_driving_prediction: [],
  });
}

const SFI_MOCKS = {
  sensor_fault_demo: buildSfiMock({
    faultySensor: "Pre_Compressor_Pressure_kPa",
    faultReason:
      "Isolated sensor anomaly: Pre_Compressor_P deviated 27.6% but 0/2 correlated sensors confirm pattern. Post_Compressor_P and Boost_P normal. Likely hardware fault — not a leak.",
    correlatedRequired: 2,
    faultConfidence: 0.96,
    dqpFlags: [
      {
        sensor: "Pre_Compressor_Pressure_kPa",
        type: "BOUNDS_VIOLATION",
        severity: "CRITICAL",
        original: 72.0,
        cleaned: 99.4,
        detail: "Value 72.0 outside physical bounds [70.0, 115.0]",
      },
    ],
  }),
  sensor_fault_exhaust: buildSfiMock({
    faultySensor: "Exhaust_Manifold_Pressure_kPa",
    faultReason:
      "Isolated sensor anomaly: Exhaust_Manifold_P deviated 28.3% but 0/2 correlated sensors confirm. Pre_Turbine_P and Post_Turbine_P normal. Hardware fault — not Exhaust_PreTurbine leak.",
    correlatedRequired: 2,
    faultConfidence: 0.95,
  }),
  sensor_fault_egr: buildSfiMock({
    faultySensor: "EGR_Flow_Rate_kgph",
    faultReason:
      "Isolated sensor anomaly: EGR_Flow_Rate collapsed 91% but 0/1 correlated sensors confirm EGR leak pattern. Intake_Manifold_T and Exhaust_Manifold_P normal.",
    correlatedDeviating: 0,
    correlatedRequired: 1,
    faultConfidence: 0.93,
  }),
  sensor_fault_cac: buildSfiMock({
    faultySensor: "CAC_Pressure_Drop_kPa",
    faultReason:
      "Isolated sensor anomaly: CAC_Pressure_Drop spiked 420% but 0/2 correlated sensors confirm CAC_Direct_Leak. Post_CAC_P and Intake_Manifold_P normal.",
    correlatedRequired: 2,
    faultConfidence: 0.94,
  }),
};

export function getMockPrediction(scenario, engineId = "CAT_C13", options = {}) {
  const engineBase = ENGINE_BASELINES[engineId] || ENGINE_BASELINES.CAT_C13;
  /* DEMO MODE — fault injection overlay uses same SFI mocks as dedicated scenarios */
  if (options.faultInjection) {
    const preset = getFaultInjectionForScenario(scenario);
    if (preset?.sfiMockId && SFI_MOCKS[preset.sfiMockId]) {
      return SFI_MOCKS[preset.sfiMockId];
    }
  }

  if (SFI_MOCKS[scenario]) {
    return SFI_MOCKS[scenario];
  }

  if (scenario === "normal") {
    return withModelSelection({
      Leak_Present: 0,
      Leak_Location: "None",
      Leak_Severity: "None",
      Recommended_Action: "Continue_Testing",
      Confidence_Score: CONF,
      Data_Quality: {
        score: 98.0,
        is_usable: true,
        summary: "Clean (score: 98/100)",
        flags: [],
      },
      top_5_sensors_driving_prediction: [
        shapRow("MAF_Sensor_Reading_kgph", 720, 720, 0.0, 0.02, "Within normal range -- baseline condition"),
        shapRow("Boost_Pressure_kPa", 116.7, 116.7, 0.0, 0.01, "Within normal range -- baseline condition"),
        shapRow("Intake_Manifold_Pressure_kPa", 211, 211, 0.0, 0.01, "Within normal range -- baseline condition"),
        shapRow("Pre_Turbine_Pressure_kPa", 225, 225, 0.0, 0.01, "Within normal range -- baseline condition"),
        shapRow("Post_Turbine_Pressure_kPa", 112, 112, 0.0, 0.01, "Within normal range -- baseline condition"),
      ],
    });
  }

  const mocks = {
    intake_preturbo: {
      Leak_Present: 1,
      Leak_Location: "Intake_PreTurbo",
      Leak_Severity: "Moderate",
      Recommended_Action: "Pause_Test_Inspect_Component",
      top_5: [
        shapRow("Pre_Compressor_Pressure_kPa", 91, 99.5, -8.5, -0.42, "BELOW normal -- drives leak prediction"),
        shapRow("Boost_Pressure_kPa", 93.7, 116.7, -19.7, -0.38, "BELOW normal -- drives leak prediction"),
        shapRow("Post_Compressor_Pressure_kPa", 195, 218, -10.6, -0.31, "BELOW normal -- drives leak prediction"),
        shapRow("Turbocharger_Speed_RPM", 87000, 92000, -5.4, -0.22, "BELOW normal -- drives leak prediction"),
        shapRow("Compressor_Pressure_Ratio", 2.14, 2.19, -2.3, -0.15, "BELOW normal -- drives leak prediction"),
      ],
    },
    intake_cac: {
      Leak_Present: 1,
      Leak_Location: "Intake_PostTurbo_CAC",
      Leak_Severity: "Moderate",
      Recommended_Action: "Pause_Test_Inspect_Component",
      top_5: [
        shapRow("CAC_Pressure_Drop_kPa", 23, 5.0, 360.0, 0.55, "ABOVE normal -- drives leak prediction"),
        shapRow("Post_CAC_Pressure_kPa", 195, 213, -8.5, -0.41, "BELOW normal -- drives leak prediction"),
        shapRow("Intake_Manifold_Pressure_kPa", 192, 211, -9.0, -0.36, "BELOW normal -- drives leak prediction"),
        shapRow("Post_CAC_Temp_C", 58, 52, 11.5, 0.28, "ABOVE normal -- drives leak prediction"),
        shapRow("Intake_Manifold_Temp_C", 61, 55, 10.9, 0.19, "ABOVE normal -- drives leak prediction"),
      ],
    },
    exhaust_preturbine: {
      Leak_Present: 1,
      Leak_Location: "Exhaust_PreTurbine",
      Leak_Severity: "Moderate",
      Recommended_Action: "Pause_Test_Inspect_Component",
      top_5: [
        shapRow("Pre_Turbine_Pressure_kPa", 190, 225, -15.6, -0.48, "BELOW normal -- drives leak prediction"),
        shapRow("Exhaust_Manifold_Temp_C", 720, 680, 5.9, 0.44, "ABOVE normal -- drives leak prediction"),
        shapRow("Exhaust_Manifold_Pressure_kPa", 198, 230, -13.9, -0.39, "BELOW normal -- drives leak prediction"),
        shapRow("Turbine_Expansion_Ratio", 1.76, 2.01, -12.4, -0.33, "BELOW normal -- drives leak prediction"),
        shapRow("Pre_Turbine_Temp_C", 660, 670, -1.5, -0.12, "BELOW normal -- drives leak prediction"),
      ],
    },
    exhaust_postturbine: {
      Leak_Present: 1,
      Leak_Location: "Exhaust_PostTurbine",
      Leak_Severity: "Minor",
      Recommended_Action: "Flag_and_Monitor",
      top_5: [
        shapRow("Post_Turbine_Pressure_kPa", 104, 112, -7.1, -0.35, "BELOW normal -- drives leak prediction"),
        shapRow("Post_DPF_Pressure_kPa", 99.5, 106, -6.1, -0.28, "BELOW normal -- drives leak prediction"),
        shapRow("Post_SCR_Pressure_kPa", 98, 103.5, -5.3, -0.24, "BELOW normal -- drives leak prediction"),
        shapRow("Post_DOC_Pressure_kPa", 101.5, 109.5, -7.3, -0.22, "BELOW normal -- drives leak prediction"),
        shapRow("Post_Turbine_Temp_C", 445, 480, -7.3, -0.18, "BELOW normal -- drives leak prediction"),
      ],
    },
    egr_leak: {
      Leak_Present: 1,
      Leak_Location: "EGR_Leak",
      Leak_Severity: "Moderate",
      Recommended_Action: "Pause_Test_Inspect_Component",
      top_5: [
        shapRow("EGR_Flow_Rate_kgph", 38.0, 58.0, -34.5, 2.1, "BELOW normal — EGR flow collapse"),
        shapRow("Intake_Manifold_Temp_C", 59.0, 55.0, 7.3, 0.8, "ABOVE normal — reduced EGR cooling"),
        shapRow("Exhaust_Manifold_Pressure_kPa", 224.0, 230.0, -2.6, 0.4, "BELOW normal — exhaust escape"),
        shapRow("Intake_Mass_Balance_Error_kgph", 9.5, 6.5, 46.2, 0.3, "ABOVE normal — mass flow imbalance"),
        shapRow("Post_SCR_Temp_C", 412.0, 420.0, -1.9, 0.1, "BELOW normal — reduced exhaust heat"),
      ],
    },
    cac_direct_leak: {
      Leak_Present: 1,
      Leak_Location: "CAC_Direct_Leak",
      Leak_Severity: "Moderate",
      Recommended_Action: "Pause_Test_Inspect_Component",
      top_5: [
        shapRow("CAC_Pressure_Drop_kPa", 26.0, 5.0, 420.0, 2.8, "ABOVE normal — CAC body leak signature"),
        shapRow("Post_CAC_Temp_C", 62.0, 52.0, 19.2, 1.6, "ABOVE normal — cooling efficiency lost"),
        shapRow("Post_CAC_Pressure_kPa", 192.0, 213.0, -9.9, 1.2, "BELOW normal — pressure lost at CAC"),
        shapRow("Intake_Manifold_Pressure_kPa", 189.5, 211.0, -10.2, 0.9, "BELOW normal — starved intake"),
        shapRow("Boost_Pressure_kPa", 101.5, 116.7, -13.0, 0.6, "BELOW normal — boost lost at cooler"),
      ],
    },
    minor_intake_leak: {
      Leak_Present: 1,
      Leak_Location: "Minor_Intake_Leak",
      Leak_Severity: "Minor",
      Recommended_Action: "Flag_and_Monitor",
      top_5: [
        shapRow("Post_CAC_Pressure_kPa", 204.5, 213.0, -4.0, 0.9, "BELOW normal — subtle intake loss"),
        shapRow("Intake_Manifold_Pressure_kPa", 203.0, 211.0, -3.8, 0.8, "BELOW normal — consistent with minor leak"),
        shapRow("Post_Compressor_Pressure_kPa", 209.5, 218.0, -3.9, 0.7, "BELOW normal — early leak signature"),
        shapRow("Boost_Pressure_kPa", 108.5, 116.7, -7.0, 0.6, "BELOW normal — boost slightly reduced"),
        shapRow("Pre_Compressor_Pressure_kPa", 96.6, 99.5, -2.9, 0.5, "BELOW normal — upstream pressure drop"),
      ],
    },
    intake_preturbo_egr: {
      Leak_Present: 1,
      Leak_Location: "Intake_PreTurbo",
      Leak_Severity: "Moderate",
      Recommended_Action: "Pause_Test_Inspect_Component",
      top_5: [
        shapRow("Boost_Pressure_kPa", 94.0, 116.7, -19.4, 1.8, "BELOW normal — dual intake+EGR signature"),
        shapRow("EGR_Flow_Rate_kgph", 38.0, 58.0, -34.5, 1.5, "BELOW normal — EGR flow collapse"),
        shapRow("Pre_Compressor_Pressure_kPa", 91.0, 99.5, -8.5, 1.2, "BELOW normal — pre-turbo leak"),
        shapRow("Intake_Mass_Balance_Error_kgph", 15.0, 6.5, 130.8, 0.9, "ABOVE normal — mass imbalance"),
        shapRow("Intake_Manifold_Temp_C", 59.0, 55.0, 7.3, 0.7, "ABOVE normal — EGR heat ingress"),
      ],
      multiPattern: {
        is_multi_leak: true,
        active_locations: ["Intake_PreTurbo", "EGR_Leak"],
        primary_location: "Intake_PreTurbo",
        secondary_location: "EGR_Leak",
        combo_label: "Intake_PreTurbo+EGR_Leak",
        display_mode: "MULTI_LEAK",
        location_probs: {
          Intake_PreTurbo: 0.91,
          EGR_Leak: 0.87,
          CAC_Direct_Leak: 0.12,
          Exhaust_PostTurbine: 0.08,
        },
        routing_reason: "Unified multi-label — 2 active scenario(s)",
        detection_model: "MULTILABEL",
      },
    },
    exhaust_post_intake_pre: {
      Leak_Present: 1,
      Leak_Location: "Exhaust_PostTurbine",
      Leak_Severity: "Moderate",
      Recommended_Action: "Pause_Test_Inspect_Component",
      top_5: [
        shapRow("Post_Turbine_Pressure_kPa", 104.0, 112.0, -7.1, 1.4, "BELOW normal — post-turbine leak"),
        shapRow("Boost_Pressure_kPa", 94.0, 116.7, -19.4, 1.2, "BELOW normal — intake coupling"),
        shapRow("Pre_Compressor_Pressure_kPa", 91.0, 99.5, -8.5, 1.0, "BELOW normal — pre-turbo drop"),
        shapRow("Post_DPF_Pressure_kPa", 99.5, 106.0, -6.1, 0.8, "BELOW normal — downstream exhaust"),
        shapRow("Turbocharger_Speed_RPM", 87000, 92000, -5.4, 0.6, "BELOW normal — turbo speed drop"),
      ],
      multiPattern: {
        is_multi_leak: true,
        active_locations: ["Exhaust_PostTurbine", "Intake_PreTurbo"],
        primary_location: "Exhaust_PostTurbine",
        secondary_location: "Intake_PreTurbo",
        combo_label: "Exhaust_PostTurbine+Intake_PreTurbo",
        display_mode: "MULTI_LEAK",
        location_probs: {
          Exhaust_PostTurbine: 0.89,
          Intake_PreTurbo: 0.84,
          EGR_Leak: 0.11,
        },
        routing_reason: "Unified multi-label — 2 active scenario(s)",
        detection_model: "MULTILABEL",
      },
    },
    cac_egr_combined: {
      Leak_Present: 1,
      Leak_Location: "CAC_Direct_Leak",
      Leak_Severity: "Severe",
      Recommended_Action: "Pause_Test_Inspect_Component",
      top_5: [
        shapRow("CAC_Pressure_Drop_kPa", 28.0, 5.0, 460.0, 2.5, "ABOVE normal — CAC body leak"),
        shapRow("EGR_Flow_Rate_kgph", 38.0, 58.0, -34.5, 1.6, "BELOW normal — EGR flow collapse"),
        shapRow("Post_CAC_Pressure_kPa", 192.0, 213.0, -9.9, 1.3, "BELOW normal — CAC pressure loss"),
        shapRow("Boost_Pressure_kPa", 91.0, 116.7, -22.0, 1.1, "BELOW normal — boost collapse"),
        shapRow("Intake_Manifold_Temp_C", 59.0, 55.0, 7.3, 0.8, "ABOVE normal — EGR heat ingress"),
      ],
      multiPattern: {
        is_multi_leak: true,
        active_locations: ["CAC_Direct_Leak", "EGR_Leak"],
        primary_location: "CAC_Direct_Leak",
        secondary_location: "EGR_Leak",
        combo_label: "CAC_Direct_Leak+EGR_Leak",
        display_mode: "MULTI_LEAK",
        location_probs: {
          CAC_Direct_Leak: 0.93,
          EGR_Leak: 0.86,
          Intake_PreTurbo: 0.09,
        },
        routing_reason: "Unified multi-label — 2 active scenario(s)",
        detection_model: "MULTILABEL",
      },
    },
    intake_postturbo_egr: {
      Leak_Present: 1,
      Leak_Location: "Intake_PostTurbo_CAC",
      Leak_Severity: "Severe",
      Recommended_Action: "Pause_Test_Inspect_Component",
      top_5: [
        shapRow("Post_CAC_Pressure_kPa", 195.0, 213.0, -8.5, 1.7, "BELOW normal — CAC leak"),
        shapRow("EGR_Flow_Rate_kgph", 38.0, 58.0, -34.5, 1.5, "BELOW normal — EGR flow collapse"),
        shapRow("CAC_Pressure_Drop_kPa", 22.0, 5.0, 340.0, 1.3, "ABOVE normal — CAC drop"),
        shapRow("Boost_Pressure_kPa", 98.0, 116.7, -16.0, 1.1, "BELOW normal — boost loss"),
        shapRow("Intake_Manifold_Temp_C", 59.0, 55.0, 7.3, 0.8, "ABOVE normal — EGR heat"),
      ],
      multiPattern: {
        is_multi_leak: true,
        active_locations: ["Intake_PostTurbo_CAC", "EGR_Leak"],
        primary_location: "Intake_PostTurbo_CAC",
        secondary_location: "EGR_Leak",
        combo_label: "Intake_PostTurbo_CAC+EGR_Leak",
        display_mode: "MULTI_LEAK",
        location_probs: { Intake_PostTurbo_CAC: 0.91, EGR_Leak: 0.88 },
        routing_reason: "Unified multi-label — 2 active scenario(s)",
        detection_model: "MULTILABEL",
      },
    },
    exhaust_post_egr: {
      Leak_Present: 1,
      Leak_Location: "Exhaust_PostTurbine",
      Leak_Severity: "Moderate",
      Recommended_Action: "Pause_Test_Inspect_Component",
      top_5: [
        shapRow("Post_Turbine_Pressure_kPa", 104.0, 112.0, -7.1, 1.4, "BELOW normal — post-turbine"),
        shapRow("EGR_Flow_Rate_kgph", 38.0, 58.0, -34.5, 1.3, "BELOW normal — EGR collapse"),
        shapRow("Post_DPF_Pressure_kPa", 99.5, 106.0, -6.1, 0.9, "BELOW normal — downstream"),
        shapRow("DPF_Delta_Pressure_kPa", 2.0, 3.5, -42.9, 0.7, "BELOW normal — DPF delta"),
        shapRow("Intake_Manifold_Temp_C", 59.0, 55.0, 7.3, 0.6, "ABOVE normal — EGR heat"),
      ],
      multiPattern: {
        is_multi_leak: true,
        active_locations: ["Exhaust_PostTurbine", "EGR_Leak"],
        primary_location: "Exhaust_PostTurbine",
        secondary_location: "EGR_Leak",
        combo_label: "Exhaust_PostTurbine+EGR_Leak",
        display_mode: "MULTI_LEAK",
        location_probs: { Exhaust_PostTurbine: 0.88, EGR_Leak: 0.85 },
        routing_reason: "Unified multi-label — 2 active scenario(s)",
        detection_model: "MULTILABEL",
      },
    },
    exhaust_post_cac: {
      Leak_Present: 1,
      Leak_Location: "Exhaust_PostTurbine",
      Leak_Severity: "Severe",
      Recommended_Action: "Pause_Test_Inspect_Component",
      top_5: [
        shapRow("Post_Turbine_Pressure_kPa", 104.0, 112.0, -7.1, 1.5, "BELOW normal — post-turbine"),
        shapRow("CAC_Pressure_Drop_kPa", 24.0, 5.0, 380.0, 1.4, "ABOVE normal — CAC leak"),
        shapRow("Post_CAC_Pressure_kPa", 192.0, 213.0, -9.9, 1.2, "BELOW normal — CAC pressure"),
        shapRow("Boost_Pressure_kPa", 91.0, 116.7, -22.0, 1.0, "BELOW normal — boost"),
        shapRow("Post_DPF_Pressure_kPa", 99.5, 106.0, -6.1, 0.8, "BELOW normal — downstream"),
      ],
      multiPattern: {
        is_multi_leak: true,
        active_locations: ["Exhaust_PostTurbine", "CAC_Direct_Leak"],
        primary_location: "Exhaust_PostTurbine",
        secondary_location: "CAC_Direct_Leak",
        combo_label: "Exhaust_PostTurbine+CAC_Direct_Leak",
        display_mode: "MULTI_LEAK",
        location_probs: { Exhaust_PostTurbine: 0.9, CAC_Direct_Leak: 0.87 },
        routing_reason: "Unified multi-label — 2 active scenario(s)",
        detection_model: "MULTILABEL",
      },
    },
    minor_intake_egr: {
      Leak_Present: 1,
      Leak_Location: "Minor_Intake_Leak",
      Leak_Severity: "Moderate",
      Recommended_Action: "Pause_Test_Inspect_Component",
      top_5: [
        shapRow("Post_CAC_Pressure_kPa", 204.5, 213.0, -4.0, 0.9, "BELOW normal — minor intake"),
        shapRow("EGR_Flow_Rate_kgph", 38.0, 58.0, -34.5, 1.2, "BELOW normal — EGR collapse"),
        shapRow("Intake_Manifold_Pressure_kPa", 203.0, 211.0, -3.8, 0.8, "BELOW normal — manifold"),
        shapRow("Boost_Pressure_kPa", 108.5, 116.7, -7.0, 0.7, "BELOW normal — boost"),
        shapRow("Intake_Manifold_Temp_C", 59.0, 55.0, 7.3, 0.6, "ABOVE normal — EGR heat"),
      ],
      multiPattern: {
        is_multi_leak: true,
        active_locations: ["Minor_Intake_Leak", "EGR_Leak"],
        primary_location: "Minor_Intake_Leak",
        secondary_location: "EGR_Leak",
        combo_label: "Minor_Intake_Leak+EGR_Leak",
        display_mode: "MULTI_LEAK",
        location_probs: { Minor_Intake_Leak: 0.82, EGR_Leak: 0.86 },
        routing_reason: "Unified multi-label — 2 active scenario(s)",
        detection_model: "MULTILABEL",
      },
    },
  };

  const m = mocks[scenario];
  if (!m) {
    return getMockPrediction("normal");
  }

  const confidenceByScenario = {
    egr_leak: 0.885,
    cac_direct_leak: 0.912,
    minor_intake_leak: 0.834,
    intake_preturbo_egr: 0.91,
    intake_postturbo_egr: 0.9,
    exhaust_post_egr: 0.88,
    exhaust_post_intake_pre: 0.89,
    exhaust_post_cac: 0.9,
    cac_egr_combined: 0.93,
    minor_intake_egr: 0.84,
  };

  const multiPattern = m.multiPattern ?? null;
  const activeLeakDetails = multiPattern?.is_multi_leak
    ? buildActiveLeakDetails(multiPattern, m.top_5, m.top_5.slice(2, 5))
    : [];

  if (multiPattern && activeLeakDetails.length) {
    multiPattern.active_leak_details = activeLeakDetails;
  }

  const modelSelection = multiPattern?.is_multi_leak
    ? {
        ...DEMO_MODEL_SELECTION,
        active_model_id: "random_forest",
        active_model_name: "Random Forest",
      }
    : DEMO_MODEL_SELECTION;

  return {
    Leak_Present: m.Leak_Present,
    Leak_Location: m.Leak_Location,
    Leak_Severity: m.Leak_Severity,
    Recommended_Action: m.Recommended_Action,
    Confidence_Score: confidenceByScenario[scenario] ?? CONF,
    Dynamic_Baseline: { ...engineBase },
    display_mode: multiPattern?.is_multi_leak ? "MULTI_LEAK" : "SINGLE",
    Is_Multi_Leak: Boolean(multiPattern?.is_multi_leak),
    Secondary_Leak: multiPattern?.secondary_location ?? null,
    Active_Labels: multiPattern?.active_locations ?? [],
    Label_Probabilities: multiPattern?.location_probs ?? {},
    Active_Leak_Details: activeLeakDetails,
    ...(multiPattern ? { Multi_Pattern: multiPattern } : {}),
    Model_Selection: modelSelection,
    Data_Quality: {
      score: 94.0,
      is_usable: true,
      summary: "1x HF_NOISE (score: 94/100)",
      flags: [
        {
          sensor: "Pre_Compressor_Pressure_kPa",
          type: "HF_NOISE",
          severity: "INFO",
          original: 91.8,
          cleaned: 91.1,
          detail: "HF noise smoothed: 91.8->91.1 (EMA alpha=0.3)",
        },
      ],
    },
    top_5_sensors_driving_prediction: m.top_5,
  };
}
