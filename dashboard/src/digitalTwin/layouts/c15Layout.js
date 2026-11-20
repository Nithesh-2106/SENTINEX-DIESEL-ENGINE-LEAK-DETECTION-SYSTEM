/**
 * CAT C15 — large 6-cyl layout (15.2L, full SCR, extended aftertreatment).
 * Geometry scaled from C13 with aft stretch for longer exhaust train.
 */
import { C13_LAYOUT } from "./c13Layout.js";

/** Scale a 3D point — extra stretch on positive-X (aftertreatment) coordinates. */
function scalePos(x, y, z) {
  const mx = x > 2.8 ? 1.22 : x > 1.5 ? 1.14 : x < -4.5 ? 1.04 : 1.10;
  const my = 1.10;
  const mz = 1.10;
  const r = (v) => Math.round(v * 100) / 100;
  return [r(x * mx), r(y * my), r(z * mz)];
}

function scalePath(pts) {
  return pts.map((p) => scalePos(...p));
}

const SENSOR_DEFS = C13_LAYOUT.sensorDefs.map((s) => ({
  ...s,
  pos: scalePos(...s.pos),
}));

const TX = 2.65;

export const C15_LAYOUT = {
  id: "CAT_C15",
  engineId: "CAT_C15",
  blockSubLabel: "CAT C15 6-CYL · 15.2L",
  displacementL: 15.2,
  hasScr: true,
  turboRpmRef: 98000,
  pistonStroke: 0.30,
  cameraOrbitR: 17.5,
  geometry: {
    block: { w: 2.65, h: 1.32, d: 1.23 },
    oilPan: { w: 2.52, h: 0.42, d: 1.19, y: -0.87 },
    cylinderX: [-1.16, -0.69, -0.23, 0.23, 0.69, 1.16],
    cylRadius: 0.30,
    cylHeight: 1.76,
    cylBaseY: 0.66,
    head: { w: 2.86, h: 0.33, d: 1.23, y: 2.58 },
    valveCover: { w: 2.66, h: 0.22, d: 1.08, y: 2.80 },
    intManif: { w: 2.42, h: 0.31, d: 0.35, y: 2.20, z: -0.75 },
    exhManif: { w: 2.42, h: 0.31, d: 0.35, y: 2.20, z: 0.75 },
    turboPos: [TX, 0.66, 0],
    turboScale: 1.12,
    impellerPos: [2.10, 0.66, 0],
    cac: { w: 1.76, h: 0.53, d: 1.01, y: 3.52 },
    airfilter: { body: [-5.45, 0.66, 0], cap: [-5.88, 0.66, 0], radius: 0.35 },
    aftertreatment: {
      doc: { x: 3.35, radius: 0.30, length: 0.78 },
      dpf: { x: 4.35, radius: 0.37, length: 1.20 },
      scr: { x: 5.35, radius: 0.30, length: 0.88 },
      tailpipe: { pos: [6.05, -0.24, 0], rot: [0, 0, 0.18], length: 1.12 },
    },
    coolantRail: { w: 2.42, h: 0.20, d: 0.13, pos: [-0.05, 0.13, 0.66] },
    egrValvePos: [0, 2.26, 0],
    scanRingRadii: [3.9, 5.4, 7.2],
    valveRockerSpan: 0.72,
    cacFinSpan: 1.58,
  },
  pipes: {
    intake: [
      scalePath([[-5.45, 0.66, 0], [-4.35, 0.66, 0], [-3.25, 0.66, 0], [-1.62, 0.66, 0], [TX, 0.66, -0.38]]),
      scalePath([[TX, 0.88, 0], [TX, 1.76, 0], [TX, 2.86, 0], [1.32, 3.52, 0], [0, 3.52, 0]]),
      scalePath([[0, 3.24, 0], [0, 2.70, -0.33], [0, 2.20, -0.75]]),
    ],
    exhaust: [
      scalePath([[0, 2.20, 0.75], [1.10, 1.76, 0.68], [TX, 0.66, 0.33]]),
      scalePath([[TX, 0.26, 0], [3.08, 0, 0]]),
      [[3.35, 0, 0], [4.35, 0, 0], [5.35, 0, 0], [6.0, -0.20, 0]],
    ],
    intakeRadii: [0.11, 0.13, 0.11],
    exhaustRadii: [0.11, 0.15, 0.125],
  },
  flowBlips: {
    intakeSegCounts: [44, 44, 44],
    exhaustSegCounts: [55, 38, 60],
    egrCount: 64,
  },
  egrPath: scalePath([
    [1.3, 1.30, 0.60], [0.6, 1.92, 0.28], [0, 2.06, 0],
    [-0.6, 1.92, -0.28], [-0.4, 1.30, -0.60],
  ]),
  sensorDefs: SENSOR_DEFS,
  zoneAnchors: [
    { id: "zone_airfilter", label: "AIR FILTER", sub: "Intake Inlet", pos: scalePos(-5.45, 1.05, 0), col: "#00ff88" },
    { id: "zone_block", label: "ENGINE BLOCK", sub: null, pos: scalePos(0, 0.60, 0), col: "#4488ff" },
    { id: "zone_cac", label: "CAC", sub: "Charge Air Cooler", pos: scalePos(0, 3.80, 0), col: "#00ff88" },
    { id: "zone_egr", label: "EGR COOLER", sub: "Exhaust Gas Recircul.", pos: scalePos(-1.15, 2.58, 0.35), col: "#bb55ff" },
    { id: "zone_turbo", label: "TURBOCHARGER", sub: "Compressor + Turbine", pos: [TX, 1.15, 0], col: "#00ddff" },
    { id: "zone_aftertreat", label: "DPF / DOC", sub: "Aftertreatment", pos: [3.85, 0.38, 0], col: "#22cc66" },
    { id: "zone_scr", label: "SCR", sub: "Selective Cat. Reduc.", pos: [5.35, 0.38, 0], col: "#33dd88" },
    { id: "zone_exhaust", label: "EXHAUST OUT", sub: "Tailpipe", pos: [6.05, 0.06, 0], col: "#ff6030" },
  ],
  leakPositions: {
    Intake_PreTurbo: scalePos(-2.8, 0.66, 0),
    Intake_PostTurbo_CAC: scalePos(1.0, 2.08, 0),
    Intake_PostCAC: scalePos(1.0, 2.08, 0),
    CAC_Direct_Leak: scalePos(0, 2.64, 0),
    Exhaust_PreTurbine: scalePos(1.6, 1.21, 0.44),
    Exhaust_PostTurbine: scalePos(2.85, 0, 0),
    Exhaust_PostDPF: [4.35, 0, 0],
    EGR_Leak: scalePos(0, 2.26, 0),
    Minor_Intake_Leak: scalePos(-0.8, 0.66, 0),
    None: null,
  },
};
