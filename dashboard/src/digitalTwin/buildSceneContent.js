/**
 * Sensors, flow blips, GNN lines, and leak FX — built from engine layout profile.
 */
import * as THREE from "three";
import { ENGINE_COLORS as C } from "./engineMaterials.js";
import { GNN_EDGES } from "./gnnEdges.js";

function mkBlips(n, col, sz) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.PointsMaterial({
    color: col, size: sz, transparent: true, opacity: 0.95,
    blending: THREE.NormalBlending, depthWrite: false, depthTest: false,
    sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 15;
  return pts;
}

function buildSegMeta(segCounts) {
  const seg = [], off = [];
  segCounts.forEach((count, segIdx) => {
    for (let n = 0; n < count; n++) {
      seg.push(segIdx);
      off.push(Math.random());
    }
  });
  return { seg, off, total: off.length };
}

function mkCurve(pts) {
  return new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
}

export function buildSceneContent(parent, layout) {
  const sensorMeshes = {};
  layout.sensorDefs.forEach((s) => {
    const mat = new THREE.MeshPhongMaterial({
      color: 0x00ccff, emissive: 0x002244, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.95, shininess: 160,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.068, 14, 14), mat);
    mesh.position.set(...s.pos);
    mesh.userData = { id: s.id, s };
    parent.add(mesh);
    sensorMeshes[s.id] = mesh;
    const hl = new THREE.PointLight(0x00ccff, 0.25, 0.9);
    hl.position.set(...s.pos);
    parent.add(hl);
    mesh.userData.haloLight = hl;
  });

  const intakeCurves = layout.pipes.intake.map(mkCurve);
  const exhaustCurves = layout.pipes.exhaust.map(mkCurve);
  const egrCurve = mkCurve(layout.egrPath);

  const intakeMeta = buildSegMeta(layout.flowBlips.intakeSegCounts);
  const exhaustMeta = buildSegMeta(layout.flowBlips.exhaustSegCounts);

  const intakePts = mkBlips(intakeMeta.total, 0x4488ff, 0.055);
  const exhaustPts = mkBlips(exhaustMeta.total, 0xff6622, 0.055);
  const egrPts = mkBlips(layout.flowBlips.egrCount, C.gFlow, 0.045);
  egrPts.visible = false;
  parent.add(intakePts);
  parent.add(exhaustPts);
  parent.add(egrPts);

  const gnnVerts = [];
  GNN_EDGES.forEach(([a, b]) => {
    const sA = layout.sensorDefs.find((x) => x.id === a);
    const sB = layout.sensorDefs.find((x) => x.id === b);
    if (sA && sB) gnnVerts.push(...sA.pos, ...sB.pos);
  });
  const gnnGeo = new THREE.BufferGeometry();
  gnnGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(gnnVerts), 3));
  const gnnLines = new THREE.LineSegments(gnnGeo, new THREE.LineBasicMaterial({
    color: 0x00ddff, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  }));
  gnnLines.visible = false;
  parent.add(gnnLines);

  const leakSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 18, 18),
    new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0 })
  );
  parent.add(leakSphere);
  const leakRings = [];
  for (let i = 0; i < 8; i++) {
    const rm = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.10, 22), rm);
    ring.rotation.x = -Math.PI / 2;
    parent.add(ring);
    leakRings.push({ ring, rm, phase: i / 8 });
  }

  const secondaryLeakSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 18, 18),
    new THREE.MeshBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0 })
  );
  parent.add(secondaryLeakSphere);
  const secondaryLeakRings = [];
  for (let i = 0; i < 6; i++) {
    const rm = new THREE.MeshBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.09, 22), rm);
    ring.rotation.x = -Math.PI / 2;
    parent.add(ring);
    secondaryLeakRings.push({ ring, rm, phase: i / 6 });
  }

  return {
    sensorMeshes,
    intakePts, exhaustPts, egrPts,
    intakeCurves, exhaustCurves, egrCurve,
    iSeg: intakeMeta.seg, eSeg: exhaustMeta.seg,
    iOff: intakeMeta.off, eOff: exhaustMeta.off,
    gOff: Array.from({ length: layout.flowBlips.egrCount }, () => Math.random()),
    intakeCount: intakeMeta.total,
    exhaustCount: exhaustMeta.total,
    gnnLines, leakSphere, leakRings, secondaryLeakSphere, secondaryLeakRings,
  };
}

export function rebuildGnnLines(gnnLines, sensorDefs) {
  const gnnVerts = [];
  GNN_EDGES.forEach(([a, b]) => {
    const sA = sensorDefs.find((x) => x.id === a);
    const sB = sensorDefs.find((x) => x.id === b);
    if (sA && sB) gnnVerts.push(...sA.pos, ...sB.pos);
  });
  gnnLines.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(gnnVerts), 3));
  gnnLines.geometry.attributes.position.needsUpdate = true;
}
