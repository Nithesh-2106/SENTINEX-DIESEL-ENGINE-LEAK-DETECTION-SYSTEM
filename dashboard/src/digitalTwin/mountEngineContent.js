/**
 * Mount or remount engine geometry + dynamic scene content into the content group.
 */
import * as THREE from "three";
import { buildEngineScene } from "./buildEngine.js";
import { buildSceneContent } from "./buildSceneContent.js";
import { disposeObject3D } from "./disposeContent.js";
import { clearLeakPropagation } from "./leakPropagation.js";
import { clearLeakPhysics } from "./leakPhysics.js";
import { clearSensorDots } from "./sensorMode.js";
import { clearShapMode } from "./shapOverlay.js";
import { exitHologramMode } from "./hologramMode.js";

export function mountEngineContent(t, layout, flowToggles = {}) {
  const { intakeOn = true, exhaustOn = true } = flowToggles;

  if (!t.contentGroup) {
    t.contentGroup = new THREE.Group();
    t.contentGroup.name = "engine-content";
    t.scene.add(t.contentGroup);
  } else {
    clearLeakPropagation(t);
    clearLeakPhysics(t);
    clearSensorDots(t);
    clearShapMode(t);
    exitHologramMode(t);
    disposeObject3D(t.contentGroup);
    while (t.contentGroup.children.length > 0) {
      t.contentGroup.remove(t.contentGroup.children[0]);
    }
  }

  const eng = buildEngineScene(t.contentGroup, layout);
  eng.flowGlowMeshes.intake.forEach((mesh) => { mesh.visible = !intakeOn; });
  eng.flowGlowMeshes.exhaust.forEach((mesh) => { mesh.visible = !exhaustOn; });

  const content = buildSceneContent(t.contentGroup, layout);

  Object.assign(t, {
    layout,
    layoutId: layout.id,
    eng,
    sensorDefs: layout.sensorDefs,
    zoneAnchors: layout.zoneAnchors,
    leakPositions: layout.leakPositions,
    turboRpmRef: layout.turboRpmRef,
    pistonStroke: layout.pistonStroke,
    sensorMeshes: content.sensorMeshes,
    sensorMeshArray: Object.values(content.sensorMeshes),
    intakePts: content.intakePts,
    exhaustPts: content.exhaustPts,
    egrPts: content.egrPts,
    intakeCurves: content.intakeCurves,
    exhaustCurves: content.exhaustCurves,
    egrCurve: content.egrCurve,
    iSeg: content.iSeg,
    eSeg: content.eSeg,
    iOff: content.iOff,
    eOff: content.eOff,
    gOff: content.gOff,
    intakeCount: content.intakeCount,
    exhaustCount: content.exhaustCount,
    gnnLines: content.gnnLines,
    leakSphere: content.leakSphere,
    leakRings: content.leakRings,
    secondaryLeakSphere: content.secondaryLeakSphere,
    secondaryLeakRings: content.secondaryLeakRings,
    componentMeshes: eng.componentMeshes,
    componentGroups: eng.componentGroups,
    showScrZones: layout.hasScr,
    activeLeakClass: null,
    shapOriginalMaterials: null,
    shapModeActive: false,
  });

  if (t.leakSphere) t.leakSphere.material.opacity = 0;
  t.leakRings?.forEach((lr) => { lr.rm.opacity = 0; });
  if (t.secondaryLeakSphere) t.secondaryLeakSphere.material.opacity = 0;
  t.secondaryLeakRings?.forEach((lr) => { lr.rm.opacity = 0; });

  return t;
}
