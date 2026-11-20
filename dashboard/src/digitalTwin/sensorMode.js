/**
 * System C — Sensor dots: stationary, deviation-coloured, distinct from particle flow.
 */
import * as THREE from "three";
import {
  SENSOR_DEFINITIONS,
  getBaseline,
  deviationColour,
} from "../constants/sensorDefinitions.js";
import {
  resolveSensorWorldPosition,
} from "./sensor3dPositions.js";

const DOT_RADIUS = 0.10;
const OUTLINE_INNER = 0.11;
const OUTLINE_OUTER = 0.13;
const FAULT_AMBER = 0xf59e0b;

function hexToThree(hex) {
  return parseInt(hex.replace("#", ""), 16);
}

export function deviationToHex(value, baseline) {
  return hexToThree(deviationColour(value, baseline));
}

function createDot(sensorKey, worldPos, colorHex, isHigh) {
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(DOT_RADIUS, 12, 12),
    new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.95,
    }),
  );
  dot.position.copy(worldPos);
  dot.frustumCulled = false;
  dot.userData = {
    sensorKey,
    isSensorDot: true,
    pulsePhase: Math.random() * Math.PI * 2,
    isHighDeviation: isHigh,
    baseScale: 1,
  };

  const outline = new THREE.Mesh(
    new THREE.RingGeometry(OUTLINE_INNER, OUTLINE_OUTER, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  outline.renderOrder = 25;
  dot.add(outline);
  dot.userData.outline = outline;

  const pulseRing = new THREE.Mesh(
    new THREE.RingGeometry(0.14, 0.17, 16),
    new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  pulseRing.renderOrder = 24;
  dot.add(pulseRing);
  dot.userData.pulseRing = pulseRing;

  if (isHigh) {
    const outer = new THREE.Mesh(
      new THREE.RingGeometry(0.17, 0.21, 16),
      new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    outer.renderOrder = 23;
    dot.add(outer);
    dot.userData.outerRing = outer;
  }

  return dot;
}

export function mountSensorDots(t, readings, baselines) {
  clearSensorDots(t);
  if (!t.contentGroup) return;
  const vals = readings || {};

  const dots = [];
  const group = new THREE.Group();
  group.name = "sensor-dots";

  for (const sensorKey of Object.keys(SENSOR_DEFINITIONS)) {
    const def = SENSOR_DEFINITIONS[sensorKey];
    const worldPos = resolveSensorWorldPosition(t, sensorKey);
    if (!worldPos) continue;

    const baseline = getBaseline(sensorKey, baselines);
    const raw = vals[sensorKey];
    const val = raw ?? baseline;
    if (val === undefined || val === null) continue;
    const colorHex = deviationToHex(val, baseline);
    const isHigh = baseline != null
      && Math.abs(((Number(val) - baseline) / Math.abs(baseline)) * 100) > 8;

    const dot = createDot(sensorKey, worldPos, colorHex, isHigh);
    dot.userData.componentKey = def.component;
    dot.userData.def = def;
    group.add(dot);
    dots.push(dot);
  }

  t.contentGroup.add(group);
  t.sensorDotGroup = group;
  t.sensorDots = dots;
  t.sensorDotArray = dots;
}

export function clearSensorDots(t) {
  if (!t?.sensorDotGroup) {
    t.sensorDots = [];
    t.sensorDotArray = [];
    return;
  }
  t.contentGroup?.remove(t.sensorDotGroup);
  t.sensorDotGroup.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
  t.sensorDotGroup = null;
  t.sensorDots = [];
  t.sensorDotArray = [];
}

export function updateSensorDotColors(t, readings, baselines, faultySensorKey = null) {
  if (!t.sensorDots?.length) return;
  const vals = readings || {};
  t.faultySensorKey = faultySensorKey || null;
  t.sensorDots.forEach((dot) => {
    const key = dot.userData.sensorKey;
    const baseline = getBaseline(key, baselines);
    const val = vals[key] ?? baseline;
    if (val === undefined || val === null) {
      dot.visible = false;
      return;
    }
    dot.visible = true;
    const isFault = faultySensorKey && key === faultySensorKey;
    const colorHex = isFault ? FAULT_AMBER : deviationToHex(val, baseline);
    const isHigh = isFault || (baseline != null
      && Math.abs(((Number(val) - baseline) / Math.abs(baseline)) * 100) > 8);

    dot.material.color.setHex(colorHex);
    if (dot.userData.pulseRing) dot.userData.pulseRing.material.color.setHex(colorHex);
    if (dot.userData.outerRing) dot.userData.outerRing.material.color.setHex(colorHex);
    dot.userData.isHighDeviation = isHigh;
    dot.userData.isFaultSensor = isFault;

    if (isFault && !dot.userData.faultRing) {
      const faultRing = new THREE.Mesh(
        new THREE.RingGeometry(0.19, 0.24, 16),
        new THREE.MeshBasicMaterial({
          color: FAULT_AMBER,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      faultRing.renderOrder = 22;
      dot.add(faultRing);
      dot.userData.faultRing = faultRing;
    }
    if (dot.userData.faultRing) {
      dot.userData.faultRing.visible = isFault;
      if (isFault) dot.userData.faultRing.material.color.setHex(FAULT_AMBER);
    }
  });
}

export function tickSensorDots(t, camera, elapsed, hoverState) {
  if (!t.sensorDots?.length) return;

  const {
    hoveredSensorKey = null,
    selectedSensorKey = null,
  } = hoverState || {};

  t.sensorDots.forEach((dot) => {
    const key = dot.userData.sensorKey;
    dot.userData.pulsePhase += 0.04;

    if (dot.userData.outline && camera) {
      dot.userData.outline.quaternion.copy(camera.quaternion);
    }
    if (dot.userData.pulseRing && camera) {
      dot.userData.pulseRing.quaternion.copy(camera.quaternion);
      const pulse = 0.2 + Math.sin(dot.userData.pulsePhase) * 0.15;
      dot.userData.pulseRing.material.opacity = pulse;
      const s = 1 + Math.sin(dot.userData.pulsePhase) * 0.08;
      dot.userData.pulseRing.scale.setScalar(s);
    }
    if (dot.userData.outerRing && camera) {
      dot.userData.outerRing.quaternion.copy(camera.quaternion);
    }

    let scale = 1;
    let opacity = 0.95;

    if (dot.userData.isFaultSensor) {
      scale = 1.45 + Math.sin(dot.userData.pulsePhase * 1.6) * 0.12;
      opacity = 1;
      if (dot.userData.faultRing && camera) {
        dot.userData.faultRing.quaternion.copy(camera.quaternion);
        dot.userData.faultRing.material.opacity = 0.25 + Math.sin(dot.userData.pulsePhase * 1.4) * 0.2;
        dot.userData.faultRing.scale.setScalar(1 + Math.sin(dot.userData.pulsePhase) * 0.12);
      }
    } else if (selectedSensorKey === key) {
      scale = 1.6;
      opacity = 1;
    } else if (hoveredSensorKey === key) {
      scale = 1.35;
      opacity = 1;
    } else if (!t.showAllSensors && (hoveredSensorKey || selectedSensorKey)) {
      opacity = 0.35;
    } else if (dot.userData.isHighDeviation) {
      scale = 1.1 + Math.sin(dot.userData.pulsePhase) * 0.05;
    }

    dot.scale.setScalar(scale);
    dot.material.opacity = opacity;
  });
}

export function projectSensorDotLabels(t, camera, width, height, readings, baselines, options = {}) {
  const { hoveredKey = null, selectedKey = null, showAll = false } = options;
  if (!t.sensorDots?.length) return [];
  const labels = [];
  const vec = new THREE.Vector3();

  t.sensorDots.forEach((dot) => {
    if (!dot.visible) return;
    const key = dot.userData.sensorKey;
    const def = dot.userData.def;
    const baseline = getBaseline(key, baselines);
    const val = readings?.[key] ?? baseline;
    if (val === undefined || val === null) return;

    const isActive = key === hoveredKey || key === selectedKey;
    if (!showAll && !isActive) return;

    dot.getWorldPosition(vec);
    const ndc = vec.clone().project(camera);
    if (ndc.z > 1) return;

    const anchorX = (ndc.x + 1) / 2 * width;
    const anchorY = (-ndc.y + 1) / 2 * height;
    const screenX = showAll ? anchorX : anchorX + 12;
    const screenY = anchorY;
    const col = deviationColour(val, baseline);
    const deviationPct = baseline != null && baseline !== 0
      ? ((Number(val) - baseline) / Math.abs(baseline)) * 100
      : 0;

    labels.push({
      sensorKey: key,
      screenX,
      screenY,
      anchorX,
      anchorY,
      labelOffsetX: 0,
      labelOffsetY: 0,
      shortLabel: def.shortLabel,
      unit: def.unit,
      value: val,
      colour: dot.userData.isFaultSensor ? "#f59e0b" : col,
      componentKey: dot.userData.componentKey ?? def.component,
      deviationPct,
      isActive,
      isFaultSensor: Boolean(dot.userData.isFaultSensor),
      hasLiveReading: readings?.[key] != null,
      dot,
    });
  });
  return labels;
}

export function raycastSensorDots(t, mouseNDC, camera) {
  if (!t.sensorDotArray?.length) return null;
  t.raycaster.setFromCamera(mouseNDC, camera);
  t.raycaster.params.Points = { threshold: 0.08 };
  const hits = t.raycaster.intersectObjects(t.sensorDotArray, false);
  if (hits.length > 0) return hits[0].object.userData.sensorKey;
  return null;
}

export function getHighestDeviationSensor(t, componentKey, readings, baselines) {
  if (!t.sensorDots?.length) return null;
  let best = null;
  let bestPct = -1;
  t.sensorDots.forEach((dot) => {
    if (dot.userData.componentKey !== componentKey) return;
    const key = dot.userData.sensorKey;
    const baseline = getBaseline(key, baselines);
    const val = readings?.[key];
    if (baseline == null || val == null) return;
    const pct = Math.abs(((Number(val) - baseline) / Math.abs(baseline)) * 100);
    if (pct > bestPct) {
      bestPct = pct;
      best = dot;
    }
  });
  return best;
}

export function projectDotToScreen(dot, camera, width, height) {
  const pos = new THREE.Vector3();
  dot.getWorldPosition(pos);
  const ndc = pos.clone().project(camera);
  if (ndc.z > 1) return null;
  return {
    x: (ndc.x + 1) / 2 * width,
    y: (-ndc.y + 1) / 2 * height,
    sensorKey: dot.userData.sensorKey,
  };
}

export function setSensorMeshesVisible(t, visible) {
  if (!t.sensorMeshes) return;
  Object.values(t.sensorMeshes).forEach((mesh) => {
    mesh.visible = visible;
    if (mesh.userData.haloLight) mesh.userData.haloLight.visible = visible;
  });
}
