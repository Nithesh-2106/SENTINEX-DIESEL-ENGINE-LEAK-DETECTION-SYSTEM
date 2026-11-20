/**
 * System E — GNN overlay: 42 sensor nodes at calibrated positions + edges.
 */
import * as THREE from "three";
import {
  SENSOR_DEFINITIONS,
  COMPONENT_META,
  GNN_CROSS_EDGES,
  getBaseline,
  deviationColour,
} from "../constants/sensorDefinitions.js";
import {
  resolveSensorWorldPosition,
  computeEngineScale,
} from "./sensor3dPositions.js";
import { ZONE_TO_COMPONENT } from "./componentSensorMap.js";

const SHAP_AMBER = 0xef9f27;
const TEAL = 0x1d9e75;
const RED = 0xe24b4a;

function hexToThree(hex) {
  return parseInt(hex.replace("#", ""), 16);
}

function componentZonePos(t, componentKey) {
  const zoneId = Object.entries(ZONE_TO_COMPONENT).find(([, k]) => k === componentKey)?.[0];
  const zone = t.layout?.zoneAnchors?.find((z) => z.id === zoneId);
  if (zone) return new THREE.Vector3(...zone.pos);
  const meshes = t.componentMeshes?.[componentKey];
  if (meshes?.length) {
    const p = new THREE.Vector3();
    meshes[0].mesh.getWorldPosition(p);
    return p;
  }
  return new THREE.Vector3(0, 0.7, 0);
}

function buildShapSet(shapData) {
  const m = new Map();
  (shapData || []).forEach((e, i) => {
    if (e?.sensor) m.set(e.sensor, { score: Math.abs(Number(e.shap_impact) || 0), rank: i + 1 });
  });
  return m;
}

function nodeStyle(sensorKey, readings, baselines, shapSet) {
  const shap = shapSet.get(sensorKey);
  if (shap) return { color: SHAP_AMBER, radius: 0.12, labelOpacity: 1.0, isShap: true, rank: shap.rank };

  const val = readings?.[sensorKey];
  const base = getBaseline(sensorKey, baselines);
  if (val != null && base != null) {
    const pct = Math.abs(((Number(val) - base) / Math.abs(base)) * 100);
    if (pct > 8) return { color: RED, radius: 0.10, labelOpacity: 0.4, isShap: false };
  }
  return { color: TEAL, radius: 0.08, labelOpacity: 0.4, isShap: false };
}

export function mountGnnOverlay(t, readings, baselines, shapData) {
  clearGnnOverlay(t);
  if (!t.contentGroup || !readings) return;

  t.engineScale = computeEngineScale(t);
  const shapSet = buildShapSet(shapData);
  const group = new THREE.Group();
  group.name = "gnn-overlay";

  const nodes = {};
  const nodeMeshes = [];

  for (const sensorKey of Object.keys(SENSOR_DEFINITIONS)) {
    if (readings[sensorKey] === undefined || readings[sensorKey] === null) continue;
    const worldPos = resolveSensorWorldPosition(t, sensorKey);
    if (!worldPos) continue;

    const style = nodeStyle(sensorKey, readings, baselines, shapSet);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(style.radius, 10, 10),
      new THREE.MeshBasicMaterial({
        color: style.color,
        transparent: true,
        opacity: style.isShap ? 0.95 : 0.75,
      }),
    );
    mesh.position.copy(worldPos);
    mesh.frustumCulled = false;
    mesh.userData = {
      isGnnNode: true,
      sensorKey,
      labelOpacity: style.labelOpacity,
      isShap: style.isShap,
      shapRank: style.rank,
      def: SENSOR_DEFINITIONS[sensorKey],
    };
    group.add(mesh);
    nodes[sensorKey] = worldPos.clone();
    nodeMeshes.push(mesh);
  }

  const ghostNodes = {};
  Object.keys(COMPONENT_META).forEach((compKey) => {
    const pos = componentZonePos(t, compKey);
    const ghost = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 10, 10),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.3,
      }),
    );
    ghost.position.copy(pos);
    ghost.frustumCulled = false;
    ghost.userData = { isGnnComponentGhost: true, componentKey: compKey };
    group.add(ghost);
    ghostNodes[compKey] = pos.clone();
  });

  const edgeGroup = new THREE.Group();
  edgeGroup.name = "gnn-edges";
  const lineVerts = [];
  const lineColors = [];

  Object.entries(SENSOR_DEFINITIONS).forEach(([sensorKey, def]) => {
    if (!nodes[sensorKey]) return;
    const a = nodes[sensorKey];
    const ghost = ghostNodes[def.component];
    if (ghost) {
      lineVerts.push(a.x, a.y, a.z, ghost.x, ghost.y, ghost.z);
      for (let i = 0; i < 2; i++) lineColors.push(1, 1, 1);
    }
  });

  GNN_CROSS_EDGES.forEach(([aKey, bKey]) => {
    const a = nodes[aKey];
    const b = nodes[bKey];
    if (!a || !b) return;
    lineVerts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    for (let i = 0; i < 2; i++) lineColors.push(0.4, 0.4, 0.4);
  });

  const shapKeys = [...shapSet.keys()].filter((k) => nodes[k]);
  for (let i = 0; i < shapKeys.length; i++) {
    for (let j = i + 1; j < shapKeys.length; j++) {
      const a = nodes[shapKeys[i]];
      const b = nodes[shapKeys[j]];
      lineVerts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      for (let k = 0; k < 2; k++) lineColors.push(0.94, 0.62, 0.15);
    }
  }

  Object.entries(SENSOR_DEFINITIONS).forEach(([sensorKey, def]) => {
    if (!nodes[sensorKey]) return;
    (def.gnnConnections || []).forEach((connKey) => {
      const a = nodes[sensorKey];
      const b = nodes[connKey];
      if (!a || !b) return;
      const isShapEdge = shapSet.has(sensorKey) && shapSet.has(connKey);
      lineVerts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      if (isShapEdge) {
        for (let k = 0; k < 2; k++) lineColors.push(0.94, 0.62, 0.15);
      } else {
        for (let k = 0; k < 2; k++) lineColors.push(0.35, 0.35, 0.35);
      }
    });
  });

  if (lineVerts.length > 0) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(lineVerts, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(lineColors, 3));
    const lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    lines.frustumCulled = false;
    edgeGroup.add(lines);
    t.gnnEdgeLines = lines;
  }

  group.add(edgeGroup);
  t.contentGroup.add(group);
  t.gnnOverlayGroup = group;
  t.gnnNodeMeshes = nodeMeshes;
  t.gnnNodeCount = nodeMeshes.length;
}

export function clearGnnOverlay(t) {
  if (!t?.gnnOverlayGroup) {
    t.gnnNodeMeshes = [];
    t.gnnNodeCount = 0;
    return;
  }
  t.contentGroup?.remove(t.gnnOverlayGroup);
  t.gnnOverlayGroup.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
  t.gnnOverlayGroup = null;
  t.gnnEdgeLines = null;
  t.gnnNodeMeshes = [];
  t.gnnNodeCount = 0;
}

export function projectGnnLabels(t, camera, width, height, readings) {
  if (!t.gnnNodeMeshes?.length) return [];
  const labels = [];
  const vec = new THREE.Vector3();

  t.gnnNodeMeshes.forEach((mesh) => {
    const key = mesh.userData.sensorKey;
    const val = readings?.[key];
    if (val === undefined) return;
    mesh.getWorldPosition(vec);
    const ndc = vec.clone().project(camera);
    if (ndc.z > 1) return;
    labels.push({
      sensorKey: key,
      screenX: (ndc.x + 1) / 2 * width,
      screenY: (-ndc.y + 1) / 2 * height - 12,
      shortLabel: mesh.userData.def.shortLabel,
      opacity: mesh.userData.labelOpacity,
      isShap: mesh.userData.isShap,
    });
  });
  return labels;
}

export function tickGnnPulse(t, elapsed) {
  if (!t.gnnEdgeLines) return;
  t.gnnEdgeLines.material.opacity = 0.65 + Math.sin(elapsed * Math.PI * 0.55) * 0.2;
  t.gnnNodeMeshes?.forEach((mesh) => {
    if (mesh.userData.isShap) {
      const pulse = 1 + Math.sin(elapsed * Math.PI * 3) * 0.12;
      mesh.scale.setScalar(pulse);
    }
  });
}
