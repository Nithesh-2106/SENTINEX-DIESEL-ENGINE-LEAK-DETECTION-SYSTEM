/**
 * Physical 3D placement — uses layout sensorDefs.pos (ground truth), not zone offsets.
 */
import * as THREE from "three";
import { ZONE_TO_COMPONENT } from "./componentSensorMap.js";
import {
  SENSOR_DEFINITIONS,
  getBaseline,
} from "../constants/sensorDefinitions.js";

function componentWorldPos(t, componentKey) {
  const zoneId = Object.entries(ZONE_TO_COMPONENT).find(([, k]) => k === componentKey)?.[0];
  const zone = t.layout?.zoneAnchors?.find((z) => z.id === zoneId);
  if (zone) return new THREE.Vector3(...zone.pos);

  const meshes = t.componentMeshes?.[componentKey];
  if (meshes?.length) {
    const pos = new THREE.Vector3();
    meshes[0].mesh.getWorldPosition(pos);
    return pos;
  }
  return new THREE.Vector3(0, 0.7, 0);
}

/**
 * Resolve world position for a sensor dot / GNN node.
 * Priority: layout.sensorDefs.pos (matches engine geometry) → component centre + tiny nudge.
 */
export function resolveSensorWorldPosition(t, sensorKey) {
  const def = SENSOR_DEFINITIONS[sensorKey];
  if (!def) return null;

  const sdef = t.layout?.sensorDefs?.find((s) => s.id === sensorKey);
  if (sdef?.pos?.length === 3) {
    return new THREE.Vector3(sdef.pos[0], sdef.pos[1], sdef.pos[2]);
  }

  const compPos = componentWorldPos(t, def.component);
  const off = def.localOffset || { x: 0, y: 0, z: 0 };
  const NUDGE = 0.15;
  return new THREE.Vector3(
    compPos.x + off.x * NUDGE,
    compPos.y + off.y * NUDGE,
    compPos.z + off.z * NUDGE,
  );
}

export function resolveSensorPosition(sensorId) {
  const def = SENSOR_DEFINITIONS[sensorId];
  if (!def) return null;
  return {
    componentKey: def.component,
    localOffset: def.localOffset,
    label: def.shortLabel,
    physical: def.physicalDescription,
  };
}

export function getSensorBaseline(sensorKey, baselines) {
  return getBaseline(sensorKey, baselines);
}

export function collectEngineMeshes(t) {
  const meshes = [];
  if (!t?.contentGroup) return meshes;
  t.contentGroup.traverse((obj) => {
    if (
      obj.isMesh
      && !obj.userData?.isSensorDot
      && !obj.userData?.isGnnNode
      && !obj.userData?.isGnnComponentGhost
      && obj.parent?.name !== "sensor-dots"
      && obj.parent?.name !== "gnn-overlay"
      && obj.parent?.name !== "gnn-edges"
    ) {
      meshes.push(obj);
    }
  });
  return meshes;
}

export const COMPONENT_SHORT_NAMES = {
  AIR_FILTER: "AIR FILTER",
  TURBOCHARGER: "TURBO",
  CAC: "CAC",
  ENGINE_BLOCK: "ENGINE",
  EGR_COOLER: "EGR",
  DPF_DOC: "DPF/DOC",
  SCR: "SCR",
  EXHAUST_OUT: "EXHAUST",
};

/** @deprecated Use SENSOR_DEFINITIONS */
export const SENSOR_3D_POSITIONS = SENSOR_DEFINITIONS;

/** @deprecated No longer used — layout positions are authoritative */
export function computeEngineScale() {
  return 1.0;
}
