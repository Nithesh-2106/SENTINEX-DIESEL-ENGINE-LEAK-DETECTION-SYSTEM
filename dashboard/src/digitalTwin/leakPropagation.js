/**
 * Leak propagation visuals — downstream amber glow + upstream blue pulse + amber flow particles.
 * Additive on top of existing leak sphere / bulge FX.
 */
import * as THREE from "three";
import {
  AIR_PATH_SEQUENCE,
  LEAK_ORIGIN_COMPONENT,
  ZONE_TO_COMPONENT,
} from "./componentSensorMap.js";

const AMBER = 0xef9f27;
const BLUE = 0x378add;
const PURPLE = 0x7c3aed;

function zonePos(layout, componentKey) {
  const zoneId = Object.entries(ZONE_TO_COMPONENT).find(([, k]) => k === componentKey)?.[0];
  const zone = layout?.zoneAnchors?.find((z) => z.id === zoneId);
  return zone ? new THREE.Vector3(...zone.pos) : null;
}

function getMeshes(t, componentKey) {
  return t.componentMeshes?.[componentKey] || [];
}

function writableMaterial(mesh) {
  if (!mesh.userData._propMat) {
    mesh.userData._propMat = mesh.material.clone();
    mesh.material = mesh.userData._propMat;
  }
  return mesh.userData._propMat;
}

function resetMeshEmissive(mesh) {
  const mat = mesh.material;
  if (!mat?.emissive) return;
  mat.emissive.setHex(0x000000);
  mat.emissiveIntensity = 0;
}

function disposePropagationParticles(t) {
  if (!t.propagationPts) return;
  t.contentGroup?.remove(t.propagationPts);
  t.propagationPts.geometry?.dispose();
  t.propagationPts.material?.dispose();
  t.propagationPts = null;
  t.propagationSeg = null;
  t.propagationOff = null;
  t.propagationCount = 0;
}

export function clearLeakPropagation(t) {
  if (!t) return;

  (t.propagationAffectedMeshes || []).forEach(resetMeshEmissive);
  t.propagationAffectedMeshes = [];
  t.propagationUpstreamMeshes = [];
  t.propagationState = null;
  t.propagationOriginIndex = -1;
  t.propagationReach = { downstream: 0, upstream: 0, intensity: 0 };

  disposePropagationParticles(t);
  t._lastLeakPropagation = null;
}

function createPropagationParticles(t, curves) {
  disposePropagationParticles(t);
  if (!curves.length || !t.contentGroup) return;

  const perCurve = 18;
  const total = curves.length * perCurve;
  const positions = new Float32Array(total * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: AMBER,
    size: 0.05,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 14;
  t.contentGroup.add(pts);

  const seg = [];
  const off = [];
  for (let c = 0; c < curves.length; c++) {
    for (let n = 0; n < perCurve; n++) {
      seg.push(c);
      off.push(Math.random());
    }
  }

  t.propagationPts = pts;
  t.propagationCurves = curves;
  t.propagationSeg = seg;
  t.propagationOff = off;
  t.propagationCount = total;
}

export function applyLeakPropagation(t, leakLocation, severity) {
  if (!t?.componentMeshes) return;

  clearLeakPropagation(t);

  const originKey = LEAK_ORIGIN_COMPONENT[leakLocation];
  if (!originKey) return;

  const originIndex = AIR_PATH_SEQUENCE.indexOf(originKey);
  if (originIndex < 0) return;

  const sev = String(severity || "Moderate");
  let downstreamReach = 2;
  let upstreamReach = 1;
  let glowIntensity = 0.6;
  if (sev === "Minor") {
    downstreamReach = 1;
    upstreamReach = 0;
    glowIntensity = 0.3;
  }

  const affected = [];

  for (let i = originIndex + 1; i <= originIndex + downstreamReach && i < AIR_PATH_SEQUENCE.length; i++) {
    const key = AIR_PATH_SEQUENCE[i];
    const fade = 1 - 0.2 * (i - originIndex);
    getMeshes(t, key).forEach(({ mesh }) => {
      const mat = writableMaterial(mesh);
      mat.emissive.setHex(AMBER);
      mat.emissiveIntensity = glowIntensity * fade;
      affected.push(mesh);
    });
  }

  const upstreamMeshes = [];
  for (let i = originIndex - 1; i >= originIndex - upstreamReach && i >= 0; i--) {
    const key = AIR_PATH_SEQUENCE[i];
    getMeshes(t, key).forEach(({ mesh }) => {
      const mat = writableMaterial(mesh);
      mat.emissive.setHex(BLUE);
      mat.emissiveIntensity = 0.15;
      upstreamMeshes.push(mesh);
      affected.push(mesh);
    });
  }

  const curves = [];
  const layout = t.layout;
  let prevKey = originKey;
  for (let i = originIndex + 1; i <= originIndex + downstreamReach && i < AIR_PATH_SEQUENCE.length; i++) {
    const nextKey = AIR_PATH_SEQUENCE[i];
    const a = zonePos(layout, prevKey);
    const b = zonePos(layout, nextKey);
    if (a && b) {
      curves.push(new THREE.CatmullRomCurve3([a, b]));
    }
    prevKey = nextKey;
  }
  createPropagationParticles(t, curves);

  t.propagationAffectedMeshes = affected;
  t.propagationUpstreamMeshes = upstreamMeshes;
  t.propagationOriginIndex = originIndex;
  t.propagationReach = { downstream: downstreamReach, upstream: upstreamReach, intensity: glowIntensity };
  t.propagationState = { phase: 0 };
  t._lastLeakPropagation = { leakLocation, severity };
}

function applyOriginPropagation(t, leakLocation, severity, { emissiveHex = AMBER, intensityScale = 1.0 } = {}) {
  const originKey = LEAK_ORIGIN_COMPONENT[leakLocation];
  if (!originKey) return { affected: [], upstream: [], originIndex: -1, curves: [] };

  const originIndex = AIR_PATH_SEQUENCE.indexOf(originKey);
  if (originIndex < 0) return { affected: [], upstream: [], originIndex: -1, curves: [] };

  const sev = String(severity || "Moderate");
  let downstreamReach = 2;
  let upstreamReach = 1;
  let glowIntensity = 0.6 * intensityScale;
  if (sev === "Minor") {
    downstreamReach = 1;
    upstreamReach = 0;
    glowIntensity = 0.3 * intensityScale;
  }

  const affected = [];
  const upstreamMeshes = [];

  getMeshes(t, originKey).forEach(({ mesh }) => {
    const mat = writableMaterial(mesh);
    mat.emissive.setHex(emissiveHex);
    mat.emissiveIntensity = Math.min(1.0, glowIntensity * 1.15);
    affected.push(mesh);
  });

  for (let i = originIndex + 1; i <= originIndex + downstreamReach && i < AIR_PATH_SEQUENCE.length; i++) {
    const key = AIR_PATH_SEQUENCE[i];
    const fade = 1 - 0.2 * (i - originIndex);
    getMeshes(t, key).forEach(({ mesh }) => {
      const mat = writableMaterial(mesh);
      mat.emissive.setHex(emissiveHex === PURPLE ? PURPLE : AMBER);
      mat.emissiveIntensity = glowIntensity * fade;
      affected.push(mesh);
    });
  }

  for (let i = originIndex - 1; i >= originIndex - upstreamReach && i >= 0; i--) {
    const key = AIR_PATH_SEQUENCE[i];
    getMeshes(t, key).forEach(({ mesh }) => {
      const mat = writableMaterial(mesh);
      mat.emissive.setHex(BLUE);
      mat.emissiveIntensity = 0.12 * intensityScale;
      upstreamMeshes.push(mesh);
      affected.push(mesh);
    });
  }

  const curves = [];
  const layout = t.layout;
  let prevKey = originKey;
  for (let i = originIndex + 1; i <= originIndex + downstreamReach && i < AIR_PATH_SEQUENCE.length; i++) {
    const nextKey = AIR_PATH_SEQUENCE[i];
    const a = zonePos(layout, prevKey);
    const b = zonePos(layout, nextKey);
    if (a && b) {
      curves.push(new THREE.CatmullRomCurve3([a, b]));
    }
    prevKey = nextKey;
  }

  return { affected, upstream: upstreamMeshes, originIndex, curves };
}

/** Dual-origin propagation for multi-leak — primary (red/amber) + secondary (purple). */
export function applyMultiLeakPropagation(
  t,
  primaryLocation,
  primarySeverity,
  secondaryLocation,
  secondarySeverity,
) {
  if (!t?.componentMeshes) return;

  clearLeakPropagation(t);

  const primary = applyOriginPropagation(t, primaryLocation, primarySeverity, {
    emissiveHex: AMBER,
    intensityScale: 1.0,
  });
  const secondary = secondaryLocation && secondaryLocation !== "None"
    ? applyOriginPropagation(t, secondaryLocation, secondarySeverity, {
        emissiveHex: PURPLE,
        intensityScale: 0.75,
      })
    : { affected: [], upstream: [], originIndex: -1, curves: [] };

  const affected = [...primary.affected, ...secondary.affected];
  const upstreamMeshes = [...primary.upstream, ...secondary.upstream];
  createPropagationParticles(t, [...primary.curves, ...secondary.curves]);

  t.propagationAffectedMeshes = affected;
  t.propagationUpstreamMeshes = upstreamMeshes;
  t.propagationOriginIndex = primary.originIndex;
  t.propagationReach = { downstream: 2, upstream: 1, intensity: 0.6 };
  t.propagationState = { phase: 0 };
  t._lastLeakPropagation = {
    leakLocation: primaryLocation,
    secondaryLocation,
    severity: primarySeverity,
  };
}

/** Called inside the existing animation loop — no new rAF. */
export function tickLeakPropagation(t, dt, elapsed) {
  if (!t?.propagationUpstreamMeshes?.length) return;

  const pulse = 0.1 + ((Math.sin(elapsed * Math.PI) + 1) / 2) * 0.2;
  t.propagationUpstreamMeshes.forEach((mesh) => {
    const mat = mesh.material;
    if (mat?.emissive) mat.emissiveIntensity = pulse;
  });

  if (t.propagationPts?.visible && t.propagationCurves?.length) {
    const pos = t.propagationPts.geometry.attributes.position.array;
    const spd = 0.4 * 0.044 * (t.pSpeed || 1);
    for (let i = 0; i < t.propagationCount; i++) {
      t.propagationOff[i] = (t.propagationOff[i] + dt * spd) % 1;
      const pt = t.propagationCurves[t.propagationSeg[i]].getPointAt(t.propagationOff[i]);
      pos[i * 3] = pt.x;
      pos[i * 3 + 1] = pt.y;
      pos[i * 3 + 2] = pt.z;
    }
    t.propagationPts.geometry.attributes.position.needsUpdate = true;
  }
}
