/**
 * SHAP overlay mode — colour engine components by aggregated SHAP influence.
 */
import { COMPONENT_SENSOR_MAP } from "./componentSensorMap.js";

const GREY = 0x444444;
const GREEN = 0x1d9e75;
const AMBER = 0xef9f27;
const RED = 0xe24b4a;

export function getComponentShapScore(componentKey, shapData) {
  if (!shapData?.length) return 0;
  const componentSensors = COMPONENT_SENSOR_MAP[componentKey]?.sensors ?? [];
  const keys = new Set(componentSensors.map((s) => s.key));
  return shapData
    .filter((item) => keys.has(item.sensor))
    .reduce((sum, item) => sum + Math.abs(Number(item.shap_impact) || 0), 0);
}

function getMeshes(t, componentKey) {
  return t.componentMeshes?.[componentKey] || [];
}

function storeOriginal(mesh, store) {
  if (store.has(mesh.uuid)) return;
  const mat = mesh.material;
  if (!mat) return;
  store.set(mesh.uuid, {
    color: mat.color?.getHex?.() ?? 0xffffff,
    emissive: mat.emissive?.getHex?.() ?? 0x000000,
    emissiveIntensity: mat.emissiveIntensity ?? 0,
    opacity: mat.opacity ?? 1,
    transparent: mat.transparent ?? false,
  });
}

function applyScoreToMesh(mesh, score) {
  const mat = mesh.material;
  if (!mat?.color) return;

  if (score < 0.01) {
    mat.color.setHex(GREY);
    mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.opacity = 0.5;
    mat.transparent = true;
  } else if (score < 0.05) {
    mat.color.setHex(GREEN);
    mat.emissive.setHex(GREEN);
    mat.emissiveIntensity = 0.2;
    mat.opacity = 0.8;
    mat.transparent = true;
  } else if (score < 0.15) {
    mat.color.setHex(AMBER);
    mat.emissive.setHex(AMBER);
    mat.emissiveIntensity = 0.5;
    mat.opacity = 0.9;
    mat.transparent = true;
  } else {
    mat.color.setHex(RED);
    mat.emissive.setHex(RED);
    mat.emissiveIntensity = 0.8;
    mat.opacity = 1.0;
    mat.transparent = false;
  }
}

export function applyShapMode(t, shapData) {
  if (!t?.componentMeshes) return;

  if (!t.shapOriginalMaterials) {
    t.shapOriginalMaterials = new Map();
  }

  let topKey = null;
  let topScore = -1;
  const scores = {};

  Object.keys(COMPONENT_SENSOR_MAP).forEach((componentKey) => {
    const score = getComponentShapScore(componentKey, shapData);
    scores[componentKey] = score;
    if (score > topScore) {
      topScore = score;
      topKey = componentKey;
    }

    getMeshes(t, componentKey).forEach(({ mesh }) => {
      mesh.renderOrder = 20;
      if (!mesh.userData._shapMat) {
        mesh.userData._shapMat = mesh.material.clone();
        mesh.material = mesh.userData._shapMat;
      }
      storeOriginal(mesh, t.shapOriginalMaterials);
      applyScoreToMesh(mesh, score);
    });
  });

  t.shapTopComponent = topKey;
  t.shapTopScore = topScore;
  t.shapComponentScores = scores;
  t.shapModeActive = true;
}

export function clearShapMode(t) {
  if (!t?.shapOriginalMaterials) {
    t.shapModeActive = false;
    t.shapTopComponent = null;
    return;
  }

  Object.values(t.componentMeshes || {}).flat().forEach(({ mesh }) => {
    const orig = t.shapOriginalMaterials.get(mesh.uuid);
    const mat = mesh.material;
    if (!orig || !mat) return;
    mat.color.setHex(orig.color);
    mat.emissive.setHex(orig.emissive);
    mat.emissiveIntensity = orig.emissiveIntensity;
    mat.opacity = orig.opacity;
    mat.transparent = orig.transparent;
  });

  t.shapModeActive = false;
  t.shapTopComponent = null;
  t.shapTopScore = 0;
  t.shapComponentScores = null;
}

/** Pulse highest-SHAP component inside existing animation loop. */
export function tickShapPulse(t, elapsed) {
  if (!t?.shapModeActive || !t.shapTopComponent || t.shapTopScore < 0.01) return;

  const pulse = 0.6 + ((Math.sin(elapsed * Math.PI * (2 / 1.5)) + 1) / 2) * 0.4;
  getMeshes(t, t.shapTopComponent).forEach(({ mesh }) => {
    const mat = mesh.material;
    if (mat?.emissive && mat.emissive.getHex() === RED) {
      mat.emissiveIntensity = pulse;
    }
  });
}
