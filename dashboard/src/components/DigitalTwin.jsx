/**
 * DigitalTwin.jsx — Props-Driven 3D Engine Visualization
 * ──────────────────────────────────────────────────────────
 * Caterpillar C13 Digital Twin for the leak-detection dashboard.
 *
 * Unlike the standalone version, this component does NOT poll
 * an API. It receives all data as props from App.jsx so it stays
 * perfectly synchronised with the dashboard's scenario, operator
 * controls, and real ML predictions.
 *
 * Props:
 *   sensorData         – dict of 42 sensor float values (latestReading)
 *   prediction         – PredictionResponse object from /predict
 *   operatingPoint     – { rpm, load, ambientPressure }
 *   isStreaming        – whether the dashboard is actively streaming
 *   engineBaselines    – per-engine baseline map for tooltip deviation
 *   activeEngine       – CAT_C7 | CAT_C13 | CAT_C15
 *   engineDisplayName  – human-readable engine label for HUD
 *   hasScr             – false for C7 (hide SCR mesh/labels)

 */

import React, {
  useRef, useEffect, useCallback,
  forwardRef, useState, useMemo,
} from "react";
import * as THREE from "three";
import { GNN_EDGES } from "../digitalTwin/gnnEdges.js";
import { getEngineLayout, isEngineGeometryReady } from "../digitalTwin/engineProfiles.js";
import { mountEngineContent } from "../digitalTwin/mountEngineContent.js";
import { disposeObject3D } from "../digitalTwin/disposeContent.js";
import { ZONE_TO_COMPONENT, LEAK_ORIGIN_COMPONENT, COMPONENT_SENSOR_MAP, getSensorDef } from "../digitalTwin/componentSensorMap.js";
import { formatSensorValue } from "../digitalTwin/formatSensorValue.js";
import { COMPONENT_COLOURS } from "../digitalTwin/sensorPanelConfig.js";
import { SENSOR_DEFINITIONS } from "../constants/sensorDefinitions.js";
import { getActiveSensorCount } from "../utils/sensorHealthMerge.js";
import { mergedShapFromActiveLeaks, stabilizeActiveLeaks } from "../utils/multiLeak.js";
import { useTheme } from "../context/ThemeContext.jsx";
import { getTokens } from "../utils/themeTokens.js";
import { updateSceneMaterials } from "../digitalTwin/themeMaterials.js";
import { computeComponentScreenAnchors } from "../digitalTwin/screenProjection.js";
import { collectEngineMeshes } from "../digitalTwin/sensor3dPositions.js";
import { resolveZoneOverlaps } from "../digitalTwin/labelOverlap.js";
import {
  mountSensorDots, clearSensorDots, updateSensorDotColors,
  setSensorMeshesVisible, tickSensorDots, projectSensorDotLabels,
  raycastSensorDots,
} from "../digitalTwin/sensorMode.js";
import { mountGnnOverlay, clearGnnOverlay, tickGnnPulse, projectGnnLabels } from "../digitalTwin/gnnMode.js";
import { getComponentShapScore } from "../digitalTwin/shapOverlay.js";
import { applyLeakPropagation, clearLeakPropagation, applyMultiLeakPropagation, tickLeakPropagation } from "../digitalTwin/leakPropagation.js";
import {
  applyLeakPhysics, clearLeakPhysics, applySecondaryLeakPhysics, clearSecondaryLeakPhysics, updateEscapeParticles,
  updateParticleColourLerp, updateHeatGlow, tickGapIndicator,
  getActiveIntakeParticleCount, getActiveExhaustParticleCount, getActiveEgrParticleCount,
} from "../digitalTwin/leakPhysics.js";
import { applyShapMode, clearShapMode, tickShapPulse } from "../digitalTwin/shapOverlay.js";
import {
  enterHologramMode, exitHologramMode, tickHologramFx,
  raycastHologramComponent, startHologramDrag, updateHologramDrag, endHologramDrag,
  selectHologramPart, resetComponentPosition, resetAllComponentPositions,
  applyHologramLeakContext, applyHologramMultiLeakContext, applyHologramSensorFaultContext,
  cinematicExtractLeakPart, instantResetHologramAssembly,
} from "../digitalTwin/hologramMode.js";
import HologramAnalysisPanel from "./HologramAnalysisPanel.jsx";
import HoloStatusStrip from "./HoloStatusStrip.jsx";
import ComponentTooltip from "./ComponentTooltip.jsx";
import SensorPanelOverlay from "./SensorPanelOverlay.jsx";
import SensorDotLabels from "./SensorDotLabels.jsx";
import SensorAllLabelsOverlay from "./SensorAllLabelsOverlay.jsx";
import SensorDetailPanel from "./SensorDetailPanel.jsx";
import SensorHoverTooltip from "./SensorHoverTooltip.jsx";
import { buildSfiFaultExplanation } from "../utils/sfiExplanation.js";

const BASELINES = {
  Engine_Speed_Actual_RPM:1800, MAF_Sensor_Reading_kgph:720,
  Exhaust_Manifold_Temp_C:680, Pre_Turbine_Pressure_kPa:224,
  Post_Compressor_Pressure_kPa:219, Intake_Manifold_Pressure_kPa:212,
  Turbocharger_Speed_RPM:92000, Fuel_Flow_Rate_kgph:65,
  Engine_Load_Actual_Pct:72, Engine_Coolant_Temp_C:89,
  Engine_Oil_Pressure_bar:4.2,
};

// ──────────────────────────────────────────────────────────────
// SHAP COLOR INTERPOLATION HELPERS
// ──────────────────────────────────────────────────────────────
function lerpColor(a, b, t) {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bv = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bv;
}

function shapToColor(shapNorm) {
  // 0→cyan, 0.5→amber, 1→red
  if (shapNorm < 0.5) return lerpColor(0x00ccff, 0xffaa00, shapNorm * 2);
  return lerpColor(0xffaa00, 0xff3333, (shapNorm - 0.5) * 2);
}

function applyHologramFromPrediction(t, prediction, options = {}, scenarioId = null, sensorFaultCtx = null) {
  if (sensorFaultCtx?.faultyComponentKey) {
    applyHologramSensorFaultContext(
      t,
      sensorFaultCtx.faultyComponentKey,
      sensorFaultCtx.faultySensorKey,
      {
        ...options,
        faultySensorLabel: sensorFaultCtx.faultySensorLabel,
      },
    );
    return;
  }

  const activeLeaks = stabilizeActiveLeaks(prediction, scenarioId);
  const primary = prediction?.Leak_Present === 1 ? (prediction?.Leak_Location || "None") : "None";
  const secondary = activeLeaks[1]?.location || null;
  if (secondary) {
    applyHologramMultiLeakContext(t, primary, secondary, options);
  } else {
    applyHologramLeakContext(t, primary, options);
  }
}

function updateLeakMarkers(t, primaryLoc, secondaryLoc) {
  if (!t?.leakSphere) return;

  const showPrimary = primaryLoc && primaryLoc !== "None";
  if (showPrimary) {
    const pos = t.leakPositions?.[primaryLoc];
    if (pos) {
      const minor = primaryLoc === "Minor_Intake_Leak";
      const col = minor ? 0xffaa00 : 0xff2200;
      t.leakSphere.position.set(...pos);
      t.leakSphere.material.color.setHex(col);
      t.leakSphere.scale.setScalar(1);
      t.leakRings?.forEach((lr) => {
        lr.ring.position.set(...pos);
        lr.rm.color.setHex(col);
      });
    }
  } else {
    t.leakSphere.material.opacity = 0;
    t.leakRings?.forEach((lr) => { lr.rm.opacity = 0; });
  }

  const showSecondary = secondaryLoc && secondaryLoc !== "None";
  if (showSecondary && t.secondaryLeakSphere) {
    const secPos = t.leakPositions?.[secondaryLoc];
    if (secPos) {
      const col = 0x7c3aed;
      t.secondaryLeakSphere.position.set(...secPos);
      t.secondaryLeakSphere.material.color.setHex(col);
      t.secondaryLeakSphere.scale.setScalar(1.35);
      t.secondaryLeakRings?.forEach((lr) => {
        lr.ring.position.set(...secPos);
        lr.rm.color.setHex(col);
      });
    }
  } else if (t.secondaryLeakSphere) {
    t.secondaryLeakSphere.material.opacity = 0;
    t.secondaryLeakRings?.forEach((lr) => { lr.rm.opacity = 0; });
  }

  t.activeLeakClass = showPrimary ? primaryLoc : "None";
  t.activeSecondaryLeakClass = showSecondary ? secondaryLoc : "None";
  t.activeLeakMarkerKey = `${primaryLoc || "None"}|${secondaryLoc || "None"}`;
}


// ──────────────────────────────────────────────────────────────
// COMPONENT
// ──────────────────────────────────────────────────────────────
const DigitalTwin = forwardRef(function DigitalTwin(props, ref) {
  const {
    sensorData        = null,
    prediction        = null,
    operatingPoint    = null,
    isStreaming       = false,
    engineBaselines   = null,
    activeEngine      = "CAT_C13",
    engineDisplayName = "CAT C13",
    hasScr            = true,
    rcaResult         = null,
    multiRcaResults   = [],
    multiPattern      = null,
    activeScenario    = null,
    presentationMode  = false,
    mirrorWaiting     = false,
    faultInjectionActive = false,
    faultInjectionPreset = null,
  } = props;

  const baselines = engineBaselines || BASELINES;

  const sfiMeta = prediction?.Sensor_Fault_Isolation;
  const faultySensorKey = useMemo(() => {
    if (sfiMeta?.is_sensor_fault && sfiMeta.faulty_sensor) return sfiMeta.faulty_sensor;
    if (faultInjectionActive && faultInjectionPreset?.sensor) return faultInjectionPreset.sensor;
    return null;
  }, [sfiMeta?.is_sensor_fault, sfiMeta?.faulty_sensor, faultInjectionActive, faultInjectionPreset?.sensor]);

  const faultyComponentKey = useMemo(() => {
    if (!faultySensorKey) return null;
    return SENSOR_DEFINITIONS[faultySensorKey]?.component || null;
  }, [faultySensorKey]);

  const faultCtx = useMemo(() => {
    if (!faultyComponentKey) return null;
    const def = SENSOR_DEFINITIONS[faultySensorKey];
    return {
      faultyComponentKey,
      faultySensorKey,
      faultySensorLabel: def?.shortLabel || faultInjectionPreset?.label || null,
    };
  }, [faultyComponentKey, faultySensorKey, faultInjectionPreset?.label]);

  const sensorFaultExplanation = useMemo(
    () => buildSfiFaultExplanation(sfiMeta, { sensorKey: faultySensorKey }),
    [sfiMeta, faultySensorKey],
  );

  const layout = useMemo(() => getEngineLayout(activeEngine), [activeEngine]);
  const activeSensorCount = useMemo(() => getActiveSensorCount(activeEngine), [activeEngine]);
  const blockSubLabel = layout.blockSubLabel || engineDisplayName;
  const geometryReady = isEngineGeometryReady(activeEngine);
  const { theme } = useTheme();
  const themeRef = useRef(getTokens(theme));

  useEffect(() => {
    themeRef.current = getTokens(theme);
    const t = threeRef.current;
    if (t.scene) {
      updateSceneMaterials(t.scene, theme, t);
      if (t.scene.fog) t.scene.fog.color.setHex(themeRef.current.sceneBg);
    }
  }, [theme]);

  const shellRef     = useRef(null);
  const containerRef = useRef(null);
  const canvasRef    = useRef(null);
  const threeRef     = useRef({});
  const tooltipRef   = useRef(null);

  // UI state
  const [gnnOn,     setGnnOn]     = useState(false);
  const [intakeOn,  setIntakeOn]  = useState(true);
  const [exhaustOn, setExhaustOn] = useState(true);
  const [egrOn,     setEgrOn]     = useState(false);
  const [viewMode,  setViewMode]  = useState("ext");
  const [engineZoom, setEngineZoom] = useState(16);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [navMode, setNavMode] = useState("ORBIT");
  const [showEnginePartLabels, setShowEnginePartLabels] = useState(true);
  const [showSensorPanels, setShowSensorPanels] = useState(false);
  const [showSensorDots, setShowSensorDots] = useState(false);
  const [showAllSensors, setShowAllSensors] = useState(false);
  const [showShapLabels, setShowShapLabels] = useState(false);
  const [shapModeOn, setShapModeOn] = useState(false);
  const [componentScreenAnchors, setComponentScreenAnchors] = useState({});
  const lineUpdateRef = useRef(null);
  const holoScenarioKeyRef = useRef(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [hoveredComponent, setHoveredComponent] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [sensorTooltipPos, setSensorTooltipPos] = useState({ x: 0, y: 0 });
  const [zoneLabelPositions, setZoneLabelPositions] = useState([]);
  const [sensorDotLabels, setSensorDotLabels] = useState([]);
  const [allSensorLabels, setAllSensorLabels] = useState([]);
  const [allSensorViewport, setAllSensorViewport] = useState({ width: 0, height: 0 });
  const [allSensorLayoutKey, setAllSensorLayoutKey] = useState(0);
  const [gnnLabels, setGnnLabels] = useState([]);
  const [selectedSensorKey, setSelectedSensorKey] = useState(null);
  const [sensorDetailDismissed, setSensorDetailDismissed] = useState(false);
  const prevFaultySensorRef = useRef(null);

  const openSensorDetail = useCallback((key) => {
    if (!key) return;
    setSensorDetailDismissed(false);
    setSelectedSensorKey(key);
    setShowSensorDots(true);
  }, []);

  const closeSensorDetail = useCallback(() => {
    setSensorDetailDismissed(true);
    setSelectedSensorKey(null);
  }, []);

  const toggleSensorDetail = useCallback((key) => {
    setSelectedSensorKey((prev) => {
      if (prev === key) {
        setSensorDetailDismissed(true);
        return null;
      }
      setSensorDetailDismissed(false);
      return key;
    });
  }, []);
  const [hoveredSensorKey, setHoveredSensorKey] = useState(null);
  const [holoSelectedPart, setHoloSelectedPart] = useState(null);
  const [holoDragging, setHoloDragging] = useState(false);
  /** Bumped when WebGL scene is (re)created — remounts engine after Strict Mode cleanup. */
  const [sceneReady, setSceneReady] = useState(0);
  const prevLeakRef = useRef({ present: false, location: null, severity: null });
  const prevLeakPhysicsRef = useRef({ present: false, location: null, severity: null, secondary: null });
  const shapData = useMemo(() => {
    const fromApi = mergedShapFromActiveLeaks(prediction, activeScenario);
    if (fromApi.length > 0) return fromApi;

    const legacy = prediction?.top_5_sensors_driving_prediction ?? [];
    if (legacy.length > 0) return legacy;

    if (!sensorData) return [];

    const rows = [];
    Object.values(COMPONENT_SENSOR_MAP).forEach((comp) => {
      comp.sensors.forEach(({ key, baseline: defBaseline }) => {
        const val = sensorData[key];
        const base = baselines?.[key] ?? defBaseline;
        if (val == null || base == null || base === 0) return;
        const devPct = Math.abs(((Number(val) - base) / Math.abs(base)) * 100);
        if (devPct < 0.05) return;
        rows.push({ sensor: key, shap_impact: devPct / 100 });
      });
    });
    return rows.sort((a, b) => Math.abs(b.shap_impact) - Math.abs(a.shap_impact)).slice(0, 5);
  }, [prediction?.top_5_sensors_driving_prediction, sensorData, baselines, prediction, activeScenario]);
  const predictionKey = useMemo(
    () => `${prediction?.Leak_Present}-${prediction?.Leak_Location}-${prediction?.Leak_Severity}-${sfiMeta?.is_sensor_fault}-${faultySensorKey}-${faultInjectionActive}`,
    [prediction?.Leak_Present, prediction?.Leak_Location, prediction?.Leak_Severity, sfiMeta?.is_sensor_fault, faultySensorKey, faultInjectionActive],
  );
  const prevShapKeyRef = useRef("");

  const shapZoneLabels = useMemo(() => {
    if (!showShapLabels || !shapModeOn || gnnOn) return [];

    const zoneByComponent = Object.fromEntries(
      Object.entries(ZONE_TO_COMPONENT).map(([zoneId, compKey]) => [compKey, zoneId])
    );

    const resolveAnchor = (compKey) => {
      const zoneId = zoneByComponent[compKey];
      const zone = zoneId ? zoneLabelPositions.find((z) => z.id === zoneId) : null;
      if (zone?.anchorX != null && zone?.anchorY != null) {
        return { anchorX: zone.anchorX, anchorY: zone.anchorY, labelX: zone.x, labelY: zone.y };
      }
      const pt = componentScreenAnchors[compKey];
      if (pt) return { anchorX: pt.x, anchorY: pt.y, labelX: pt.x, labelY: pt.y };
      return null;
    };

    const items = Object.keys(COMPONENT_SENSOR_MAP)
      .map((compKey) => {
        const score = getComponentShapScore(compKey, shapData);
        const anchor = resolveAnchor(compKey);
        if (!anchor || score <= 0) return null;
        return {
          id: compKey,
          compKey,
          label: COMPONENT_SENSOR_MAP[compKey]?.displayName || compKey,
          anchorX: anchor.anchorX,
          anchorY: anchor.anchorY,
          labelX: anchor.labelX,
          labelY: anchor.labelY,
          score,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    if (items.length > 0) return items;

    return (shapData || [])
      .slice(0, 5)
      .map((row) => {
        const sensorKey = row?.sensor;
        if (!sensorKey) return null;
        const compKey = getSensorDef(sensorKey)?.component;
        if (!compKey) return null;
        const anchor = resolveAnchor(compKey);
        if (!anchor) return null;
        const score = Math.abs(Number(row.shap_impact) || 0);
        if (score <= 0) return null;
        return {
          id: sensorKey,
          compKey,
          label: getSensorDef(sensorKey)?.shortLabel || sensorKey,
          anchorX: anchor.anchorX,
          anchorY: anchor.anchorY,
          labelX: anchor.labelX,
          labelY: anchor.labelY,
          score,
        };
      })
      .filter(Boolean);
  }, [showShapLabels, shapModeOn, gnnOn, zoneLabelPositions, componentScreenAnchors, shapData]);

  const sensorNodesActive = showSensorDots || showAllSensors;
  const allLabelsHidden = !showEnginePartLabels && !showSensorPanels && !sensorNodesActive && !showAllSensors && !showShapLabels;

  const toggleLabelBtn = (active) => ({
    padding: "3px 8px",
    fontFamily: "'Orbitron', monospace",
    fontSize: 10,
    letterSpacing: "0.05em",
    cursor: "pointer",
    borderRadius: 4,
    border: active ? "1px solid rgba(255,255,255,0.5)" : "1px solid rgba(255,255,255,0.15)",
    color: active ? "#fff" : "rgba(255,255,255,0.6)",
    background: active ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
    transition: "all 0.15s",
  });

  const refreshScreenAnchors = useCallback(() => {
    const container = containerRef.current;
    const t = threeRef.current;
    if (!container || !t.camera) return;
    const anchors = computeComponentScreenAnchors(t, container.clientWidth, container.clientHeight);
    setComponentScreenAnchors(anchors);
    lineUpdateRef.current?.();
  }, []);

  // ── Three.js init (once) ─────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const t = threeRef.current;

    const initW = Math.max(1, container.clientWidth);
    const initH = Math.max(1, container.clientHeight);

    // FIX: Use logarithmicDepthBuffer to eliminate z-fighting glitches
    const T = getTokens(document.documentElement.getAttribute("data-theme") || "dark");
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      logarithmicDepthBuffer: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    renderer.setSize(initW, initH);
    renderer.setClearColor(T.rendererClear, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(T.sceneBg);
    scene.fog = new THREE.FogExp2(T.sceneBg, 0.002);
    const camera = new THREE.PerspectiveCamera(44, initW / initH, 0.01, 2000);

    // Lighting
    scene.add(new THREE.AmbientLight(0x2244aa, 10.0));
    const dk = new THREE.DirectionalLight(0xeef8ff, 3.0); dk.position.set(2, 12, 10); scene.add(dk);
    const df = new THREE.DirectionalLight(0x99bbdd, 1.8); df.position.set(-3, 4, 18); scene.add(df);
    const ds = new THREE.DirectionalLight(0x6688aa, 1.0); ds.position.set(-14, 3, -4); scene.add(ds);
    const db = new THREE.DirectionalLight(0x334466, 0.8); db.position.set(6, 2, -12); scene.add(db);
    const ct = new THREE.PointLight(0x88ccff, 5.0, 18); ct.position.set(0, 7, 0); scene.add(ct);
    const fp = new THREE.PointLight(0x6699cc, 2.5, 28); fp.position.set(0, 4, 14); scene.add(fp);

    // FIX #3: Raycaster for sensor hover tooltips
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 0.1 };
    const mouse = new THREE.Vector2(-999, -999);
    let hoveredSensor = null;

    // Camera orbit — zoom/rotate only when ray hits engine mesh
    const orb = { theta: 0.42, phi: 0.68, r: 16.0, tx: 0.0, ty: 0.7, tz: 0, drag: false, pan: false, lx: 0, ly: 0 };
    let mouseOverEngine = false;

    const onWheel = (e) => {
      if (!mouseOverEngine) return;
      e.preventDefault();
      e.stopPropagation();
      orb.r = Math.max(1.0, Math.min(30, orb.r + e.deltaY * 0.012));
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });

    canvas.addEventListener("mousedown", e => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (t.hologramModeActive && e.button === 0) {
        const compKey = raycastHologramComponent(t, mouse, camera);
        t._holoPointerDown = compKey
          ? { x: e.clientX, y: e.clientY, compKey }
          : null;
        if (compKey) {
          startHologramDrag(t, compKey, mouse, camera);
          t.setHoloDragging?.(true);
          orb.lx = e.clientX; orb.ly = e.clientY;
          return;
        }
      } else {
        t._holoPointerDown = null;
      }

      if (!mouseOverEngine && !t.hologramModeActive) return;
      if (e.button === 0) orb.drag = true;
      if (e.button === 2) orb.pan = true;
      orb.lx = e.clientX; orb.ly = e.clientY;
    });
    window.addEventListener("mouseup", (e) => {
      if (t.hologramModeActive && t._holoPointerDown?.compKey) {
        const moved = Math.hypot(
          e.clientX - t._holoPointerDown.x,
          e.clientY - t._holoPointerDown.y,
        );
        if (moved < 6) {
          selectHologramPart(t, t._holoPointerDown.compKey);
        }
      }
      t._holoPointerDown = null;
      if (t.holoDrag) endHologramDrag(t);
      t.setHoloDragging?.(false);
      orb.drag = false; orb.pan = false;
    });
    canvas.addEventListener("mousemove", e => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (t.holoDrag) {
        updateHologramDrag(t, mouse, camera);
        orb.lx = e.clientX; orb.ly = e.clientY;
        return;
      }

      raycaster.setFromCamera(mouse, camera);
      const engineHits = t.engineMeshArray?.length
        ? raycaster.intersectObjects(t.engineMeshArray, true)
        : [];
      mouseOverEngine = engineHits.length > 0 || t.hologramModeActive;
      t.mouseOverEngine = mouseOverEngine;

      if (t.hologramModeActive && !orb.drag && !orb.pan) {
        const hoverKey = raycastHologramComponent(t, mouse, camera);
        if (hoverKey && hoverKey !== t.holoSelectedPart) {
          canvas.style.cursor = "grab";
        } else if (t.holoDrag) {
          canvas.style.cursor = "grabbing";
        } else {
          canvas.style.cursor = mouseOverEngine ? "grab" : "default";
        }
      }

      if (orb.drag) {
        orb.theta -= (e.clientX - orb.lx) * 0.006;
        orb.phi = Math.max(0.08, Math.min(Math.PI - 0.08, orb.phi + (e.clientY - orb.ly) * 0.006));
      }
      if (orb.pan) {
        const right = new THREE.Vector3().crossVectors(camera.getWorldDirection(new THREE.Vector3()), camera.up).normalize();
        orb.tx -= right.x * (e.clientX - orb.lx) * 0.006;
        orb.ty += (e.clientY - orb.ly) * 0.006;
        orb.tz -= right.z * (e.clientX - orb.lx) * 0.006;
      }
      orb.lx = e.clientX; orb.ly = e.clientY;

      if (tooltipRef.current) {
        tooltipRef.current.style.left = (e.clientX - rect.left + 16) + "px";
        tooltipRef.current.style.top = (e.clientY - rect.top - 10) + "px";
      }
      setSensorTooltipPos({ x: e.clientX, y: e.clientY });
    });

    canvas.addEventListener("click", (e) => {
      if ((!t.showSensorDots && !t.showAllSensors) || !t.sensorDotArray?.length) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const hitKey = raycastSensorDots(t, mouse, camera);
      if (hitKey) {
        t.onSensorDotClick?.(hitKey);
      }
    });

    canvas.addEventListener("contextmenu", e => e.preventDefault());

    let lastLayoutW = 0;
    let lastLayoutH = 0;
    const resize = () => {
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (Math.abs(w - lastLayoutW) >= 20 || Math.abs(h - lastLayoutH) >= 20) {
        lastLayoutW = w;
        lastLayoutH = h;
        t.bumpAllSensorLayout?.();
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // Clock
    const clock = new THREE.Clock();

    // Store refs (engine content mounted in separate effect)
    Object.assign(t, {
      renderer, scene, camera, clock, orb,
      raycaster, mouse, hoveredSensor: null,
      sVals: {}, shapVals: {}, sStates: {}, activeLeakClass: null,
      pSpeed: 1, egrFlow: 45,
      intakeFlowModifier: 1, exhaustFlowModifier: 1, egrFlowModifier: 1,
      colourLerpProgress: 1, heatGlowActive: false,
      setZoneLabelPositions,
      baselines,
      _lastOrbKey: "",
      notifyCameraChange: null,
      showEnginePartLabels: true,
      showShapLabels: false,
      showSensorDots: false,
      showAllSensors: false,
      mouseOverEngine: false,
      setSensorDotLabels,
      setAllSensorLabels,
      setAllSensorViewport,
      setGnnLabels,
      setHoveredSensorKey,
      setHoloSelectedPart,
      hologramModeActive: false,
      holoDrag: null,
      holoSelectedPart: null,
      engineMeshArray: [],
    });

    // Animation loop
    let animId;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (document.hidden) return;
      const dt = clock.getDelta(), elapsed = clock.getElapsedTime();

      // Camera
      const sp = Math.sin(orb.phi);
      camera.position.set(orb.tx + orb.r * sp * Math.sin(orb.theta), orb.ty + orb.r * Math.cos(orb.phi), orb.tz + orb.r * sp * Math.cos(orb.theta));
      camera.lookAt(orb.tx, orb.ty, orb.tz);

      const orbKey = `${orb.theta.toFixed(4)}|${orb.phi.toFixed(4)}|${orb.r.toFixed(3)}|${orb.tx}|${orb.ty}|${orb.tz}`;
      if (orbKey !== t._lastOrbKey) {
        t._lastOrbKey = orbKey;
        t.notifyCameraChange?.();
      }

      const eng = t.eng;
      const sensorDefs = t.sensorDefs || [];
      const zoneAnchors = t.zoneAnchors || [];

      // Project zone anchors to 2D screen
      const W = container.clientWidth;
      const H = container.clientHeight;
      const projVec = new THREE.Vector3();

      const zoneProjected = zoneAnchors.map(z => {
        if (z.id === "zone_scr" && t.showScrZones === false) return null;
        projVec.set(z.pos[0], z.pos[1], z.pos[2]);
        const ndc = projVec.clone().project(camera);
        if (ndc.z > 1) return null;
        const anchorX = (ndc.x + 1) / 2 * W;
        const anchorY = (-ndc.y + 1) / 2 * H;
        if (anchorX < -60 || anchorX > W + 60 || anchorY < -60 || anchorY > H + 60) return null;
        const dx = anchorX - W * 0.5;
        const dy = anchorY - H * 0.5;
        const dist = Math.hypot(dx, dy) || 1;
        const push = 42;
        const ZONE_BIAS = {
          zone_block: { x: 0, y: 36 },
          zone_egr: { x: -52, y: -32 },
          zone_cac: { x: 0, y: -18 },
        };
        const bias = ZONE_BIAS[z.id] || { x: 0, y: 0 };
        return {
          id: z.id, label: z.label, sub: z.sub, col: z.col,
          x: anchorX + (dx / dist) * push + bias.x,
          y: anchorY + (dy / dist) * push + bias.y,
          anchorX, anchorY,
        };
      }).filter(Boolean);

      if (!t._labelTick) t._labelTick = 0;
      t._labelTick++;
      const labelInterval = t.hologramModeActive ? 10 : 12;
      if (t._labelTick % labelInterval === 0) {
        if ((t.showEnginePartLabels || t.showShapLabels) && t.setZoneLabelPositions) {
          const resolved = resolveZoneOverlaps(zoneProjected.map((z) => ({
            ...z,
            x: z.x + (z.offsetX ?? 0),
            y: z.y + (z.offsetY ?? 0),
          })));
          const mapped = resolved.map((z) => ({
            ...z,
            x: z.x,
            y: z.y,
          }));
          const labelJson = JSON.stringify(mapped);
          if (labelJson !== t._lastLabelJson) {
            t._lastLabelJson = labelJson;
            t.setZoneLabelPositions(mapped);
          }
        } else if (t.setZoneLabelPositions && t._lastLabelJson !== "[]") {
          t._lastLabelJson = "[]";
          t.setZoneLabelPositions([]);
        }
        if ((t.showSensorDots || t.showAllSensors) && t.setHoveredSensorKey && !t.shapModeActive) {
          const hKey = t.mouse.x > -2 ? raycastSensorDots(t, t.mouse, camera) : null;
          if (hKey !== t._hoveredSensorKey) {
            t._hoveredSensorKey = hKey;
            t.setHoveredSensorKey(hKey);
          }
        }
        if (t.showAllSensors && t.setAllSensorLabels && !t.shapModeActive) {
          const labels = projectSensorDotLabels(t, camera, W, H, t.sVals, t.baselines, {
            selectedKey: t._selectedSensorKey,
            showAll: true,
          });
          t.setAllSensorLabels(labels);
          t.setAllSensorViewport?.({ width: W, height: H });
        } else if (t.setAllSensorLabels) {
          t.setAllSensorLabels([]);
        }
        if (t.showSensorDots && !t.showAllSensors && t.setSensorDotLabels && t.sVals && !t.shapModeActive) {
          const labels = projectSensorDotLabels(t, camera, W, H, t.sVals, t.baselines, {
            hoveredKey: t._hoveredSensorKey,
            selectedKey: t._selectedSensorKey,
            showAll: false,
          });
          t.setSensorDotLabels(labels);
        } else if (t.setSensorDotLabels) {
          t.setSensorDotLabels([]);
        }
        if (t.gnnModeActive && t.setGnnLabels && t.sVals) {
          t.setGnnLabels(projectGnnLabels(t, camera, W, H, t.sVals));
        }
      }

      if (sensorNodesActive && t.sensorDots?.length) {
        tickSensorDots(t, camera, elapsed, {
          hoveredSensorKey: t._hoveredSensorKey,
          selectedSensorKey: t._selectedSensorKey,
        });
      }

      if (t.gnnModeActive) tickGnnPulse(t, elapsed);

      if (!eng) {
        renderer.render(scene, camera);
        return;
      }

      // Turbo impeller
      const turboRef = t.turboRpmRef || 92000;
      const tRPM = t.sVals["Turbocharger_Speed_RPM"] || turboRef;
      if (eng.impeller) eng.impeller.rotation.z += dt * (tRPM / turboRef) * 22;

      // Pistons — stroke always runs; emissive pulse lighter in hologram
      const rpm = t.sVals["Engine_Speed_Actual_RPM"] || 1800;
      const stroke = t.pistonStroke ?? 0.28;
      const pistonPulse = 0.55 + Math.sin(elapsed * (rpm / 60) * Math.PI * 2) * (t.hologramModeActive ? 0.25 : 0.45);
      eng.pistons?.forEach(p => {
        p.position.y = p.userData.baseY + Math.sin(elapsed * (rpm / 60) * Math.PI * 2 + p.userData.phase) * stroke;
      });
      eng.pistonMats?.forEach((m, idx) => {
        if (m.emissiveIntensity != null) {
          const base = t.hologramModeActive ? 0.55 : (idx % 3 === 0 ? 0.9 : 1.2);
          m.emissiveIntensity = base + pistonPulse * (t.hologramModeActive ? 0.35 : 0.6);
        }
      });

      // Raycaster hover — legacy sensor spheres (skip when dot overlay active)
      if (!t.showSensorDots && !t.showAllSensors && t.mouse.x > -2) {
        t.raycaster.setFromCamera(t.mouse, camera);
        const intersects = t.raycaster.intersectObjects(t.sensorMeshArray || [], false);
        const prev = t.hoveredSensor;
        if (intersects.length > 0) {
          const hit = intersects[0].object;
          const sd = hit.userData?.s;
          if (sd) {
            t.hoveredSensor = sd.id;
            if (tooltipRef.current) {
              const val = t.sVals[sd.id];
              const shapVal = t.shapVals[sd.id] || 0;
              const base = t.baselines?.[sd.id];
              const devPct = base ? (((val || 0) - base) / Math.abs(base) * 100).toFixed(1) : "—";
              const fmt = formatSensorValue(sd.id, val, sd.unit);
              const baseFmt = base != null ? formatSensorValue(sd.id, base, sd.unit) : null;
              const compKey = SENSOR_DEFINITIONS[sd.id]?.component;
              const accent = compKey ? (COMPONENT_COLOURS[compKey] ?? "#00c8ff") : "#00c8ff";
              const accentSoft = `${accent}99`;
              const isFaultSensor = sd.id === t.faultySensorKey && t.sfiFaultExplanation;
              tooltipRef.current.innerHTML = isFaultSensor
                ? `
                <div style="font-weight:bold;color:#f59e0b;margin-bottom:4px;font-size:13px">${sd.label}</div>
                <div style="font-size:12px;margin:2px 0"><span style="color:#fbbf2499">Value:</span> <span style="color:#fff;font-weight:bold">${fmt.valueText}${fmt.unitText ? ` ${fmt.unitText}` : ""}</span></div>
                ${baseFmt ? `<div style="font-size:11px;margin:2px 0"><span style="color:#fbbf2499">Baseline:</span> <span style="color:#94a3b8">${baseFmt.valueText}${baseFmt.unitText ? ` ${baseFmt.unitText}` : ""}</span></div>
                <div style="font-size:11px;margin:2px 0"><span style="color:#fbbf2499">Deviation:</span> <span style="color:#ef4444;font-weight:bold">${devPct}%</span></div>` : ""}
                <div style="font-size:10px;margin:4px 0;color:#fde68a;line-height:1.45"><strong style="color:#fbbf24">Why SFI flagged:</strong> ${t.sfiFaultExplanation.shortDetail}</div>
                <div style="color:#fbbf2488;font-size:9px;margin-top:4px">Hardware fault — not a leak</div>
              `
                : `
                <div style="font-weight:bold;color:${accent};margin-bottom:4px;font-size:13px">${sd.label}</div>
                <div style="font-size:12px;margin:2px 0"><span style="color:${accentSoft}">Value:</span> <span style="color:#fff;font-weight:bold">${fmt.valueText}${fmt.unitText ? ` ${fmt.unitText}` : ""}</span></div>
                ${baseFmt ? `<div style="font-size:11px;margin:2px 0"><span style="color:${accentSoft}">Baseline:</span> <span style="color:#94a3b8">${baseFmt.valueText}${baseFmt.unitText ? ` ${baseFmt.unitText}` : ""}</span></div>
                <div style="font-size:11px;margin:2px 0"><span style="color:${accentSoft}">Deviation:</span> <span style="color:${Math.abs(parseFloat(devPct)) > 5 ? '#ef4444' : '#22c55e'};font-weight:bold">${devPct}%</span></div>` : ""}
                <div style="font-size:11px;margin:2px 0"><span style="color:${accentSoft}">SHAP Impact:</span> <span style="color:${(shapVal ?? 0) > 0.1 ? '#f59e0b' : '#22c55e'};font-weight:bold">${(shapVal ?? 0).toFixed(4)}</span></div>
                <div style="color:${accentSoft};font-size:9px;margin-top:4px">${sd.group}</div>
              `;
              tooltipRef.current.style.borderColor = isFaultSensor ? "rgba(245,158,11,0.45)" : `${accent}44`;
              tooltipRef.current.style.display = "block";
            }
          }
        } else {
          t.hoveredSensor = null;
          if (tooltipRef.current && prev) tooltipRef.current.style.display = "none";
        }
      }

      // SHAP-driven sensor spheres
      sensorDefs.forEach(s => {
        const mesh = t.sensorMeshes[s.id]; if (!mesh) return;
        const shapVal = t.shapVals[s.id] || 0;
        const maxShap = t._maxShap || 0.5;
        const shapNorm = Math.min(1, shapVal / (maxShap || 0.5));

        // Continuous color: cyan → amber → red
        const col = shapToColor(shapNorm);
        mesh.material.color.setHex(col);
        mesh.material.emissive.setHex(col);

        // Continuous size: 1.0x → 2.5x
        const baseScale = 1.0 + shapNorm * 1.5;
        const pulse = shapNorm > 0.2 ? Math.sin(elapsed * Math.PI * (3 + shapNorm * 6)) * shapNorm * 0.3 : 0;
        mesh.scale.setScalar(baseScale + pulse);

        // Emissive intensity
        mesh.material.emissiveIntensity = 0.3 + shapNorm * 2.0;

        // Halo light
        const hl = mesh.userData.haloLight;
        if (hl) {
          hl.color.setHex(col);
          hl.intensity = 0.15 + shapNorm * 1.5;
        }

        // Highlight hovered sensor
        if (t.hoveredSensor === s.id) {
          mesh.scale.setScalar(Math.max(mesh.scale.x, 1.8));
          mesh.material.emissiveIntensity = 3.0;
        }
      });

      // Particles — skip in hologram mode for performance
      if (!t.hologramModeActive) {
      const boostMult = t.boostFactor || 1;
      const loadMult = t.loadFactor || 0.75;
      const iSpd = t.pSpeed * 1.9 * boostMult * 0.044;
      const eSpd = t.pSpeed * 2.2 * (0.5 + loadMult * 0.8) * 0.044;
      const gSpd = (t.egrFlow / 100) * 1.2 * 0.044;

      const intakeActive = getActiveIntakeParticleCount(t);
      const exhaustActive = getActiveExhaustParticleCount(t);
      const egrActive = getActiveEgrParticleCount(t);

      if (t.intakePts.visible) {
        const pos = t.intakePts.geometry.attributes.position.array;
        for (let i = 0; i < t.intakeCount; i++) {
          if (i >= intakeActive) {
            pos[i * 3] = -999; pos[i * 3 + 1] = -999; pos[i * 3 + 2] = -999;
            continue;
          }
          t.iOff[i] = (t.iOff[i] + dt * iSpd) % 1;
          const pt = t.intakeCurves[t.iSeg[i]].getPointAt(t.iOff[i]);
          pos[i * 3] = pt.x; pos[i * 3 + 1] = pt.y; pos[i * 3 + 2] = pt.z;
        }
        t.intakePts.geometry.attributes.position.needsUpdate = true;
      }
      if (t.exhaustPts.visible) {
        const pos = t.exhaustPts.geometry.attributes.position.array;
        for (let i = 0; i < t.exhaustCount; i++) {
          if (i >= exhaustActive) {
            pos[i * 3] = -999; pos[i * 3 + 1] = -999; pos[i * 3 + 2] = -999;
            continue;
          }
          t.eOff[i] = (t.eOff[i] + dt * eSpd) % 1;
          const pt = t.exhaustCurves[t.eSeg[i]].getPointAt(t.eOff[i]);
          pos[i * 3] = pt.x; pos[i * 3 + 1] = pt.y; pos[i * 3 + 2] = pt.z;
        }
        t.exhaustPts.geometry.attributes.position.needsUpdate = true;
      }
      if (t.egrPts?.visible && t.gOff) {
        const pos = t.egrPts.geometry.attributes.position.array;
        for (let i = 0; i < t.gOff.length; i++) {
          if (i >= egrActive) {
            pos[i * 3] = -999; pos[i * 3 + 1] = -999; pos[i * 3 + 2] = -999;
            continue;
          }
          t.gOff[i] = (t.gOff[i] + dt * gSpd) % 1;
          const pt = t.egrCurve.getPointAt(t.gOff[i]);
          pos[i * 3] = pt.x; pos[i * 3 + 1] = pt.y; pos[i * 3 + 2] = pt.z;
        }
        t.egrPts.geometry.attributes.position.needsUpdate = true;
      }
      }

      // GNN legacy lines hidden when new overlay active
      if (t.gnnLines && t.gnnLines.visible && !t.gnnModeActive) {
        t.gnnLines.material.opacity = 0.65 + Math.sin(elapsed * Math.PI * 0.55) * 0.2;
        const anyA = GNN_EDGES.some(([a, b]) => (t.shapVals[a] || 0) > 0.1 || (t.shapVals[b] || 0) > 0.1);
        t.gnnLines.material.color.setHex(anyA ? 0xff6b35 : 0x00ddff);
      }

      // Leak FX — primary (red) + secondary (purple) pulse rings
      if (t.activeLeakClass && t.activeLeakClass !== "None") {
        t.leakSphere.material.opacity = 0.45 + Math.sin(elapsed * Math.PI * 5) * 0.35;
        t.leakRings.forEach(lr => {
          lr.phase = (lr.phase + 0.0025) % 1;
          lr.ring.scale.setScalar(0.5 + lr.phase * 12);
          lr.rm.opacity = (1 - lr.phase) * 0.88;
        });
      }
      if (t.activeSecondaryLeakClass && t.activeSecondaryLeakClass !== "None" && t.secondaryLeakSphere) {
        t.secondaryLeakSphere.material.opacity = 0.4 + Math.sin(elapsed * Math.PI * 4 + 1.2) * 0.35;
        t.secondaryLeakRings?.forEach(lr => {
          lr.phase = (lr.phase + 0.003) % 1;
          lr.ring.scale.setScalar(0.45 + lr.phase * 10);
          lr.rm.opacity = (1 - lr.phase) * 0.8;
        });
      }

      if (!t.hologramModeActive) {
      tickLeakPropagation(t, dt, elapsed);
      }
      if (t.shapModeActive) tickShapPulse(t, elapsed);
      if (t.hologramModeActive) {
        if (t.holoDrag) updateHologramDrag(t, t.mouse, camera, dt);
        tickHologramFx(t, elapsed, dt);
      }

      // Leak physics — escape particles, colour lerp, heat glow
      if (t.scene?.userData?.escapeEmitter) {
        updateEscapeParticles(t.scene.userData.escapeEmitter, dt, elapsed);
      }
      if (t.scene?.userData?.secondaryEscapeEmitter) {
        updateEscapeParticles(t.scene.userData.secondaryEscapeEmitter, dt, elapsed);
      }
      if (t.colourLerpProgress < 1.0) {
        t.colourLerpProgress += 0.016;
        updateParticleColourLerp(t, t.colourLerpProgress);
      }
      if (t.heatGlowActive) {
        updateHeatGlow(t, elapsed);
      }
      tickGapIndicator(t, elapsed);

      // Scan rings
      eng.scanRings?.forEach((rm, i) => { rm.opacity = Math.max(0, (0.05 - i * 0.013) + Math.sin(elapsed * Math.PI * 0.32 + i) * 0.022); });

      renderer.render(scene, camera);
    };
    animate();

    mountEngineContent(t, layoutRef.current, { intakeOn: true, exhaustOn: true });
    updateSceneMaterials(t.scene, document.documentElement.getAttribute("data-theme") || "dark", t);
    t.engineMeshArray = collectEngineMeshes(t);
    resize();

    t.animId = animId;
    setSceneReady((n) => n + 1);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(animId);
      canvas.removeEventListener("wheel", onWheel);
      clearLeakPropagation(t);
      clearLeakPhysics(t);
      clearShapMode(t);
      if (t.contentGroup) {
        disposeObject3D(t.contentGroup);
        t.scene?.remove(t.contentGroup);
      }
      renderer.dispose();
      scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) { if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose()); else obj.material.dispose(); }
      });
      Object.assign(t, {
        renderer: null, scene: null, camera: null, clock: null,
        contentGroup: null, eng: null, sensorMeshes: null, sensorMeshArray: null,
        layoutId: null,
      });
      setSceneReady(0);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mount / remount engine geometry when engine family changes ──
  useEffect(() => {
    const t = threeRef.current;
    if (!sceneReady || !t.scene) return;

    mountEngineContent(t, layout, { intakeOn, exhaustOn });
    updateSceneMaterials(t.scene, theme, t);
    t.engineMeshArray = collectEngineMeshes(t);
    if (gnnOn) {
      mountGnnOverlay(t, sensorData, baselines, shapData);
      t.gnnModeActive = true;
    } else if (sensorNodesActive) {
      mountSensorDots(t, sensorData, baselines);
      updateSensorDotColors(t, sensorData, baselines, faultySensorKey);
    }
    t.showScrZones = hasScr;
    if (t.eng?.scrPart) t.eng.scrPart.visible = hasScr;

    // Restore UI toggles after rebuild (toggle effects won't re-fire on layout change)
    if (t.gnnLines) t.gnnLines.visible = gnnOn;
    if (t.intakePts) t.intakePts.visible = intakeOn;
    if (t.exhaustPts) t.exhaustPts.visible = exhaustOn;
    if (t.egrPts) t.egrPts.visible = egrOn;
    t.eng?.flowGlowMeshes?.intake?.forEach((mesh) => { mesh.visible = !intakeOn; });
    t.eng?.flowGlowMeshes?.exhaust?.forEach((mesh) => { mesh.visible = !exhaustOn; });
    if (t.eng?.egrGroup) t.eng.egrGroup.forEach((g) => { g.visible = egrOn; });

    const MCFG = {
      ext:  { solid: 0.95, wire: 0.00, interior: 0.00, glow: 0.22 },
      cut:  { solid: 0.45, wire: 0.42, interior: 0.90, glow: 0.45 },
      xray: { solid: 0.22, wire: 0.92, interior: 0.42, glow: 0.48 },
    };
    const cfg = MCFG[viewMode];
    if (t.eng && cfg) {
      t.eng.solidMats.forEach((m) => { m.opacity = cfg.solid; });
      t.eng.wireMats.forEach((m) => { m.opacity = cfg.wire; });
      t.eng.interiorMats.forEach((m) => { m.opacity = cfg.interior; });
      t.eng.flowGlowMats.forEach((m) => { m.opacity = cfg.glow; });
      t.eng.pistonMats?.forEach((m) => {
        m.opacity = viewMode === "xray" ? 0.95 : 1.0;
        if (m.emissiveIntensity != null) m.emissiveIntensity = viewMode === "xray" ? 1.4 : 1.0;
      });
    }
    if (t.scene?.fog) {
      t.scene.fog.density = viewMode === "xray" ? 0.00035 : 0.002;
    }

    if (viewMode === "holo") {
      enterHologramMode(t);
      applyHologramFromPrediction(t, prediction, { resetFirst: false }, activeScenario, faultCtx);
      holoScenarioKeyRef.current = predictionKey;
    }

    const orbitR = layout.cameraOrbitR ?? 16;
    if (t.orb) t.orb.r = orbitR;
    setEngineZoom(orbitR);
    refreshScreenAnchors();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- toggles restored from closure on layout/scene remount only
  }, [sceneReady, layout.id, hasScr, refreshScreenAnchors]);

  // ── Apply data from props into Three.js scene ────────────
  useEffect(() => {
    const t = threeRef.current;
    if (!t.sensorMeshes || !t.sensorDefs || !sensorData) return;

    // Update sensor values
    t.sVals = sensorData;

    // Flow speed scales with RPM — higher RPM = faster particle flow
    const rpm = sensorData["Engine_Speed_Actual_RPM"] || 1800;
    t.pSpeed = rpm / 2500;

    // Load affects exhaust flow intensity (higher load = more exhaust volume)
    const loadPct = sensorData["Engine_Load_Actual_Pct"] || 75;
    t.loadFactor = loadPct / 100;

    // Boost pressure affects intake flow intensity
    const boostP = sensorData["Boost_Pressure_kPa"] || 200;
    t.boostFactor = Math.min(1.5, boostP / 200);

    // EGR flow
    t.egrFlow = sensorData["EGR_Flow_Rate_kgph"] || 45;

    // Blip size scales gently with operating point — stays sparse, never washes out pipes
    if (t.intakePts?.material) {
      t.intakePts.material.opacity = 0.92;
      t.intakePts.material.size = 0.09 + t.pSpeed * 0.04;
    }
    if (t.exhaustPts?.material) {
      t.exhaustPts.material.opacity = 0.92;
      t.exhaustPts.material.size = 0.09 + t.loadFactor * 0.04;
    }

    // SHAP importances — merge per-location drivers from backend when multi-leak
    const shapVals = {};
    t.sensorDefs.forEach((s) => { shapVals[s.id] = 0; });
    const activeLeaks = stabilizeActiveLeaks(prediction, activeScenario);
    const shapRows = activeLeaks.length
      ? activeLeaks.flatMap((l) => l.top_5_sensors_driving_prediction || [])
      : (prediction?.top_5_sensors_driving_prediction || []);
    shapRows.forEach((entry) => {
      if (entry.sensor in shapVals) {
        shapVals[entry.sensor] = Math.max(
          shapVals[entry.sensor],
          Math.abs(Number(entry.shap_impact) || 0)
        );
      }
    });
    t.shapVals = shapVals;

    // Compute max SHAP for normalization
    const allShap = Object.values(shapVals);
    t._maxShap = Math.max(0.1, ...allShap);

    // Leak indicators — always show both active locations when multi-leak
    const multi = multiPattern ?? prediction?.Multi_Pattern ?? null;
    const primaryLoc = activeLeaks[0]?.location
      || (prediction?.Leak_Present === 1 ? (prediction.Leak_Location || "None") : "None");
    const secondaryLoc = activeLeaks[1]?.location
      || (multi?.is_multi_leak ? (multi.secondary_location || null) : null);
    const markerKey = `${primaryLoc}|${secondaryLoc || "None"}`;
    if (markerKey !== t.activeLeakMarkerKey) {
      updateLeakMarkers(t, primaryLoc, secondaryLoc);
    }
  }, [sensorData, prediction, multiPattern, activeScenario]);

  // ── Leak propagation (downstream glow + upstream pulse) ──
  useEffect(() => {
    const t = threeRef.current;
    if (!t.componentMeshes) return;

    const present = prediction?.Leak_Present === 1 && !prediction?.Suppressed;
    const activeLeaks = stabilizeActiveLeaks(prediction, activeScenario);
    const location = present ? (prediction?.Leak_Location || "Normal") : "Normal";
    const severity = activeLeaks[0]?.severity || prediction?.Leak_Severity || "Moderate";
    const secondary = activeLeaks[1] || null;
    const prev = prevLeakRef.current;

    if (present && location !== "None" && location !== "Normal") {
      const propKey = secondary?.location
        ? `${location}|${secondary.location}|${severity}|${secondary.severity}`
        : `${location}|${severity}`;
      const prevKey = prev.secondary
        ? `${prev.location}|${prev.secondary}|${prev.severity}|${prev.secondarySeverity}`
        : `${prev.location}|${prev.severity}`;

      if (!prev.present || propKey !== prevKey) {
        if (secondary?.location) {
          applyMultiLeakPropagation(
            t,
            location,
            severity,
            secondary.location,
            secondary.severity || "Moderate"
          );
        } else {
          applyLeakPropagation(t, location, severity);
        }
      }
    } else if (prev.present || t.propagationAffectedMeshes?.length) {
      clearLeakPropagation(t);
    }

    prevLeakRef.current = {
      present,
      location,
      severity,
      secondary: secondary?.location || null,
      secondarySeverity: secondary?.severity || null,
    };
  }, [prediction, sceneReady, layout.id, activeScenario]);

  // ── Leak physics particles (escape + flow modifiers) ──
  useEffect(() => {
    const t = threeRef.current;
    if (!t.scene) return;

    const present = prediction?.Leak_Present === 1 && !prediction?.Suppressed;
    const activeLeaks = stabilizeActiveLeaks(prediction, activeScenario);
    const location = present ? (prediction?.Leak_Location || "Normal") : "Normal";
    const severity = activeLeaks[0]?.severity || prediction?.Leak_Severity || "Moderate";
    const secondary = activeLeaks[1] || null;
    const prev = prevLeakPhysicsRef.current;

    if (present && location !== "None" && location !== "Normal") {
      if (
        !prev.present ||
        prev.location !== location ||
        prev.severity !== severity ||
        prev.secondary !== secondary?.location
      ) {
        applyLeakPhysics(t, location, severity);
        if (secondary?.location) {
          applySecondaryLeakPhysics(t, secondary.location, secondary.severity || "Moderate");
        } else {
          clearSecondaryLeakPhysics(t);
        }
      }
    } else if (prev.present || t.activeLeakPhysicsScenario) {
      clearLeakPhysics(t);
      clearSecondaryLeakPhysics(t);
    }

    prevLeakPhysicsRef.current = {
      present,
      location,
      severity,
      secondary: secondary?.location || null,
    };
  }, [prediction, sceneReady, layout.id, activeScenario]);

  // ── SHAP overlay mode ──
  const shapDataKey = useMemo(() => JSON.stringify(shapData), [shapData]);

  useEffect(() => {
    const t = threeRef.current;
    if (!t.componentMeshes) return;

    const flowModeActive = gnnOn;
    if (!shapModeOn || flowModeActive) {
      if (t.shapModeActive) {
        clearShapMode(t);
        prevShapKeyRef.current = "";
      }
      if (t._lastLeakPropagation?.leakLocation) {
        const { leakLocation, severity } = t._lastLeakPropagation;
        applyLeakPropagation(t, leakLocation, severity);
      }
      return;
    }

    if (!t.shapModeActive || shapDataKey !== prevShapKeyRef.current) {
      applyShapMode(t, shapData);
      prevShapKeyRef.current = shapDataKey;
      if (t._lastLeakPropagation?.leakLocation) {
        const { leakLocation, severity } = t._lastLeakPropagation;
        applyLeakPropagation(t, leakLocation, severity);
      }
    }
  }, [shapModeOn, shapDataKey, gnnOn, sceneReady, layout.id]);

  useEffect(() => {
    const t = threeRef.current;
    if (t) t.baselines = baselines;
  }, [baselines]);

  useEffect(() => {
    const t = threeRef.current;
    if (t.eng?.scrPart) t.eng.scrPart.visible = hasScr;
    if (t) t.showScrZones = hasScr;
  }, [hasScr]);

  // ── View mode switching ──────────────────────────────────
  useEffect(() => {
    const t = threeRef.current;
    if (!t.eng) return;

    if (viewMode === "holo") {
      if (!t.hologramModeActive) {
        try {
          enterHologramMode(t);
          applyHologramFromPrediction(t, prediction, { resetFirst: false }, activeScenario, faultCtx);
          holoScenarioKeyRef.current = predictionKey;
        } catch (err) {
          console.error("[DigitalTwin] hologram mode failed:", err);
        }
      }
      return;
    }

    holoScenarioKeyRef.current = null;

    if (t.hologramModeActive) exitHologramMode(t);

    const MCFG = {
      ext:  { solid: 0.95, wire: 0.00, interior: 0.00, glow: 0.22 },
      cut:  { solid: 0.45, wire: 0.42, interior: 0.90, glow: 0.45 },
      xray: { solid: 0.22, wire: 0.92, interior: 0.42, glow: 0.48 },
    };
    const cfg = MCFG[viewMode];
    if (!cfg) return;
    t.eng.solidMats.forEach(m => { m.opacity = cfg.solid; });
    t.eng.wireMats.forEach(m => { m.opacity = cfg.wire; });
    t.eng.interiorMats.forEach(m => { m.opacity = cfg.interior; });
    t.eng.flowGlowMats.forEach(m => { m.opacity = cfg.glow; });
    if (t.scene?.fog) {
      t.scene.fog.density = viewMode === "xray" ? 0.00035 : 0.002;
    }
    t.eng.pistonMats?.forEach(m => {
      m.opacity = viewMode === "xray" ? 0.95 : 1.0;
      if (m.emissiveIntensity != null) m.emissiveIntensity = viewMode === "xray" ? 1.4 : 1.0;
    });
  }, [viewMode, sceneReady, layout.id, prediction?.Leak_Location, prediction?.Leak_Present]);

  useEffect(() => {
    const t = threeRef.current;
    if (viewMode !== "holo" || !t.hologramModeActive) return;
    if (holoScenarioKeyRef.current === predictionKey) return;

    setHoloSelectedPart(null);
    setHoloDragging(false);
    const isScenarioSwitch = holoScenarioKeyRef.current !== null;
    holoScenarioKeyRef.current = predictionKey;
    applyHologramFromPrediction(t, prediction, { resetFirst: isScenarioSwitch }, activeScenario, faultCtx);
  }, [viewMode, predictionKey, sceneReady, prediction?.Leak_Location, prediction?.Leak_Present, prediction?.Multi_Pattern, prediction?.Active_Leak_Details, prediction?.Sensor_Fault_Isolation, activeScenario, faultCtx]);

  // ── Toggle GNN (new node overlay) ─────────────────────────
  useEffect(() => {
    const t = threeRef.current;
    if (!t.contentGroup) return;

    if (gnnOn) {
      if (t.gnnLines) t.gnnLines.visible = false;
      clearSensorDots(t);
      setSensorMeshesVisible(t, false);
      mountGnnOverlay(t, sensorData, baselines, shapData);
      t.gnnModeActive = true;
    } else {
      clearGnnOverlay(t);
      t.gnnModeActive = false;
      if (t.gnnLines) t.gnnLines.visible = false;
      if (sensorNodesActive) {
        mountSensorDots(t, sensorData, baselines);
        updateSensorDotColors(t, sensorData, baselines, faultySensorKey);
      } else {
        setSensorMeshesVisible(t, true);
      }
    }
  }, [gnnOn, sceneReady, layout.id, sensorData, baselines, shapData, sensorNodesActive, faultySensorKey]);

  // ── Toggle flows ─────────────────────────────────────────
  useEffect(() => {
    const t = threeRef.current;
    if (t.intakePts) t.intakePts.visible = intakeOn;
    // Flow ON → hide pipe glow, show only blip particles
    t.eng?.flowGlowMeshes?.intake?.forEach((mesh) => { mesh.visible = !intakeOn; });
  }, [intakeOn]);
  useEffect(() => {
    const t = threeRef.current;
    if (t.exhaustPts) t.exhaustPts.visible = exhaustOn;
    t.eng?.flowGlowMeshes?.exhaust?.forEach((mesh) => { mesh.visible = !exhaustOn; });
  }, [exhaustOn]);
  useEffect(() => {
    const t = threeRef.current;
    if (t.egrPts) t.egrPts.visible = egrOn;
    if (t.eng?.egrGroup) t.eng.egrGroup.forEach(g => g.visible = egrOn);
  }, [egrOn]);

  useEffect(() => {
    if (shapModeOn) refreshScreenAnchors();
  }, [shapModeOn, refreshScreenAnchors]);

  useEffect(() => {
    if (!shapModeOn) setShowShapLabels(false);
  }, [shapModeOn]);

  useEffect(() => {
    const t = threeRef.current;
    if (t) {
      t.showEnginePartLabels = showEnginePartLabels;
      t.showShapLabels = showShapLabels;
    }
  }, [showEnginePartLabels, showShapLabels]);

  useEffect(() => {
    if (showShapLabels) refreshScreenAnchors();
  }, [showShapLabels, shapData, refreshScreenAnchors]);

  useEffect(() => {
    threeRef.current.notifyCameraChange = refreshScreenAnchors;
    return () => { threeRef.current.notifyCameraChange = null; };
  }, [refreshScreenAnchors]);

  useEffect(() => {
    if (showSensorPanels) refreshScreenAnchors();
  }, [showSensorPanels, sceneReady, refreshScreenAnchors]);

  useEffect(() => {
    const t = threeRef.current;
    if (!t.contentGroup || !t.sensorDefs) return;

    if (sensorNodesActive && !gnnOn) {
      setSensorMeshesVisible(t, false);
      mountSensorDots(t, sensorData, baselines);
      updateSensorDotColors(t, sensorData, baselines, faultySensorKey);
    } else if (!gnnOn) {
      clearSensorDots(t);
      setSensorMeshesVisible(t, true);
    }
    if (t) {
      t.showSensorDots = showSensorDots;
      t.showAllSensors = showAllSensors;
    }
  }, [sensorNodesActive, showSensorDots, showAllSensors, sceneReady, layout.id, gnnOn, sensorData, baselines, faultySensorKey]);

  useEffect(() => {
    if (!faultySensorKey) {
      prevFaultySensorRef.current = null;
      return;
    }
    setShowSensorDots(true);
    if (prevFaultySensorRef.current !== faultySensorKey) {
      prevFaultySensorRef.current = faultySensorKey;
      setSensorDetailDismissed(false);
      setSelectedSensorKey(faultySensorKey);
    }
  }, [faultySensorKey]);

  useEffect(() => {
    if (showAllSensors) setAllSensorLayoutKey((k) => k + 1);
  }, [showAllSensors, layout.id, viewMode]);

  useEffect(() => {
    threeRef.current.bumpAllSensorLayout = () => setAllSensorLayoutKey((k) => k + 1);
    return () => { threeRef.current.bumpAllSensorLayout = null; };
  }, []);

  useEffect(() => {
    const t = threeRef.current;
    if (t) {
      t._hoveredSensorKey = hoveredSensorKey;
      t._selectedSensorKey = selectedSensorKey;
      t.setHoloSelectedPart = setHoloSelectedPart;
      t.setHoloDragging = setHoloDragging;
    }
  }, [hoveredSensorKey, selectedSensorKey]);

  useEffect(() => {
    threeRef.current.onSensorDotClick = (key) => {
      toggleSensorDetail(key);
    };
    return () => { threeRef.current.onSensorDotClick = null; };
  }, [toggleSensorDetail]);

  useEffect(() => {
    const t = threeRef.current;
    if (!sensorNodesActive || !t.sensorDots?.length) return;
    updateSensorDotColors(t, sensorData, baselines, faultySensorKey);
  }, [sensorData, baselines, sensorNodesActive, faultySensorKey]);

  useEffect(() => {
    threeRef.current.faultySensorKey = faultySensorKey;
    threeRef.current.sfiFaultExplanation = sensorFaultExplanation;
  }, [faultySensorKey, sensorFaultExplanation]);

  // Derived data for the overlays
  const activeLeaks = stabilizeActiveLeaks(prediction, activeScenario);
  const leakClass = prediction?.Leak_Present === 1 ? prediction?.Leak_Location : "None";
  const secondaryLeakClass = activeLeaks[1]?.location || null;
  const leakOriginKey = leakClass !== "None" ? LEAK_ORIGIN_COMPONENT[leakClass] : null;
  const secondaryLeakOriginKey = secondaryLeakClass
    ? LEAK_ORIGIN_COMPONENT[secondaryLeakClass]
    : null;
  const primaryRca = multiRcaResults[0] || rcaResult;
  const secondaryRca = multiRcaResults[1] || null;
  const primaryShap = activeLeaks[0]?.top_5_sensors_driving_prediction || shapData;
  const secondaryShap = activeLeaks[1]?.top_5_sensors_driving_prediction || null;
  const isLeak = leakClass !== "None" && leakClass != null;
  const conf = prediction ? Math.min(100, Math.max(0, prediction.Confidence_Score * 100)) : 0;
  const rpmDisp = operatingPoint?.rpm || sensorData?.Engine_Speed_Actual_RPM || 0;
  const loadDisp = operatingPoint?.load || sensorData?.Engine_Load_Actual_Pct || 0;
  const ambPressDisp = operatingPoint?.ambientPressure || sensorData?.Ambient_Pressure_kPa || 101.3;



  // ── RENDER ───────────────────────────────────────────────
  const NAV_BTN = (onClick, children, radius = "") => (
    <button type="button" onClick={onClick} style={{
      width: 32, height: 28, background: "rgba(0,200,255,0.06)", border: "1px solid rgba(0,200,255,0.15)",
      borderRadius: radius, color: "rgba(0,200,255,0.6)", fontSize: 13, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s",
    }}>{children}</button>
  );
  const STEP_ORBIT = 0.25;
  const STEP_PAN = 0.8;
  const navMove = (fn) => { fn(); refreshScreenAnchors(); };

  return (
    <div ref={shellRef} className="twin-shell">
      <div className="twin-toolbar-dock">
        <div className="twin-toolbar-group twin-toolbar-group--views">
        {["ext", "cut", "xray", "holo"].map(m => (
          <button
            key={m}
            type="button"
            className={`twin-mode-btn ${viewMode === m ? "active" : ""} ${m === "holo" ? "holo" : ""}`}
            onClick={() => setViewMode(m)}
          >
            {m === "ext" ? "EXTERIOR" : m === "cut" ? "CUTAWAY" : m === "xray" ? "X-RAY" : "HOLOGRAM"}
          </button>
        ))}
        </div>

        <div className="twin-toolbar-sep" />

        <div className="twin-toolbar-group twin-toolbar-group--paths">
        <button type="button" className={`twin-mode-btn intake ${intakeOn ? "active" : ""}`} onClick={() => setIntakeOn(v => !v)}>● INTAKE</button>
        <button type="button" className={`twin-mode-btn exhaust ${exhaustOn ? "active" : ""}`} onClick={() => setExhaustOn(v => !v)}>● EXHAUST</button>
        <button type="button" className={`twin-mode-btn ${egrOn ? "active" : ""}`} onClick={() => setEgrOn(v => !v)}>EGR</button>
        <button type="button" className={`twin-mode-btn ${gnnOn ? "active" : ""}`} onClick={() => setGnnOn(v => !v)}>GNN</button>
        <button type="button" className={`twin-mode-btn ${shapModeOn ? "active" : ""}`} onClick={() => setShapModeOn((v) => !v)}>SHAP</button>
        </div>

        <div className="twin-toolbar-sep" />

        <div className="twin-toolbar-group twin-toolbar-group--labels">
        <button type="button" className={`twin-label-btn ${showEnginePartLabels ? "active" : ""}`} onClick={() => setShowEnginePartLabels((v) => !v)}>ENGINE PARTS</button>
        <button type="button" className={`twin-label-btn ${showSensorPanels ? "active" : ""}`} onClick={() => setShowSensorPanels((v) => !v)}>SENSORS</button>
        <button type="button" className={`twin-label-btn ${showSensorDots ? "active" : ""}`} onClick={() => setShowSensorDots((v) => {
          const next = !v;
          if (!next) setShowAllSensors(false);
          return next;
        })}>SENSOR DOTS</button>
        <button
          type="button"
          className={`twin-label-btn ${showAllSensors ? "active" : ""}`}
          onClick={() => {
            setShowAllSensors((v) => {
              const next = !v;
              if (next) setShowSensorDots(true);
              return next;
            });
          }}
        >ALL {activeSensorCount} SENSORS</button>
        <button
          type="button"
          className={`twin-label-btn ${showShapLabels ? "active" : ""}`}
          disabled={!shapModeOn}
          onClick={() => {
            setShowShapLabels((v) => {
              const next = !v;
              if (next) refreshScreenAnchors();
              return next;
            });
          }}
        >SHAP LABELS</button>
        <button
          type="button"
          className={`twin-label-btn ${allLabelsHidden ? "active" : ""}`}
          onClick={() => {
            if (allLabelsHidden) {
              setShowEnginePartLabels(true);
              setShowSensorPanels(false);
              setShowSensorDots(false);
              setShowAllSensors(false);
              setShowShapLabels(false);
            } else {
              setShowEnginePartLabels(false);
              setShowSensorPanels(false);
              setShowSensorDots(false);
              setShowAllSensors(false);
              setShowShapLabels(false);
            }
          }}
        >{allLabelsHidden ? "SHOW ALL" : "HIDE ALL"}</button>
        </div>

        <div className="twin-toolbar-spacer" />

        <div className="twin-toolbar-group twin-toolbar-group--aux">
        <button type="button" className="twin-aux-btn" onClick={() => {
          const t = threeRef.current;
          if (!t.orb) return;
          t.orb.theta = 0.42; t.orb.phi = 0.68; t.orb.r = 16.0; t.orb.tx = 0; t.orb.ty = 0.7; t.orb.tz = 0;
          setEngineZoom(16);
        }}>⟲ RESET</button>
        <button type="button" className={`twin-aux-btn ${isFullscreen ? "active" : ""}`} onClick={() => {
          const el = shellRef.current;
          if (!el) return;
          if (!document.fullscreenElement) {
            el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
          } else {
            document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
          }
        }}>{isFullscreen ? "⤓ EXIT" : "⤢ FULL"}</button>
        </div>
      </div>

      <div className={`twin-stage ${viewMode === "holo" ? "twin-stage--holo" : ""} ${viewMode === "holo" && holoSelectedPart ? "twin-stage--holo-analysis" : ""}`}>
        {viewMode === "holo" && (
          <aside className="twin-holo-sidebar">
            <HoloStatusStrip
              leakLocation={leakClass}
              secondaryLeakLocation={secondaryLeakClass}
              selectedPart={holoSelectedPart}
              hasScr={hasScr}
              faultCtx={faultCtx}
              sfiMeta={sfiMeta}
              onSelectPart={(key) => {
                const t = threeRef.current;
                selectHologramPart(t, key);
              }}
              onFaultCalloutClick={() => {
                if (faultySensorKey) openSensorDetail(faultySensorKey);
              }}
            />
          </aside>
        )}

        <div ref={containerRef} className="twin-viewport">
      <canvas ref={canvasRef} data-engine="true" style={{ display: "block", width: "100%", height: "100%" }} />

      <ComponentTooltip
        visible={hoveredComponent !== null}
        componentKey={hoveredComponent}
        position={tooltipPosition}
        liveReadings={sensorData}
        shapData={shapData}
        leakLocation={leakClass}
      />

      <div ref={tooltipRef} style={{
        display: "none", position: "absolute", zIndex: 60, pointerEvents: "none",
        background: "rgba(1,4,7,0.92)", border: "1px solid rgba(0,200,255,0.25)",
        borderRadius: 4, padding: "10px 16px", fontFamily: "'Share Tech Mono', monospace",
        fontSize: 12, color: "#e2e8f0", backdropFilter: "blur(8px)",
        boxShadow: "0 0 20px rgba(0,200,255,0.1)", maxWidth: 300, lineHeight: 1.6,
      }} />

      {showEnginePartLabels && (
        <div style={{ position: "absolute", inset: 0, bottom: 32, pointerEvents: "none", zIndex: shapModeOn ? 90 : 100 }}>
          {zoneLabelPositions
            .slice()
            .sort((a, b) => {
              const order = { zone_block: 99, zone_turbo: 50, zone_egr: 10 };
              return (order[a.id] ?? 30) - (order[b.id] ?? 30);
            })
            .map(({ id, label, sub, col, x, y, anchorX, anchorY }) => {
            const componentKey = ZONE_TO_COMPONENT[id];
            const isPrimaryOrigin = componentKey && componentKey === leakOriginKey;
            const isSecondaryOrigin = componentKey && secondaryLeakOriginKey
              && componentKey === secondaryLeakOriginKey
              && !isPrimaryOrigin;
            const isSensorFaultOrigin = componentKey && faultyComponentKey
              && componentKey === faultyComponentKey;
            const isLeakOrigin = isPrimaryOrigin || isSecondaryOrigin;
            const labelCol = isSensorFaultOrigin
              ? "#f59e0b"
              : isPrimaryOrigin
              ? "#E24B4A"
              : isSecondaryOrigin
                ? "#a855f7"
                : col;
            const lineLen = Math.hypot(anchorX - x, anchorY - y);
            const lineAngle = Math.atan2(anchorY - y, anchorX - x) * (180 / Math.PI);
            const labelInteractive = componentKey && !shapModeOn;
            const zIndex = id === "zone_block" ? 105 : id === "zone_egr" ? 98 : 100;
            return (
              <div
                key={id}
                className={`twin-zone-label-wrap${labelInteractive ? " twin-zone-label-wrap--interactive" : ""}`}
                style={{
                  position: "absolute", left: x, top: y,
                  pointerEvents: labelInteractive ? "auto" : "none",
                  opacity: shapModeOn ? 0.55 : 1,
                  zIndex,
                }}
                onMouseEnter={() => componentKey && setHoveredComponent(componentKey)}
                onMouseLeave={() => setHoveredComponent(null)}
                onMouseMove={(e) => setTooltipPosition({ x: e.clientX, y: e.clientY })}
                onClick={() => {
                  if (isSensorFaultOrigin && faultySensorKey) {
                    openSensorDetail(faultySensorKey);
                    return;
                  }
                  if (viewMode !== "holo" || !componentKey) return;
                  selectHologramPart(threeRef.current, componentKey);
                }}
              >
                <div style={{
                  position: "absolute", left: "50%", top: "50%", width: lineLen, height: 1,
                  background: `linear-gradient(to right, ${labelCol}cc, ${labelCol}22)`,
                  transformOrigin: "0 50%", transform: `rotate(${lineAngle}deg)`, opacity: 0.75,
                }} />
                <div
                  className="twin-zone-label-card"
                  style={{
                  position: "relative",
                  background: "linear-gradient(145deg, rgba(2,10,20,0.97), rgba(6,28,52,0.94))",
                  border: `1px solid ${isSensorFaultOrigin ? "#f59e0b" : isLeakOrigin ? "#E24B4A" : `${col}88`}`,
                  borderLeft: `3px solid ${labelCol}`,
                  borderRadius: 5, padding: "7px 12px 6px",
                  boxShadow: isSensorFaultOrigin
                    ? "0 0 12px rgba(245,158,11,0.45)"
                    : isLeakOrigin
                      ? "0 0 12px rgba(226,75,74,0.45)"
                      : `0 0 18px ${col}55, 0 6px 16px rgba(0,0,0,0.55)`,
                  minWidth: 96, textAlign: "left",
                }}>
                  {isSensorFaultOrigin && (
                    <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 6, letterSpacing: 1.5, color: "#f59e0b", marginBottom: 2, fontWeight: "bold" }}>⚡ SENSOR FAULT</div>
                  )}
                  {isPrimaryOrigin && (
                    <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 6, letterSpacing: 1.5, color: "#E24B4A", marginBottom: 2, fontWeight: "bold" }}>⚠ PRIMARY LEAK</div>
                  )}
                  {isSecondaryOrigin && (
                    <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 6, letterSpacing: 1.5, color: "#a855f7", marginBottom: 2, fontWeight: "bold" }}>⚠ SECONDARY LEAK</div>
                  )}
                  <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 6, letterSpacing: 2.2, color: `${labelCol}cc`, marginBottom: 3, fontWeight: "bold" }}>ENGINE PART</div>
                  <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 9.5, letterSpacing: 1.2, color: labelCol, textShadow: `0 0 10px ${labelCol}aa`, fontWeight: "bold", lineHeight: 1.2 }}>{label}</div>
                  <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 7.5, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{id === "zone_block" ? blockSubLabel : sub}</div>
                  {isSensorFaultOrigin && sensorFaultExplanation && (
                    <div style={{
                      fontFamily: "'Share Tech Mono', monospace",
                      fontSize: 7,
                      color: "rgba(253, 230, 138, 0.92)",
                      marginTop: 5,
                      lineHeight: 1.35,
                      maxWidth: 168,
                    }}>
                      {sensorFaultExplanation.shortDetail}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showShapLabels && shapModeOn && !gnnOn && shapZoneLabels.length > 0 && (
        <div style={{ position: "absolute", inset: 0, bottom: 32, pointerEvents: "none", zIndex: 120 }}>
          {shapZoneLabels.map(({ id, label, anchorX, anchorY, labelX, labelY, score }, idx) => {
            const isTop = idx === 0 || score >= 0.05;
            const posX = labelX ?? anchorX;
            const posY = (labelY ?? anchorY) - 22;
            return (
              <div
                key={`shap-${id}`}
                style={{
                  position: "absolute",
                  left: posX,
                  top: posY,
                  transform: "translate(-50%, -100%)",
                  background: isTop
                    ? "linear-gradient(145deg, rgba(226,75,74,0.94), rgba(140,30,28,0.88))"
                    : "linear-gradient(145deg, rgba(8,20,36,0.94), rgba(4,12,24,0.9))",
                  border: `1px solid ${isTop ? "#EF9F27" : "rgba(0,200,255,0.45)"}`,
                  borderLeft: `3px solid ${isTop ? "#EF9F27" : "#1D9E75"}`,
                  borderRadius: 5,
                  padding: "5px 10px 4px",
                  fontFamily: "'Share Tech Mono', monospace",
                  whiteSpace: "nowrap",
                  boxShadow: isTop ? "0 0 16px rgba(226,75,74,0.45)" : "0 4px 14px rgba(0,0,0,0.45)",
                  zIndex: 120 + (6 - idx),
                }}
              >
                <div style={{
                  fontFamily: "'Orbitron', monospace",
                  fontSize: 6,
                  letterSpacing: 1.8,
                  color: isTop ? "#FFD080" : "rgba(0,200,255,0.7)",
                  marginBottom: 2,
                  fontWeight: "bold",
                }}>SHAP INFLUENCE</div>
                <div style={{
                  fontFamily: "'Orbitron', monospace",
                  fontSize: 9,
                  letterSpacing: 0.8,
                  color: "#fff",
                  fontWeight: "bold",
                  lineHeight: 1.2,
                }}>{label}</div>
                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
                  {(score ?? 0).toFixed(3)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SensorPanelOverlay
        visible={showSensorPanels}
        liveReadings={sensorData}
        baselines={baselines}
        shapData={shapData}
        leakLocation={leakClass}
        hasScr={hasScr}
        predictionKey={predictionKey}
        screenAnchors={componentScreenAnchors}
        onRequestLineUpdate={lineUpdateRef}
      />

      {showSensorDots && !showAllSensors && !gnnOn && !shapModeOn && (
        <SensorDotLabels
          labels={sensorDotLabels}
          onLabelClick={toggleSensorDetail}
        />
      )}

      {showAllSensors && !gnnOn && !shapModeOn && (
        <SensorAllLabelsOverlay
          className={viewMode === "holo" ? "sensor-all-overlay--holo" : ""}
          labels={allSensorLabels}
          viewportWidth={allSensorViewport.width}
          viewportHeight={allSensorViewport.height}
          layoutKey={allSensorLayoutKey}
          onLabelClick={toggleSensorDetail}
        />
      )}

      {gnnOn && gnnLabels.length > 0 && (
        <div style={{ position: "absolute", inset: 0, bottom: 32, pointerEvents: "none", zIndex: 140 }}>
          {gnnLabels.map((l) => (
            <div
              key={l.sensorKey}
              style={{
                position: "absolute",
                left: l.screenX,
                top: l.screenY,
                transform: "translate(-50%, -100%)",
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 8,
                color: l.isShap ? "#EF9F27" : "rgba(255,255,255,0.6)",
                opacity: l.opacity,
                whiteSpace: "nowrap",
                textShadow: "0 1px 3px rgba(0,0,0,0.8)",
              }}
            >
              {l.shortLabel}
            </div>
          ))}
        </div>
      )}

      <SensorDetailPanel
        sensorKey={selectedSensorKey}
        liveReadings={sensorData}
        baselines={baselines}
        shapData={shapData}
        sfiMeta={sfiMeta}
        holoAnalysisOpen={viewMode === "holo" && !!holoSelectedPart}
        onClose={closeSensorDetail}
      />

      {faultySensorKey && sensorDetailDismissed && !selectedSensorKey && (
        <button
          type="button"
          className="sensor-detail-reopen-btn"
          onClick={() => openSensorDetail(faultySensorKey)}
          aria-label="Show sensor fault detail panel"
        >
          <span className="sensor-detail-reopen-btn__icon" aria-hidden>⚡</span>
          <span className="sensor-detail-reopen-btn__label">Sensor fault detail</span>
        </button>
      )}

      {(showSensorDots || showAllSensors) && hoveredSensorKey && !selectedSensorKey && (
        <SensorHoverTooltip
          sensorKey={hoveredSensorKey}
          position={sensorTooltipPos}
          liveReadings={sensorData}
          baselines={baselines}
          shapData={shapData}
          sfiMeta={sfiMeta}
        />
      )}

      {viewMode === "holo" && (
        <div
          className="hologram-overlay"
          style={{
            position: "absolute",
            inset: 0,
            bottom: 32,
            pointerEvents: "none",
            zIndex: 50,
          }}
        />
      )}

      {viewMode === "holo" && !holoSelectedPart && (
        <div className="twin-holo-hint">
          HOLOGRAM MODE — BOTH LEAK PARTS AUTO-EXTRACT · CLICK OR DRAG TO INSPECT · RIGHT-CLICK TO ORBIT
        </div>
      )}

      {/* Live indicator */}
      <div className={`twin-live-badge ${isStreaming ? "live" : ""}`}>
        <span className="twin-live-dot" />
        {engineDisplayName} · {isStreaming ? "LIVE" : "PAUSED"}
      </div>

        {!geometryReady && (
          <div className="twin-geometry-warn">
            {engineDisplayName} — using C13 layout until dedicated geometry is ready
          </div>
        )}

        {/* Navigation + zoom — bottom-left, above status bar */}
        <div className="twin-nav-cluster">
            {/* Mode Toggle: ORBIT vs PAN */}
            <div style={{ display: "flex", gap: 0, marginBottom: 2 }}>
              {["ORBIT", "PAN"].map(mode => (
                <button key={mode} onClick={() => setNavMode(mode)} style={{
                  padding: "3px 10px", fontSize: 8, fontFamily: "'Orbitron', monospace", letterSpacing: 1.2,
                  cursor: "pointer",
                  border: `1px solid ${navMode === mode ? "#00c8ff" : "rgba(0,200,255,0.12)"}`,
                  color: navMode === mode ? "#00c8ff" : "rgba(0,200,255,0.35)",
                  background: navMode === mode ? "rgba(0,200,255,0.12)" : "rgba(0,200,255,0.02)",
                  borderRadius: mode === "ORBIT" ? "4px 0 0 4px" : "0 4px 4px 0",
                }}>{mode}</button>
              ))}
            </div>

            {/* D-Pad arrows */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
              {NAV_BTN(() => navMove(() => {
                const t = threeRef.current; if (!t.orb) return;
                if (navMode === "ORBIT") { t.orb.phi = Math.max(0.08, t.orb.phi - STEP_ORBIT); }
                else { t.orb.ty += STEP_PAN; }
              }), "▲", "4px 4px 0 0")}
              <div style={{ display: "flex", gap: 0 }}>
                {NAV_BTN(() => navMove(() => {
                  const t = threeRef.current; if (!t.orb) return;
                  if (navMode === "ORBIT") { t.orb.theta += STEP_ORBIT; }
                  else { t.orb.tx -= STEP_PAN; }
                }), "◀", "4px 0 0 4px")}
                <button type="button" onClick={() => navMove(() => {
                  const t = threeRef.current; if (!t.orb) return;
                  t.orb.theta = 0.42; t.orb.phi = 0.68; t.orb.r = 16.0;
                  t.orb.tx = 0; t.orb.ty = 0.7; t.orb.tz = 0;
                  setEngineZoom(16);
                })} style={{
                  width: 28, height: 28, background: "rgba(0,200,255,0.1)", border: "1px solid rgba(0,200,255,0.2)",
                  borderRadius: 0, color: "rgba(0,200,255,0.7)", fontSize: 10, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "'Orbitron', monospace",
                }}>⌂</button>
                {NAV_BTN(() => navMove(() => {
                  const t = threeRef.current; if (!t.orb) return;
                  if (navMode === "ORBIT") { t.orb.theta -= STEP_ORBIT; }
                  else { t.orb.tx += STEP_PAN; }
                }), "▶", "0 4px 4px 0")}
              </div>
              {NAV_BTN(() => navMove(() => {
                const t = threeRef.current; if (!t.orb) return;
                if (navMode === "ORBIT") { t.orb.phi = Math.min(Math.PI - 0.08, t.orb.phi + STEP_ORBIT); }
                else { t.orb.ty -= STEP_PAN; }
              }), "▼", "0 0 4px 4px")}
            </div>

            <span style={{ fontFamily: "'Orbitron', monospace", fontSize: 7, letterSpacing: 1.5, color: "rgba(0,200,255,0.4)", marginTop: 4 }}>ZOOM</span>
            <button type="button" onClick={() => navMove(() => {
              const v = Math.max(1, engineZoom - 2.5);
              setEngineZoom(v);
              if (threeRef.current.orb) threeRef.current.orb.r = v;
            })} style={{
              width: 26, height: 22, background: "rgba(0,200,255,0.12)", border: "1px solid rgba(0,200,255,0.25)",
              borderRadius: "4px 4px 0 0", color: "#00c8ff", fontSize: 14, fontWeight: "bold",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'Share Tech Mono', monospace", lineHeight: 1,
            }}>+</button>
            <input
              type="range" min={1} max={30} step={0.5}
              value={engineZoom}
              onChange={(e) => navMove(() => {
                const v = Number(e.target.value);
                setEngineZoom(v);
                if (threeRef.current.orb) threeRef.current.orb.r = v;
              })}
              style={{ writingMode: "vertical-lr", direction: "rtl", width: 18, height: 70, accentColor: "#00c8ff", cursor: "pointer" }}
            />
            <button type="button" onClick={() => navMove(() => {
              const v = Math.min(30, engineZoom + 2.5);
              setEngineZoom(v);
              if (threeRef.current.orb) threeRef.current.orb.r = v;
            })} style={{
              width: 26, height: 22, background: "rgba(0,200,255,0.12)", border: "1px solid rgba(0,200,255,0.25)",
              borderRadius: "0 0 4px 4px", color: "#00c8ff", fontSize: 14, fontWeight: "bold",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'Share Tech Mono', monospace", lineHeight: 1,
            }}>−</button>
            <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 8, color: "rgba(0,200,255,0.5)" }}>
              {engineZoom < 10 ? "CLOSE" : engineZoom < 20 ? "MID" : "FAR"}
            </span>
        </div>

        {/* SHAP influence legend — right of zoom controls */}
        {shapModeOn && !gnnOn && (
          <div style={{
            position: "absolute", bottom: 40, left: 140, zIndex: 300,
            background: "rgba(10, 15, 25, 0.9)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6, padding: "8px 12px", pointerEvents: "none",
          }}>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>SHAP INFLUENCE</div>
            {[
              { color: "#444444", label: "None" },
              { color: "#1D9E75", label: "Low" },
              { color: "#EF9F27", label: "Medium" },
              { color: "#E24B4A", label: "High — driving prediction" },
            ].map((item) => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: item.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "#ccc" }}>{item.label}</span>
              </div>
            ))}
            <div style={{ fontSize: 9, color: "#555", marginTop: 6, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 4 }}>
              Pulsing = highest SHAP component
            </div>
          </div>
        )}

        </div>

        {viewMode === "holo" && holoSelectedPart && (
          <aside className="twin-holo-analysis">
            <HologramAnalysisPanel
              key={`${predictionKey}-${holoSelectedPart}-${secondaryLeakClass || "single"}`}
              componentKey={holoSelectedPart}
              liveReadings={sensorData}
              baselines={baselines}
              shapData={shapData}
              leakLocation={leakClass}
              secondaryLeakLocation={secondaryLeakClass}
              leakSeverity={activeLeaks[0]?.severity || prediction?.Leak_Severity}
              secondaryLeakSeverity={activeLeaks[1]?.severity}
              confidence={activeLeaks[0]?.confidence != null
                ? activeLeaks[0].confidence * 100
                : (prediction ? prediction.Confidence_Score * 100 : null)}
              secondaryConfidence={activeLeaks[1]?.confidence != null
                ? activeLeaks[1].confidence * 100
                : null}
              rcaResult={primaryRca}
              secondaryRcaResult={secondaryRca}
              primaryShap={primaryShap}
              secondaryShap={secondaryShap}
              isDragging={holoDragging}
              sfiMeta={sfiMeta}
              faultyComponentKey={faultyComponentKey}
              onResetPart={() => {
                const t = threeRef.current;
                resetComponentPosition(t, holoSelectedPart);
                selectHologramPart(t, null);
                setHoloSelectedPart(null);
              }}
              onResetAll={() => {
                const t = threeRef.current;
                resetAllComponentPositions(t);
                setHoloSelectedPart(null);
              }}
              onClose={() => {
                const t = threeRef.current;
                selectHologramPart(t, null);
                setHoloSelectedPart(null);
              }}
            />
          </aside>
        )}
      </div>
    </div>
  );
});

DigitalTwin.displayName = "DigitalTwin";
export default DigitalTwin;
