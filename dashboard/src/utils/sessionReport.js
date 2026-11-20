/**
 * Demo session log for report preview when API is offline with no live readings.
 */
import { MULTI_LEAK_SCENARIOS } from "../simulator.js";

export const SCENARIO_EXPECTED = {
  normal: { type: "baseline" },
  intake_preturbo: { type: "leak", locations: ["Intake_PreTurbo"] },
  intake_cac: { type: "leak", locations: ["Intake_PostTurbo_CAC"] },
  exhaust_preturbine: { type: "leak", locations: ["Exhaust_PreTurbine"] },
  exhaust_postturbine: { type: "leak", locations: ["Exhaust_PostTurbine"] },
  egr_leak: { type: "leak", locations: ["EGR_Leak"] },
  cac_direct_leak: { type: "leak", locations: ["CAC_Direct_Leak"] },
  minor_intake_leak: { type: "leak", locations: ["Minor_Intake_Leak"] },
  sensor_fault_demo: { type: "sfi" },
  sensor_fault_exhaust: { type: "sfi" },
  sensor_fault_egr: { type: "sfi" },
  sensor_fault_cac: { type: "sfi" },
  ...Object.fromEntries(
    MULTI_LEAK_SCENARIOS.map((m) => [
      m.id,
      { type: "multi", locations: m.combo.split("+").map((s) => s.trim()) },
    ])
  ),
};

export function formatReportLocation(loc) {
  return (loc || "").replace(/_/g, " ").trim() || "—";
}

function collectDetectedLocations(leakEvents) {
  const locs = new Set();
  for (const evt of leakEvents) {
    if (evt.activeLeakDetails?.length) {
      evt.activeLeakDetails.forEach((d) => d.location && locs.add(d.location));
    } else {
      if (evt.leakLocation && evt.leakLocation !== "None") locs.add(evt.leakLocation);
      const sec = evt.multiPattern?.secondary_location;
      if (sec) locs.add(sec);
    }
  }
  return [...locs];
}

export function formatExpectedOutcome(scenarioId) {
  const exp = SCENARIO_EXPECTED[scenarioId];
  if (!exp) return "—";
  if (exp.type === "baseline") return "No fault (baseline)";
  if (exp.type === "sfi") return "Sensor fault (SFI)";
  if (exp.type === "multi") {
    return `${exp.locations.map(formatReportLocation).join(" + ")} (2 sites)`;
  }
  return formatReportLocation(exp.locations[0]);
}

export function formatDetectedOutcome(leakEvents, faultEvents) {
  const locs = collectDetectedLocations(leakEvents);
  if (faultEvents.length > 0 && leakEvents.length === 0) {
    const sensor = faultEvents[0]?.faultedSensor;
    return sensor ? `SFI — ${formatReportLocation(sensor)}` : "SFI flagged";
  }
  if (locs.length === 0 && faultEvents.length === 0) return "None";
  if (locs.length >= 2) {
    return `${locs.map(formatReportLocation).join(" + ")} (${locs.length} sites)`;
  }
  if (locs.length === 1) return formatReportLocation(locs[0]);
  if (faultEvents.length > 0) return "SFI + leak signal";
  return "None";
}

/** Pass/fail verdict for one scenario segment vs ML log. */
export function validateScenarioSegment(segment, sessionLog) {
  const expected = SCENARIO_EXPECTED[segment.scenarioId];
  const leakEvents = getEventsInSegment(
    sessionLog.leakEvents,
    segment,
    sessionLog.totalReadings
  );
  const faultEvents = getEventsInSegment(
    sessionLog.sensorFaults,
    segment,
    sessionLog.totalReadings
  );
  const expectedLabel = formatExpectedOutcome(segment.scenarioId);
  const detectedLabel = formatDetectedOutcome(leakEvents, faultEvents);
  const detectedLocs = collectDetectedLocations(leakEvents);

  if (!expected || expected.type === "baseline") {
    if (leakEvents.length === 0 && faultEvents.length === 0) {
      return { expectedLabel, detectedLabel, status: "pass", statusLabel: "Pass" };
    }
    return { expectedLabel, detectedLabel, status: "warn", statusLabel: "Unexpected" };
  }

  if (expected.type === "sfi") {
    if (faultEvents.length > 0) {
      return { expectedLabel, detectedLabel, status: "pass", statusLabel: "Pass" };
    }
    if (leakEvents.length > 0) {
      return { expectedLabel, detectedLabel, status: "fail", statusLabel: "Miss" };
    }
    return { expectedLabel, detectedLabel: "None", status: "miss", statusLabel: "Miss" };
  }

  if (segmentHadFaultInjection(segment, sessionLog) && faultEvents.length > 0) {
    return {
      expectedLabel: `${expectedLabel} + injected sensor fault`,
      detectedLabel,
      status: "sfi_demo",
      statusLabel: "SFI Demo",
    };
  }

  if (leakEvents.length === 0) {
    return { expectedLabel, detectedLabel: "None", status: "miss", statusLabel: "Miss" };
  }

  const expectedSet = new Set(expected.locations);
  const allFound = expected.locations.every((loc) => detectedLocs.includes(loc));
  const anyFound = expected.locations.some((loc) => detectedLocs.includes(loc));

  if (expected.type === "multi") {
    if (allFound && detectedLocs.length >= 2) {
      return { expectedLabel, detectedLabel, status: "pass", statusLabel: "Pass" };
    }
    if (anyFound) {
      return { expectedLabel, detectedLabel, status: "fail", statusLabel: "Partial" };
    }
    return { expectedLabel, detectedLabel, status: "fail", statusLabel: "Fail" };
  }

  if (anyFound) {
    return { expectedLabel, detectedLabel, status: "pass", statusLabel: "Pass" };
  }
  return { expectedLabel, detectedLabel, status: "fail", statusLabel: "Fail" };
}

export function summarizeScenarioValidation(sessionLog) {
  const segments = sessionLog.scenarioSegments || [];
  const results = segments.map((seg) => ({
    segment: seg,
    ...validateScenarioSegment(seg, sessionLog),
  }));
  const pass = results.filter((r) => r.status === "pass" || r.status === "sfi_demo").length;
  const fail = results.filter((r) => ["fail", "miss", "warn"].includes(r.status)).length;
  return { results, pass, fail, total: results.length };
}

export const DEMO_SESSION_LOG = {
  sessionId: "TC2026-DEMO-001",
  engineId: "CAT_C13",
  engineName: "CAT C13 — 12.5L",
  testCellId: "TC-CELL-03",
  engineSerial: "CAT-C13-SN-00412",
  testerName: "Demo Operator",
  testerRole: "tester_demo",
  bayId: "TC-01",
  activeModelId: "random_forest",
  activeModelName: "Random Forest",
  activeModelAccuracy: 1.0,
  startTime: new Date(Date.now() - 22 * 60000),
  endTime: new Date(),
  totalReadings: 1334,
  leakEvents: [
    {
      eventId: "EVT-003",
      timestamp: "11:08:44",
      readingNumber: 1124,
      leakLocation: "Intake_PostTurbo_CAC",
      leakSeverity: "Severe",
      confidence: 98.9,
      recommendedAction: "Pause_Test_Inspect_Component",
      engineId: "CAT_C13",
      isMultiLeak: true,
      scenarioLabel: "Multi: Intake Post-Turbo/CAC + EGR",
      sfiConfirmed: true,
      sfiPatternCheck: "6 / 2 correlated sensors deviating consistently",
      sfiPhysicalBasis:
        "Dual independent failures: CAC pressure drop with concurrent EGR circuit loss. Both signatures confirmed — inspect CAC end tank and EGR cooler separately.",
      multiPattern: {
        is_multi_leak: true,
        primary_location: "Intake_PostTurbo_CAC",
        secondary_location: "EGR_Leak",
        combo_label: "Intake_PostTurbo_CAC+EGR_Leak",
      },
      activeLeakDetails: [
        {
          location: "Intake_PostTurbo_CAC",
          severity: "Severe",
          confidence: 98.9,
          shapDrivers: [
            { sensor: "CAC_Pressure_Drop_kPa", deviation_pct: 318.6 },
            { sensor: "Post_CAC_Pressure_kPa", deviation_pct: -12.4 },
            { sensor: "Boost_Pressure_kPa", deviation_pct: -8.2 },
          ],
        },
        {
          location: "EGR_Leak",
          severity: "Moderate",
          confidence: 94.2,
          shapDrivers: [
            { sensor: "EGR_Flow_Rate_kgph", deviation_pct: -42.5 },
            { sensor: "EGR_Delta_Pressure_kPa", deviation_pct: -28.1 },
            { sensor: "EGR_Cooler_Outlet_Temp_C", deviation_pct: 15.3 },
          ],
        },
      ],
      multiRcaResults: [
        {
          leakLocation: "Intake_PostTurbo_CAC",
          severity: "Severe",
          topCause: "CAC end tank crack",
          topCausePct: "60%",
          rankedCauses: [{ label: "CAC end tank crack", probabilityPct: "60%" }],
        },
        {
          leakLocation: "EGR_Leak",
          severity: "Moderate",
          topCause: "EGR cooler core breach",
          topCausePct: "55%",
          rankedCauses: [{ label: "EGR cooler core breach", probabilityPct: "55%" }],
        },
      ],
      shapDrivers: [
        { sensor: "CAC_Pressure_Drop_kPa", deviation_pct: 318.6 },
        { sensor: "EGR_Flow_Rate_kgph", deviation_pct: -42.5 },
        { sensor: "Post_CAC_Pressure_kPa", deviation_pct: -12.4 },
      ],
      dqpScore: 92.0,
      dqpSummary: "3x HF_NOISE cleaned (multi-leak)",
      engineRpm: 1800,
      engineLoad: 75,
      ambientTemp: 32.0,
    },
    {
      eventId: "EVT-001",
      timestamp: "10:42:15",
      readingNumber: 342,
      leakLocation: "Exhaust_PostTurbine",
      leakSeverity: "Minor",
      confidence: 98.86,
      recommendedAction: "Flag_and_Monitor",
      engineId: "CAT_C13",
      sfiConfirmed: true,
      sfiPatternCheck: "4 / 2 correlated sensors deviating consistently",
      sfiPhysicalBasis:
        "Post-turbine leak: pre-turbine sensors stay normal. Post-turbine pressure and temperature drop together as exhaust gas escapes before aftertreatment.",
      shapDrivers: [
        { sensor: "Post_Turbine_Pressure_kPa", yourValue: 104.2, baseline: 112.0, deviation_pct: -7.0 },
        { sensor: "Post_DOC_Pressure_kPa", yourValue: 101.5, baseline: 109.5, deviation_pct: -7.3 },
        { sensor: "Post_DPF_Pressure_kPa", yourValue: 99.5, baseline: 106.0, deviation_pct: -6.1 },
        { sensor: "Post_SCR_Pressure_kPa", yourValue: 98.0, baseline: 103.5, deviation_pct: -5.3 },
        { sensor: "Post_Turbine_Temp_C", yourValue: 445.0, baseline: 480.2, deviation_pct: -7.3 },
      ],
      dqpScore: 96.0,
      dqpSummary: "1x HF_NOISE cleaned",
      engineRpm: 1800,
      engineLoad: 75,
      ambientTemp: 32.0,
    },
    {
      eventId: "EVT-002",
      timestamp: "10:51:33",
      readingNumber: 897,
      leakLocation: "Intake_PreTurbo",
      leakSeverity: "Moderate",
      confidence: 99.94,
      recommendedAction: "Pause_Test_Inspect_Component",
      engineId: "CAT_C13",
      sfiConfirmed: true,
      sfiPatternCheck: "4 / 2 correlated sensors deviating consistently",
      sfiPhysicalBasis:
        "Intake pre-turbo leak causes cascade: less air reaches compressor → lower boost → lower manifold pressure → turbo slows.",
      shapDrivers: [
        { sensor: "Pre_Compressor_Pressure_kPa", deviation_pct: -8.4 },
        { sensor: "Post_Compressor_Pressure_kPa", deviation_pct: -9.3 },
        { sensor: "Boost_Pressure_kPa", deviation_pct: -17.5 },
        { sensor: "Turbocharger_Speed_RPM", deviation_pct: -5.4 },
        { sensor: "Intake_Manifold_Pressure_kPa", deviation_pct: -10.9 },
      ],
      dqpScore: 94.0,
      dqpSummary: "2x HF_NOISE cleaned",
      engineRpm: 1800,
      engineLoad: 75,
      ambientTemp: 32.0,
    },
  ],
  sensorFaults: [
    {
      eventId: "FLT-001",
      timestamp: "10:38:22",
      readingNumber: 198,
      faultType: "HEALTH_DEGRADATION",
      faultedSensor: "Pre_Compressor_Pressure_kPa",
      faultReason:
        "Isolated deviation: Pre_Compressor_P deviated 27.6% but 0/2 correlated sensors confirm. Post_Compressor_P and Boost_P normal. Hardware fault likely.",
      actionTaken: "Inspect_Sensor_Hardware",
      confidence: 0.0,
    },
  ],
  dqpEvents: [
    { timestamp: "10:35:10", readingNumber: 120, flags: [{ severity: "WARNING" }], score: 97 },
    { timestamp: "10:41:02", readingNumber: 310, flags: [{ severity: "WARNING" }], score: 96 },
    { timestamp: "10:50:18", readingNumber: 780, flags: [{ severity: "CRITICAL" }], score: 94 },
  ],
  ssgEvents: [
    { timestamp: "10:31:05", readingNumber: 45, reason: "RPM ramp — not steady" },
    { timestamp: "10:33:22", readingNumber: 88, reason: "Load step change" },
    { timestamp: "10:47:11", readingNumber: 620, reason: "Transient after scenario switch" },
    { timestamp: "10:48:40", readingNumber: 705, reason: "RPM settling" },
  ],
  scenarioHistory: [
    "Normal Operation",
    "Multi: Intake Post-Turbo/CAC + EGR",
    "Exhaust Leak — Post Turbine",
    "Sensor Fault Demo",
  ],
};

export const ENGINE_SERIAL = {
  CAT_C7: "CAT-C7-SN-00201",
  CAT_C13: "CAT-C13-SN-00412",
  CAT_C15: "CAT-C15-SN-00887",
};

/** Snapshot RCA at leak-detection time for session report storage. */
export function serializeRcaSnapshot(rca) {
  if (!rca || rca.leakLocation === "None") return null;
  return {
    leakLocation: rca.leakLocation,
    severity: rca.severity,
    shapPatternSummary: rca.shapPatternSummary || "",
    cascadeExplanation: rca.cascadeExplanation || null,
    topCause: rca.rankedCauses?.[0]?.label || null,
    topCausePct: rca.rankedCauses?.[0]?.probabilityPct || null,
    rankedCauses: (rca.rankedCauses || []).slice(0, 3).map((c) => ({
      label: c.label,
      probabilityPct: c.probabilityPct,
    })),
  };
}

export function createInitialSessionLog(engineId, engineName) {
  return {
    sessionId: null,
    engineId,
    engineName,
    testCellId: "TC-CELL-03",
    engineSerial: ENGINE_SERIAL[engineId] || "N/A",
    testerName: null,
    testerRole: null,
    bayId: null,
    activeModelId: null,
    activeModelName: null,
    activeModelAccuracy: null,
    startTime: null,
    endTime: null,
    totalReadings: 0,
    leakEvents: [],
    sensorFaults: [],
    dqpEvents: [],
    ssgEvents: [],
    faultInjectionEvents: [],
    scenarioHistory: [],
    scenarioSegments: [],
  };
}

/** Close the active scenario segment at the given reading number. */
export function closeScenarioSegments(segments, endReading) {
  if (!segments?.length) return [];
  return segments.map((seg, idx, arr) =>
    idx === arr.length - 1 && seg.endReading == null
      ? { ...seg, endReading: endReading ?? seg.startReading }
      : seg
  );
}

/** Count log events whose readingNumber falls within a scenario segment. */
export function countEventsInSegment(events, segment, totalReadings = 0) {
  const end = segment.endReading ?? totalReadings ?? segment.startReading;
  return (events || []).filter(
    (e) => e.readingNumber >= segment.startReading && e.readingNumber <= end
  ).length;
}

export function getEventsInSegment(events, segment, totalReadings = 0) {
  const end = segment.endReading ?? totalReadings ?? segment.startReading;
  return (events || []).filter(
    (e) => e.readingNumber >= segment.startReading && e.readingNumber <= end
  );
}

/** True if fault injection was turned on during this scenario segment's reading range. */
export function segmentHadFaultInjection(segment, sessionLog) {
  const end = segment.endReading ?? sessionLog.totalReadings ?? segment.startReading;
  return (sessionLog.faultInjectionEvents || []).some(
    (evt) =>
      evt.action === "on" &&
      evt.readingNumber >= segment.startReading &&
      evt.readingNumber <= end
  );
}

/** Distinct leak sites one logged event represents (2 for concurrent multi-leak). */
export function leakLocationCountForEvent(event) {
  if (!event) return 0;
  const details = event.activeLeakDetails;
  if (Array.isArray(details) && details.length >= 2) return details.length;
  if (event.isMultiLeak || event.multiPattern?.is_multi_leak) {
    const mp = event.multiPattern;
    if (mp?.primary_location && mp?.secondary_location) return 2;
    return 2;
  }
  return event.leakLocation && event.leakLocation !== "None" ? 1 : 0;
}

/** Sum concurrent leak locations detected within a scenario window. */
export function countLeakLocationsInSegment(leakEvents, segment, totalReadings = 0) {
  return getEventsInSegment(leakEvents, segment, totalReadings).reduce(
    (sum, evt) => sum + leakLocationCountForEvent(evt),
    0
  );
}

/** Session-wide total leak locations (multi-leak counts as 2+ sites). */
export function countTotalLeakLocations(sessionLog) {
  return (sessionLog.leakEvents || []).reduce(
    (sum, evt) => sum + leakLocationCountForEvent(evt),
    0
  );
}
