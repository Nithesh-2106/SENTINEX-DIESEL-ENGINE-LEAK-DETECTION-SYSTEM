/**
 * Hologram mode — practical leak inspection with cinematic extract/drag.
 */
import * as THREE from "three";
import {
  ZONE_TO_COMPONENT,
  COMPONENT_SENSOR_MAP,
  LEAK_ORIGIN_COMPONENT,
  AIR_PATH_SEQUENCE,
} from "./componentSensorMap.js";

const HOLO_CYAN = 0x00d4ff;
const HOLO_BLUE = 0x2266ff;
const LEAK_RED = 0xff3355;
const LEAK_AMBER = 0xffaa22;
const LEAK_PURPLE = 0x7c3aed;
const STATUS_GREEN = 0x1d9e75;
const SENSOR_FAULT_AMBER = 0xf59e0b;

function zoneBasePosition(layout, componentKey) {
  const zoneId = Object.entries(ZONE_TO_COMPONENT).find(([, k]) => k === componentKey)?.[0];
  const zone = layout?.zoneAnchors?.find((z) => z.id === zoneId);
  return zone ? new THREE.Vector3(...zone.pos) : new THREE.Vector3(0, 0.7, 0);
}

function getComponentGroup(t, componentKey) {
  return t.componentGroups?.[componentKey] ?? null;
}

function safeSetColor(mat, hex) {
  mat?.color?.setHex?.(hex);
}

function safeSetEmissive(mat, hex, intensity = 0.5) {
  if (!mat?.emissive) return;
  mat.emissive.setHex(hex);
  mat.emissiveIntensity = intensity;
}

function storeMaterialState(mats, store) {
  mats.forEach((m) => {
    if (!m || store.has(m.uuid)) return;
    store.set(m.uuid, {
      color: m.color?.getHex?.() ?? 0xffffff,
      emissive: m.emissive?.getHex?.() ?? 0x000000,
      emissiveIntensity: m.emissiveIntensity ?? 0,
      opacity: m.opacity ?? 1,
      transparent: m.transparent ?? false,
      depthWrite: m.depthWrite ?? true,
    });
  });
}

function restoreMaterials(mats, store) {
  mats.forEach((m) => {
    const orig = store.get(m.uuid);
    if (!orig || !m) return;
    safeSetColor(m, orig.color);
    safeSetEmissive(m, orig.emissive, orig.emissiveIntensity);
    m.opacity = orig.opacity;
    m.transparent = orig.transparent;
    m.depthWrite = orig.depthWrite;
  });
}

function clearHoloMeshOverrides(t) {
  Object.values(t.componentMeshes || {}).forEach((entries) => {
    entries.forEach(({ mesh, material }) => {
      if (mesh.userData._holoMat) {
        mesh.material = material;
        mesh.userData._holoMat.dispose?.();
        delete mesh.userData._holoMat;
      }
    });
  });
}

function disposeHoloRings(t) {
  if (!t.holoRingMeshes) return;
  t.holoRingMeshes.forEach((ring) => {
    t.contentGroup?.remove(ring);
    ring.geometry?.dispose();
    ring.material?.dispose();
  });
  t.holoRingMeshes = [];
}

function disposeHoloFx(t) {
  if (t.holoScanPlane) {
    t.contentGroup?.remove(t.holoScanPlane);
    t.holoScanPlane.geometry?.dispose();
    t.holoScanPlane.material?.dispose();
    t.holoScanPlane = null;
  }
  disposeHoloRings(t);
}

/** Per-component health status for hologram HUD */
export function getComponentHoloStatus(componentKey, leakLocation, faultCtx = null) {
  if (faultCtx?.faultyComponentKey && componentKey === faultCtx.faultyComponentKey) {
    return {
      status: "SENSOR_FAULT",
      color: "#f59e0b",
      label: faultCtx.faultySensorLabel || "SENSOR FAULT",
      severity: 2,
      faultySensorKey: faultCtx.faultySensorKey || null,
    };
  }
  if (!leakLocation || leakLocation === "None") {
    return { status: "NORMAL", color: "#00d4ff", label: "NOMINAL", severity: 0 };
  }
  const originKey = LEAK_ORIGIN_COMPONENT[leakLocation];
  if (!originKey) {
    return { status: "NORMAL", color: "#00d4ff", label: "NOMINAL", severity: 0 };
  }
  if (componentKey === originKey) {
    return { status: "LEAK_ORIGIN", color: "#ff3355", label: "LEAK ORIGIN", severity: 3 };
  }
  const oi = AIR_PATH_SEQUENCE.indexOf(originKey);
  const ci = AIR_PATH_SEQUENCE.indexOf(componentKey);
  if (oi >= 0 && ci > oi) {
    return { status: "DOWNSTREAM", color: "#ffaa22", label: "DOWNSTREAM", severity: 2 };
  }
  if (oi >= 0 && ci < oi) {
    return { status: "UPSTREAM", color: "#378add", label: "UPSTREAM OK", severity: 0 };
  }
  return { status: "NORMAL", color: "#00d4ff", label: "NOMINAL", severity: 0 };
}

export function getAllComponentStatuses(leakLocation, options = {}) {
  const { hasScr = true, faultCtx = null } = options;
  return Object.keys(COMPONENT_SENSOR_MAP)
    .filter((key) => hasScr || key !== "SCR")
    .map((key) => ({
      componentKey: key,
      displayName: COMPONENT_SENSOR_MAP[key].displayName,
      ...getComponentHoloStatus(key, leakLocation, faultCtx),
    }));
}

/** Per-component status when two independent leaks are active. */
export function getComponentHoloStatusMulti(componentKey, primaryLocation, secondaryLocation, faultCtx = null) {
  if (faultCtx?.faultyComponentKey && componentKey === faultCtx.faultyComponentKey) {
    return {
      status: "SENSOR_FAULT",
      color: "#f59e0b",
      label: faultCtx.faultySensorLabel || "SENSOR FAULT",
      severity: 2,
      faultySensorKey: faultCtx.faultySensorKey || null,
    };
  }
  const primary = getComponentHoloStatus(componentKey, primaryLocation);
  const secondary = secondaryLocation
    ? getComponentHoloStatus(componentKey, secondaryLocation)
    : null;

  const isPrimaryOrigin = primary.status === "LEAK_ORIGIN";
  const isSecondaryOrigin = secondary?.status === "LEAK_ORIGIN";

  if (isPrimaryOrigin && isSecondaryOrigin) {
    return {
      status: "LEAK_ORIGIN",
      color: "#ff3355",
      label: "DUAL LEAK ORIGIN",
      leakRole: "both",
      severity: 3,
    };
  }
  if (isPrimaryOrigin) {
    return { ...primary, leakRole: "primary", label: "PRIMARY LEAK ORIGIN" };
  }
  if (isSecondaryOrigin) {
    return {
      ...secondary,
      color: "#a855f7",
      leakRole: "secondary",
      label: "SECONDARY LEAK ORIGIN",
    };
  }
  if (primary.status === "DOWNSTREAM" || secondary?.status === "DOWNSTREAM") {
    return { status: "DOWNSTREAM", color: "#ffaa22", label: "DOWNSTREAM", severity: 2 };
  }
  if (primary.status === "UPSTREAM" && (!secondary || secondary.status === "UPSTREAM")) {
    return primary;
  }
  return primary.status !== "NORMAL" ? primary : (secondary || primary);
}

export function getAllComponentStatusesMulti(primaryLocation, secondaryLocation, options = {}) {
  const { hasScr = true, faultCtx = null } = options;
  return Object.keys(COMPONENT_SENSOR_MAP)
    .filter((key) => hasScr || key !== "SCR")
    .map((key) => ({
      componentKey: key,
      displayName: COMPONENT_SENSOR_MAP[key].displayName,
      ...getComponentHoloStatusMulti(key, primaryLocation, secondaryLocation, faultCtx),
    }));
}

/** Resolve which active leak's RCA/SHAP applies when a hologram part is selected. */
export function resolveLeakContextForComponent(componentKey, primaryLocation, secondaryLocation) {
  const primaryOrigin = LEAK_ORIGIN_COMPONENT[primaryLocation];
  const secondaryOrigin = secondaryLocation ? LEAK_ORIGIN_COMPONENT[secondaryLocation] : null;

  if (componentKey === primaryOrigin) {
    return { location: primaryLocation, role: primaryOrigin === secondaryOrigin ? "both" : "primary" };
  }
  if (secondaryOrigin && componentKey === secondaryOrigin) {
    return { location: secondaryLocation, role: "secondary" };
  }
  return { location: primaryLocation, role: "reference" };
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

export function animateComponentTo(t, componentKey, targetPos, options = {}) {
  const grp = getComponentGroup(t, componentKey);
  if (!grp) return;

  const {
    duration = 0.85,
    targetScale = 1.06,
    onComplete = null,
  } = options;

  if (!t.holoAnims) t.holoAnims = [];
  t.holoAnims = t.holoAnims.filter((a) => a.group !== grp);

  t.holoAnims.push({
    group: grp,
    componentKey,
    startPos: grp.position.clone(),
    targetPos: targetPos instanceof THREE.Vector3 ? targetPos : new THREE.Vector3(...targetPos),
    startScale: grp.scale.clone(),
    targetScale: new THREE.Vector3(targetScale, targetScale, targetScale),
    elapsed: 0,
    duration,
    ease: options.bounce ? easeOutBack : easeOutCubic,
    onComplete,
  });
}

export function tickHologramAnimations(t, dt) {
  if (!t.holoAnims?.length) return;

  t.holoAnims = t.holoAnims.filter((anim) => {
    anim.elapsed += dt;
    const p = Math.min(1, anim.elapsed / anim.duration);
    const e = anim.ease(p);
    anim.group.position.lerpVectors(anim.startPos, anim.targetPos, e);
    anim.group.scale.lerpVectors(anim.startScale, anim.targetScale, e);

    if (p >= 1) {
      anim.onComplete?.();
      return false;
    }
    return true;
  });

  updateHoloRingsPosition(t);
}

function updateHoloRingsPosition(t) {
  if (!t.holoRingMeshes?.length || !t.holoSelectedPart) return;
  const grp = getComponentGroup(t, t.holoSelectedPart);
  if (!grp) return;
  const base = zoneBasePosition(t.layout, t.holoSelectedPart);
  const center = base.clone().add(grp.position);
  center.y -= 0.5;
  t.holoRingMeshes.forEach((ring) => { ring.position.copy(center); });
}

export function enterHologramMode(t) {
  if (!t?.eng) return;

  try {
    if (!t.holoMaterialStore) t.holoMaterialStore = new Map();
    const store = t.holoMaterialStore;
    store.clear();

    const { solidMats, wireMats, interiorMats, glowMats, flowGlowMats, pistonMats } = t.eng;
    [solidMats, wireMats, interiorMats, glowMats, flowGlowMats, pistonMats].forEach((arr) => storeMaterialState(arr, store));

    solidMats.forEach((m) => {
      safeSetColor(m, HOLO_CYAN);
      safeSetEmissive(m, HOLO_CYAN, 0.5);
      m.opacity = 0.16;
      m.transparent = true;
      m.depthWrite = false;
    });
    wireMats.forEach((m) => {
      safeSetColor(m, HOLO_CYAN);
      m.opacity = 0.88;
      m.transparent = true;
      m.depthWrite = false;
    });
    interiorMats.forEach((m) => {
      safeSetColor(m, HOLO_BLUE);
      safeSetEmissive(m, HOLO_BLUE, 0.4);
      m.opacity = 0.32;
      m.transparent = true;
      m.depthWrite = false;
    });
    glowMats.forEach((m) => {
      safeSetColor(m, HOLO_CYAN);
      m.opacity = 0.28;
      m.transparent = true;
    });
    flowGlowMats.forEach((m) => { m.opacity = 0.08; });
    pistonMats.forEach((m) => {
      safeSetColor(m, HOLO_CYAN);
      safeSetEmissive(m, HOLO_CYAN, 0.7);
      m.opacity = 0.72;
    });

    if (t.scene?.fog) t.scene.fog.density = 0.00012;

    if (t.intakePts) {
      t._holoSavedIntakeVisible = t.intakePts.visible;
      t.intakePts.visible = false;
    }
    if (t.exhaustPts) {
      t._holoSavedExhaustVisible = t.exhaustPts.visible;
      t.exhaustPts.visible = false;
    }
    if (t.egrPts) {
      t._holoSavedEgrVisible = t.egrPts.visible;
      t.egrPts.visible = false;
    }
    if (t.propagationPts) t.propagationPts.visible = false;

    disposeHoloFx(t);
    t.holoRingMeshes = [];

    const scanGeo = new THREE.PlaneGeometry(12, 0.06);
    const scanMat = new THREE.MeshBasicMaterial({
      color: HOLO_CYAN,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const scanPlane = new THREE.Mesh(scanGeo, scanMat);
    scanPlane.rotation.x = -Math.PI / 2;
    scanPlane.position.y = -1.05;
    scanPlane.renderOrder = 30;
    t.contentGroup?.add(scanPlane);
    t.holoScanPlane = scanPlane;

    Object.entries(t.componentGroups || {}).forEach(([key, grp]) => {
      grp.userData.holoBasePos = zoneBasePosition(t.layout, key);
      grp.userData.holoExtracted = false;
      grp.position.set(0, 0, 0);
      grp.scale.set(1, 1, 1);
    });

    t.holoAnims = [];
    t.hologramModeActive = true;
    t.holoSelectedPart = null;
    t.setHoloSelectedPart?.(null);
  } catch (err) {
    console.error("[Hologram] enter failed:", err);
    t.hologramModeActive = false;
  }
}

export function exitHologramMode(t) {
  if (!t?.eng) return;

  clearHoloMeshOverrides(t);
  t.holoAnims = [];

  if (t.hologramModeActive && t.holoMaterialStore) {
    const { solidMats, wireMats, interiorMats, glowMats, flowGlowMats, pistonMats } = t.eng;
    restoreMaterials(solidMats, t.holoMaterialStore);
    restoreMaterials(wireMats, t.holoMaterialStore);
    restoreMaterials(interiorMats, t.holoMaterialStore);
    restoreMaterials(glowMats, t.holoMaterialStore);
    restoreMaterials(flowGlowMats, t.holoMaterialStore);
    restoreMaterials(pistonMats, t.holoMaterialStore);
    t.holoMaterialStore.clear();
  }

  Object.values(t.componentGroups || {}).forEach((grp) => {
    grp.position.set(0, 0, 0);
    grp.scale.set(1, 1, 1);
    grp.userData.holoExtracted = false;
  });

  disposeHoloFx(t);
  if (t.scene?.fog) t.scene.fog.density = 0.002;

  if (t.intakePts) t.intakePts.visible = t._holoSavedIntakeVisible ?? true;
  if (t.exhaustPts) t.exhaustPts.visible = t._holoSavedExhaustVisible ?? true;
  if (t.egrPts) t.egrPts.visible = t._holoSavedEgrVisible ?? false;
  if (t.propagationPts) t.propagationPts.visible = true;

  t.hologramModeActive = false;
  t.holoDrag = null;
  t.holoSelectedPart = null;
  t.setHoloSelectedPart?.(null);
}

function computeExtractTarget(t, componentKey, options = {}) {
  const { role = "primary" } = options;
  const base = zoneBasePosition(t.layout, componentKey);
  const pullDir = new THREE.Vector3(base.x, 0, base.z).normalize();
  if (pullDir.lengthSq() < 0.01) pullDir.set(1, 0, 0.5).normalize();

  // Pull secondary origins the opposite way so both parts separate visibly in multi-leak.
  if (role === "secondary") {
    pullDir.x *= -1.15;
    pullDir.z *= -0.9;
  }

  const distance = role === "secondary" ? 2.1 : 2.4;
  const lift = role === "secondary" ? 0.9 : 1.0;
  return new THREE.Vector3(
    pullDir.x * distance,
    base.y * 0.35 + lift,
    pullDir.z * distance,
  );
}

export function cinematicExtractLeakPart(t, leakOriginKey, options = {}) {
  const {
    role = "primary",
    selectOnComplete = true,
    delay = 0,
  } = options;

  const run = () => {
    const target = computeExtractTarget(t, leakOriginKey, { role });
    const grp = getComponentGroup(t, leakOriginKey);
    if (grp) grp.userData.holoExtracted = true;

    animateComponentTo(t, leakOriginKey, target, {
      duration: role === "secondary" ? 1.0 : 1.1,
      targetScale: role === "secondary" ? 1.1 : 1.12,
      bounce: true,
      onComplete: () => {
        highlightHologramPart(t, leakOriginKey, true);
        if (selectOnComplete) {
          t.holoSelectedPart = leakOriginKey;
          t.setHoloSelectedPart?.(leakOriginKey);
        }
      },
    });
    selectHologramPart(t, leakOriginKey, { skipHighlight: true });
  };

  if (delay > 0) {
    window.setTimeout(run, delay * 1000);
  } else {
    run();
  }
}

export function resetComponentPosition(t, componentKey) {
  animateComponentTo(t, componentKey, new THREE.Vector3(0, 0, 0), {
    duration: 0.7,
    targetScale: 1,
    onComplete: () => {
      const grp = getComponentGroup(t, componentKey);
      if (grp) grp.userData.holoExtracted = false;
      highlightHologramPart(t, componentKey, false);
    },
  });
}

export function instantResetHologramAssembly(t) {
  if (!t?.componentGroups) return;

  t.holoAnims = [];
  t.holoDrag = null;

  Object.values(t.componentGroups).forEach((grp) => {
    grp.position.set(0, 0, 0);
    grp.scale.set(1, 1, 1);
    grp.userData.holoExtracted = false;
  });

  clearHoloMeshOverrides(t);
  disposeHoloRings(t);
  t.holoRingMeshes = [];

  Object.keys(t.componentGroups).forEach((key) => {
    tintComponentMeshes(t, key, HOLO_CYAN, 0.5, 0.16);
  });

  t.holoSelectedPart = null;
  t.setHoloSelectedPart?.(null);
}

export function resetAllComponentPositions(t) {
  Object.keys(t.componentGroups || {}).forEach((key) => resetComponentPosition(t, key));
  t.holoSelectedPart = null;
  t.setHoloSelectedPart?.(null);
}

function tintComponentMeshes(t, componentKey, colorHex, emissiveIntensity, opacity) {
  (t.componentMeshes?.[componentKey] || []).forEach(({ mesh, material }) => {
    let mat = mesh.userData._holoMat;
    if (!mat) {
      mat = material.clone();
      mesh.userData._holoMat = mat;
      mesh.material = mat;
    }
    safeSetColor(mat, colorHex);
    safeSetEmissive(mat, colorHex, emissiveIntensity);
    mat.opacity = opacity;
    mat.transparent = true;
    mat.depthWrite = false;
  });
}

function highlightHologramPart(t, componentKey, active) {
  if (!active) {
    tintComponentMeshes(t, componentKey, HOLO_CYAN, 0.5, 0.16);
    if (t.holoSelectedPart === componentKey) disposeHoloRings(t);
    return;
  }

  const isPrimaryLeak = componentKey === t.holoLeakOriginKey;
  const isSecondaryLeak = componentKey === t.holoSecondaryOriginKey && !isPrimaryLeak;
  const isLeak = isPrimaryLeak || isSecondaryLeak;
  const col = isSecondaryLeak ? LEAK_PURPLE : isPrimaryLeak ? LEAK_RED : LEAK_AMBER;
  tintComponentMeshes(
    t,
    componentKey,
    col,
    isLeak ? (isSecondaryLeak ? 0.95 : 1.1) : 0.65,
    isLeak ? (isSecondaryLeak ? 0.34 : 0.38) : 0.24,
  );

  disposeHoloRings(t);
  t.holoRingMeshes = [];
  const base = zoneBasePosition(t.layout, componentKey);
  const grp = getComponentGroup(t, componentKey);
  const center = grp ? base.clone().add(grp.position) : base;
  const ringCol = isSecondaryLeak ? LEAK_PURPLE : isPrimaryLeak ? LEAK_RED : LEAK_AMBER;

  [1.0, 1.25].forEach((r, i) => {
    const rm = new THREE.MeshBasicMaterial({
      color: ringCol,
      transparent: true,
      opacity: 0.4 - i * 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.05, 32), rm);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(center);
    ring.position.y -= 0.45;
    ring.renderOrder = 28;
    t.contentGroup?.add(ring);
    t.holoRingMeshes.push(ring);
  });
}

export function selectHologramPart(t, componentKey, options = {}) {
  if (!t.hologramModeActive) return;

  const useMulti = Boolean(t.holoSecondaryLeakLocation);
  Object.keys(t.componentGroups || {}).forEach((key) => {
    if (key !== componentKey) {
      const st = useMulti
        ? getComponentHoloStatusMulti(key, t.holoLeakLocation, t.holoSecondaryLeakLocation)
        : getComponentHoloStatus(key, t.holoLeakLocation);
      if (st.status === "DOWNSTREAM") {
        tintComponentMeshes(t, key, LEAK_AMBER, 0.3, 0.18);
      } else if (st.status === "LEAK_ORIGIN") {
        const originCol = st.leakRole === "secondary" ? LEAK_PURPLE : LEAK_RED;
        tintComponentMeshes(t, key, originCol, st.leakRole === "secondary" ? 0.45 : 0.55, 0.2);
      } else if (st.status !== "LEAK_ORIGIN") {
        tintComponentMeshes(t, key, HOLO_CYAN, 0.45, 0.14);
      }
    }
  });

  if (componentKey && !options.skipHighlight) {
    const grp = getComponentGroup(t, componentKey);
    const isPrimaryOrigin = componentKey === t.holoLeakOriginKey;
    const isSecondaryOrigin = componentKey === t.holoSecondaryOriginKey && !isPrimaryOrigin;

    if (grp && !grp.userData.holoExtracted && (isPrimaryOrigin || isSecondaryOrigin)) {
      t.holoSelectedPart = componentKey;
      t.setHoloSelectedPart?.(componentKey);
      cinematicExtractLeakPart(t, componentKey, {
        role: isSecondaryOrigin ? "secondary" : "primary",
        selectOnComplete: true,
      });
      return;
    }

    highlightHologramPart(t, componentKey, true);
    if (grp && !grp.userData.holoExtracted) {
      animateComponentTo(t, componentKey, grp.position.clone(), {
        duration: 0.35,
        targetScale: 1.04,
      });
    }
  }

  t.holoSelectedPart = componentKey;
  t.setHoloSelectedPart?.(componentKey);
}

export function raycastHologramComponent(t, mouseNDC, camera) {
  if (!t.hologramModeActive || !t.componentGroups) return null;

  const hits = [];
  Object.entries(t.componentGroups).forEach(([key, grp]) => {
    const meshes = [];
    grp.traverse((obj) => { if (obj.isMesh && !obj.userData?.isSensorDot) meshes.push(obj); });
    if (!meshes.length) return;
    t.raycaster.setFromCamera(mouseNDC, camera);
    const intersects = t.raycaster.intersectObjects(meshes, false);
    if (intersects.length > 0) hits.push({ key, dist: intersects[0].distance });
  });

  if (!hits.length) return null;
  hits.sort((a, b) => a.dist - b.dist);
  return hits[0].key;
}

export function startHologramDrag(t, componentKey, mouseNDC, camera) {
  const grp = getComponentGroup(t, componentKey);
  if (!grp) return;

  const normal = new THREE.Vector3();
  camera.getWorldDirection(normal);
  const worldPos = new THREE.Vector3();
  grp.getWorldPosition(worldPos);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, worldPos);

  const hit = new THREE.Vector3();
  t.raycaster.setFromCamera(mouseNDC, camera);
  t.raycaster.ray.intersectPlane(plane, hit);

  t.holoAnims = t.holoAnims?.filter((a) => a.group !== grp) || [];

  t.holoDrag = {
    componentKey,
    plane,
    offset: worldPos.clone().sub(hit),
    group: grp,
    targetPos: grp.position.clone(),
    smoothPos: grp.position.clone(),
  };
  selectHologramPart(t, componentKey);
}

export function updateHologramDrag(t, mouseNDC, camera, dt = 0.016) {
  if (!t.holoDrag?.group) return;
  const hit = new THREE.Vector3();
  t.raycaster.setFromCamera(mouseNDC, camera);
  if (!t.raycaster.ray.intersectPlane(t.holoDrag.plane, hit)) return;

  const target = hit.add(t.holoDrag.offset);
  const parent = t.holoDrag.group.parent;
  if (parent) parent.worldToLocal(target);

  t.holoDrag.targetPos.copy(target);
  const smooth = Math.min(1, dt * 14);
  t.holoDrag.smoothPos.lerp(t.holoDrag.targetPos, smooth);
  t.holoDrag.group.position.copy(t.holoDrag.smoothPos);
  t.holoDrag.group.userData.holoExtracted = true;
  t.holoDrag.group.scale.setScalar(1.08);

  updateHoloRingsPosition(t);
}

export function endHologramDrag(t) {
  if (!t.holoDrag?.group) {
    t.holoDrag = null;
    return;
  }
  const key = t.holoDrag.componentKey;
  const pos = t.holoDrag.group.position.clone();
  animateComponentTo(t, key, pos, {
    duration: 0.25,
    targetScale: 1.06,
    bounce: true,
  });
  t.holoDrag = null;
}

export function tickHologramFx(t, elapsed, dt = 0.016) {
  if (!t.hologramModeActive) return;

  tickHologramAnimations(t, dt);

  if (t.holoScanPlane) {
    const y = -1.05 + ((Math.sin(elapsed * 0.45) + 1) / 2) * 2.8;
    t.holoScanPlane.position.y = y;
    t.holoScanPlane.material.opacity = 0.2 + Math.sin(elapsed * 2.5) * 0.1;
  }

  t.holoRingMeshes?.forEach((ring, i) => {
    ring.rotation.z = elapsed * 0.35 * (i % 2 === 0 ? 1 : -1);
  });

  const leakKeys = [
    { key: t.holoLeakOriginKey, color: LEAK_RED, phase: 0 },
    { key: t.holoSecondaryOriginKey, color: LEAK_PURPLE, phase: 1.2 },
    { key: t.holoSensorFaultComponentKey, color: SENSOR_FAULT_AMBER, phase: 0.6 },
  ].filter((entry) => entry.key);

  leakKeys.forEach(({ key, color, phase }) => {
    const pulse = 0.65 + Math.sin(elapsed * 2.5 + phase) * 0.35;
    (t.componentMeshes?.[key] || []).forEach(({ mesh }) => {
      const mat = mesh.userData._holoMat || mesh.material;
      safeSetEmissive(mat, color, pulse * 1.1);
    });
  });
}

export function applyHologramMultiLeakContext(t, primaryLocation, secondaryLocation, options = {}) {
  const { resetFirst = false } = options;

  t.holoLeakLocation = primaryLocation;
  t.holoSecondaryLeakLocation = secondaryLocation;
  t.holoSensorFaultComponentKey = null;
  t.holoSensorFaultSensorKey = null;
  const primaryOrigin = primaryLocation && primaryLocation !== "None"
    ? LEAK_ORIGIN_COMPONENT[primaryLocation]
    : null;
  const secondaryOrigin = secondaryLocation && secondaryLocation !== "None"
    ? LEAK_ORIGIN_COMPONENT[secondaryLocation]
    : null;
  t.holoLeakOriginKey = primaryOrigin;
  t.holoSecondaryOriginKey = secondaryOrigin;

  if (!t.hologramModeActive) return;

  if (resetFirst) {
    instantResetHologramAssembly(t);
  }

  Object.keys(t.componentGroups || {}).forEach((key) => {
    const primarySt = getComponentHoloStatus(key, primaryLocation);
    const secondarySt = secondaryLocation
      ? getComponentHoloStatus(key, secondaryLocation)
      : { status: "NORMAL" };

    if (primarySt.status === "LEAK_ORIGIN") {
      tintComponentMeshes(t, key, LEAK_RED, 0.55, 0.2);
    } else if (secondarySt.status === "LEAK_ORIGIN") {
      tintComponentMeshes(t, key, LEAK_PURPLE, 0.45, 0.18);
    } else if (primarySt.status === "DOWNSTREAM" || secondarySt.status === "DOWNSTREAM") {
      tintComponentMeshes(t, key, LEAK_AMBER, 0.28, 0.16);
    } else if (primarySt.status === "NORMAL" && secondarySt.status === "NORMAL") {
      tintComponentMeshes(t, key, STATUS_GREEN, 0.15, 0.12);
    } else {
      tintComponentMeshes(t, key, HOLO_CYAN, 0.5, 0.16);
    }
  });

  if (primaryOrigin) {
    cinematicExtractLeakPart(t, primaryOrigin, { role: "primary", selectOnComplete: true });
    if (secondaryOrigin && secondaryOrigin !== primaryOrigin) {
      cinematicExtractLeakPart(t, secondaryOrigin, {
        role: "secondary",
        selectOnComplete: false,
        delay: 0.45,
      });
    }
  } else if (secondaryOrigin) {
    cinematicExtractLeakPart(t, secondaryOrigin, { role: "secondary", selectOnComplete: true });
  } else {
    t.holoSelectedPart = null;
    t.setHoloSelectedPart?.(null);
  }
}

export function applyHologramLeakContext(t, leakLocation, options = {}) {
  const { resetFirst = false } = options;

  t.holoLeakLocation = leakLocation;
  t.holoSecondaryLeakLocation = null;
  t.holoSecondaryOriginKey = null;
  t.holoSensorFaultComponentKey = null;
  t.holoSensorFaultSensorKey = null;
  const originKey = leakLocation && leakLocation !== "None"
    ? LEAK_ORIGIN_COMPONENT[leakLocation]
    : null;
  t.holoLeakOriginKey = originKey;

  if (!t.hologramModeActive) return;

  if (resetFirst) {
    instantResetHologramAssembly(t);
  }

  Object.keys(t.componentGroups || {}).forEach((key) => {
    const st = getComponentHoloStatus(key, leakLocation);
    if (st.status === "DOWNSTREAM") {
      tintComponentMeshes(t, key, LEAK_AMBER, 0.28, 0.16);
    } else if (st.status === "LEAK_ORIGIN") {
      tintComponentMeshes(t, key, LEAK_RED, 0.55, 0.2);
    } else if (st.status === "NORMAL") {
      tintComponentMeshes(t, key, STATUS_GREEN, 0.15, 0.12);
    } else {
      tintComponentMeshes(t, key, HOLO_CYAN, 0.5, 0.16);
    }
  });

  if (originKey) {
    cinematicExtractLeakPart(t, originKey);
  } else {
    t.holoSelectedPart = null;
    t.setHoloSelectedPart?.(null);
  }
}

/** Hologram context when SFI isolates a hardware sensor fault (no leak origin). */
export function applyHologramSensorFaultContext(t, faultyComponentKey, faultySensorKey, options = {}) {
  const { resetFirst = false, faultySensorLabel = null } = options;

  t.holoSensorFaultComponentKey = faultyComponentKey || null;
  t.holoSensorFaultSensorKey = faultySensorKey || null;
  t.holoLeakLocation = "None";
  t.holoSecondaryLeakLocation = null;
  t.holoLeakOriginKey = null;
  t.holoSecondaryOriginKey = null;

  if (!t.hologramModeActive) return;

  if (resetFirst) {
    instantResetHologramAssembly(t);
  }

  Object.keys(t.componentGroups || {}).forEach((key) => {
    if (key === faultyComponentKey) {
      tintComponentMeshes(t, key, SENSOR_FAULT_AMBER, 0.65, 0.22);
    } else {
      tintComponentMeshes(t, key, STATUS_GREEN, 0.15, 0.12);
    }
  });

  if (faultyComponentKey) {
    cinematicExtractLeakPart(t, faultyComponentKey, { selectOnComplete: true });
    t.holoSelectedPart = faultyComponentKey;
    t.setHoloSelectedPart?.(faultyComponentKey);
  } else {
    t.holoSelectedPart = null;
    t.setHoloSelectedPart?.(null);
  }

  t.holoSensorFaultLabel = faultySensorLabel;
}

export function getHologramPartAnalysis(
  componentKey,
  readings,
  baselines,
  shapData,
  leakLocation,
  rcaResult = null,
  multiOptions = null,
  faultCtx = null,
) {
  const meta = COMPONENT_SENSOR_MAP[componentKey];
  if (!meta) return null;

  const {
    primaryLocation,
    secondaryLocation,
    primaryRca,
    secondaryRca,
    primaryShap,
    secondaryShap,
    primarySeverity,
    secondarySeverity,
    primaryConfidence,
    secondaryConfidence,
  } = multiOptions || {};

  const useMulti = Boolean(primaryLocation && secondaryLocation);
  const holoStatus = useMulti
    ? getComponentHoloStatusMulti(componentKey, primaryLocation, secondaryLocation, faultCtx)
    : getComponentHoloStatus(componentKey, leakLocation, faultCtx);

  let contextLocation = leakLocation;
  let contextRca = rcaResult;
  let contextShap = shapData;
  let contextSeverity = null;
  let contextConfidence = null;

  if (useMulti) {
    const ctx = resolveLeakContextForComponent(componentKey, primaryLocation, secondaryLocation);
    contextLocation = ctx.location;
    if (ctx.role === "secondary") {
      contextRca = secondaryRca || rcaResult;
      contextShap = secondaryShap || shapData;
      contextSeverity = secondarySeverity;
      contextConfidence = secondaryConfidence;
    } else {
      contextRca = primaryRca || rcaResult;
      contextShap = primaryShap || shapData;
      contextSeverity = primarySeverity;
      contextConfidence = primaryConfidence;
    }
  }

  const originKey = LEAK_ORIGIN_COMPONENT[contextLocation];
  const isLeakOrigin = holoStatus.status === "LEAK_ORIGIN";
  const originIdx = originKey ? AIR_PATH_SEQUENCE.indexOf(originKey) : -1;
  const compIdx = AIR_PATH_SEQUENCE.indexOf(componentKey);
  const isDownstream = !isLeakOrigin && originIdx >= 0 && compIdx > originIdx;

  const shapMap = {};
  (contextShap || shapData || []).forEach((e) => {
    if (e?.sensor) shapMap[e.sensor] = Math.abs(Number(e.shap_impact) || 0);
  });

  const sensors = meta.sensors
    .filter((s) => readings?.[s.key] != null)
    .map((s) => {
      const val = readings[s.key];
      const baseline = baselines?.[s.key] ?? s.baseline;
      const devPct = baseline ? ((val - baseline) / Math.abs(baseline)) * 100 : 0;
      return { ...s, val, baseline, devPct, shap: shapMap[s.key] || 0 };
    })
    .sort((a, b) => Math.abs(b.devPct) - Math.abs(a.devPct));

  const rcaCauses = isLeakOrigin && contextRca?.rankedCauses?.length
    ? contextRca.rankedCauses.slice(0, 3)
    : [];

  const secondaryContext = useMulti && holoStatus.leakRole === "both"
    ? {
        location: secondaryLocation,
        severity: secondarySeverity,
        confidence: secondaryConfidence,
        rcaCauses: secondaryRca?.rankedCauses?.slice(0, 3) || [],
        shapPatternSummary: secondaryRca?.shapPatternSummary,
      }
    : null;

  return {
    componentKey,
    displayName: meta.displayName,
    holoStatus,
    leakRole: holoStatus.leakRole || (isLeakOrigin ? "primary" : null),
    contextLocation,
    isLeakOrigin,
    isDownstream,
    isSensorFault: holoStatus.status === "SENSOR_FAULT",
    sensors,
    topShap: sensors.filter((s) => s.shap > 0).sort((a, b) => b.shap - a.shap).slice(0, 3),
    rcaCauses,
    secondaryContext,
    cascadeExplanation: isLeakOrigin ? contextRca?.cascadeExplanation : null,
    shapPatternSummary: isLeakOrigin ? contextRca?.shapPatternSummary : null,
    contextSeverity,
    contextConfidence,
  };
}
