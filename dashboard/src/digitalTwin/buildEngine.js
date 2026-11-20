/**
 * Procedural engine mesh builder — driven by per-engine layout profile.
 */
import * as THREE from "three";
import { ENGINE_COLORS as C } from "./engineMaterials.js";

export function buildEngineScene(parent, layout) {
  const g = layout.geometry;
  const pipes = layout.pipes;
  const ts = g.turboScale ?? 1.0;

  const solidMats = [], wireMats = [], glowMats = [], interiorMats = [];
  const flowGlowMats = [], pistonMats = [];
  const flowGlowMeshes = { intake: [], exhaust: [] };
  const componentMeshes = {};
  const componentGroups = {};

  function ensureComponentGroup(key) {
    if (!componentGroups[key]) {
      const g = new THREE.Group();
      g.name = `component-${key}`;
      g.userData.componentKey = key;
      parent.add(g);
      componentGroups[key] = g;
    }
    return componentGroups[key];
  }

  function registerComponentMesh(key, mesh, material) {
    if (!key || !mesh) return;
    if (!componentMeshes[key]) componentMeshes[key] = [];
    componentMeshes[key].push({ mesh, material });
  }

  function mkMesh(geo, col) {
    const sm = new THREE.MeshPhongMaterial({
      color: col, transparent: true, opacity: 1,
      emissive: new THREE.Color(col).multiplyScalar(0.20),
      shininess: 95, side: THREE.DoubleSide,
    });
    const wm = new THREE.MeshBasicMaterial({
      color: C.wframe, wireframe: true, transparent: true, opacity: 0, depthWrite: false,
    });
    solidMats.push(sm); wireMats.push(wm);
    return [sm, wm];
  }

  function part(geo, col, pos, rot, componentKey) {
    const [sm, wm] = mkMesh(geo, col);
    const grp = new THREE.Group();
    const m1 = new THREE.Mesh(geo, sm); m1.frustumCulled = false;
    const m2 = new THREE.Mesh(geo, wm); m2.frustumCulled = false;
    m1.userData.role = "engine-body";
    m2.userData.role = "wireframe";
    grp.add(m1); grp.add(m2);
    registerComponentMesh(componentKey, m1, sm);
    if (pos) grp.position.set(...pos);
    if (rot) { grp.rotation.x = rot[0]; grp.rotation.y = rot[1]; grp.rotation.z = rot[2]; }
    const target = componentKey ? ensureComponentGroup(componentKey) : parent;
    target.add(grp);
    return grp;
  }

  function tube(pts, r, col, glowCol, flowTag) {
    const cv = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    const geo = new THREE.TubeGeometry(cv, 36, r, 8, false);
    part(geo, col);
    if (glowCol) {
      const gm = new THREE.MeshBasicMaterial({
        color: glowCol, transparent: true, opacity: 0.18,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
      });
      const glowMesh = new THREE.Mesh(new THREE.TubeGeometry(cv, 36, r * 1.35, 8, false), gm);
      glowMesh.frustumCulled = false;
      glowMesh.userData.role = flowTag === "intake" ? "pipe-intake" : flowTag === "exhaust" ? "pipe-exhaust" : "flow-particle";
      parent.add(glowMesh);
      flowGlowMats.push(gm); glowMats.push(gm);
      if (flowTag === "intake") flowGlowMeshes.intake.push(glowMesh);
      if (flowTag === "exhaust") flowGlowMeshes.exhaust.push(glowMesh);
    }
    return cv;
  }

  const blkM = new THREE.MeshPhongMaterial({
    color: C.block, emissive: new THREE.Color(C.block).multiplyScalar(0.18),
    transparent: true, opacity: 1, shininess: 85, side: THREE.DoubleSide,
  });
  const blkWm = new THREE.MeshBasicMaterial({ color: C.wframe, wireframe: true, transparent: true, opacity: 0, depthWrite: false });
  solidMats.push(blkM); wireMats.push(blkWm);
  const blkG = new THREE.Group();
  const bm1 = new THREE.Mesh(new THREE.BoxGeometry(g.block.w, g.block.h, g.block.d), blkM); bm1.frustumCulled = false;
  const bm2 = new THREE.Mesh(new THREE.BoxGeometry(g.block.w, g.block.h, g.block.d), blkWm); bm2.frustumCulled = false;
  bm1.userData.role = "engine-body";
  bm2.userData.role = "wireframe";
  blkG.add(bm1); blkG.add(bm2);
  registerComponentMesh("ENGINE_BLOCK", bm1, blkM);
  ensureComponentGroup("ENGINE_BLOCK").add(blkG);

  const ribStep = g.blockRibStep ?? 0.33;
  for (let x = -g.block.w / 2 + 0.12; x <= g.block.w / 2 - 0.01; x += ribStep) {
    part(
      new THREE.BoxGeometry(0.06, g.block.h * 0.92, g.block.d * 0.94),
      C.rib,
      [x, 0, 0],
      null,
      "ENGINE_BLOCK"
    );
  }

  part(new THREE.BoxGeometry(g.oilPan.w, g.oilPan.h, g.oilPan.d), C.oilpan, [0, g.oilPan.y, 0], null, "ENGINE_BLOCK");

  const CX = g.cylinderX;
  const CR = g.cylRadius, CH = g.cylHeight, CY = g.cylBaseY + CH / 2;
  const pistons = [];

  CX.forEach((x, i) => {
    const cylOmat = new THREE.MeshPhongMaterial({
      color: C.cylOuter, emissive: new THREE.Color(C.cylOuter).multiplyScalar(0.12),
      transparent: true, opacity: 1, shininess: 200, side: THREE.DoubleSide,
    });
    const cylWmat = new THREE.MeshBasicMaterial({ color: C.wframe, wireframe: true, transparent: true, opacity: 0, depthWrite: false });
    solidMats.push(cylOmat); wireMats.push(cylWmat);
    const cylG = new THREE.Group();
    const cm1 = new THREE.Mesh(new THREE.CylinderGeometry(CR, CR, CH, 22), cylOmat); cm1.frustumCulled = false;
    const cm2 = new THREE.Mesh(new THREE.CylinderGeometry(CR, CR, CH, 22), cylWmat); cm2.frustumCulled = false;
    cylG.add(cm1); cylG.add(cm2);
    registerComponentMesh("ENGINE_BLOCK", cm1, cylOmat);
    cylG.position.set(x, CY, 0);
    ensureComponentGroup("ENGINE_BLOCK").add(cylG);

    const bm = new THREE.MeshPhongMaterial({ color: C.cylInner, transparent: true, opacity: 1, emissive: 0x001122, shininess: 220, side: THREE.BackSide });
    const bore = new THREE.Mesh(new THREE.CylinderGeometry(CR * 0.83, CR * 0.83, CH + 0.02, 22), bm);
    bore.frustumCulled = false;
    bore.position.set(x, CY, 0); parent.add(bore); interiorMats.push(bm);

    const rimM = new THREE.MeshBasicMaterial({ color: C.rim, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(CR + 0.008, 0.025, 8, 30), rimM);
    rim.frustumCulled = false;
    rim.position.set(x, CY + CH / 2, 0); rim.rotation.x = Math.PI / 2;
    parent.add(rim); glowMats.push(rimM);

    const cg = new THREE.Mesh(
      new THREE.CylinderGeometry(CR * 0.65, CR * 0.65, 0.15, 16),
      new THREE.MeshBasicMaterial({ color: C.cylInner, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    cg.frustumCulled = false;
    cg.position.set(x, CY + CH * 0.33, 0); parent.add(cg); glowMats.push(cg.material);

    const pm = new THREE.MeshPhongMaterial({
      color: C.piston, emissive: new THREE.Color(C.piston).multiplyScalar(0.15),
      shininess: 200, transparent: false, opacity: 1.0,
    });
    const pwm = new THREE.MeshBasicMaterial({ color: C.wframe, wireframe: true, transparent: true, opacity: 0, depthWrite: false });
    const pg = new THREE.Group();
    const pm1 = new THREE.Mesh(new THREE.CylinderGeometry(CR * 0.80, CR * 0.80, 0.28, 18), pm); pm1.frustumCulled = false;
    const pm2 = new THREE.Mesh(new THREE.CylinderGeometry(CR * 0.80, CR * 0.80, 0.28, 18), pwm); pm2.frustumCulled = false;
    pg.add(pm1); pg.add(pm2);

    const crownMat = new THREE.MeshPhongMaterial({ color: C.pistonCrown, emissive: new THREE.Color(C.pistonCrown).multiplyScalar(0.2), emissiveIntensity: 0.8, shininess: 220 });
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(CR * 0.74, CR * 0.80, 0.07, 18), crownMat);
    crown.frustumCulled = false;
    crown.position.y = 0.155;
    pg.add(crown);

    const ringMat = new THREE.MeshBasicMaterial({ color: C.rim, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    const skirtRing = new THREE.Mesh(new THREE.TorusGeometry(CR * 0.83, 0.020, 8, 24), ringMat);
    skirtRing.frustumCulled = false;
    skirtRing.rotation.x = Math.PI / 2;
    skirtRing.position.y = -0.04;
    pg.add(skirtRing);

    pg.position.set(x, CY, 0);
    pg.userData = { baseY: CY, phase: (i / CX.length) * Math.PI * 2 };
    ensureComponentGroup("ENGINE_BLOCK").add(pg); pistons.push(pg);
    pistonMats.push(pm, crownMat, ringMat);
    wireMats.push(pwm);

    const cl = new THREE.PointLight(0xffc933, 0.6, 4.0);
    cl.position.set(x, CY + CH / 2 + 0.6, 0); parent.add(cl);
  });

  part(new THREE.BoxGeometry(g.head.w, g.head.h, g.head.d), C.head, [0, g.head.y, 0], null, "ENGINE_BLOCK");
  part(new THREE.BoxGeometry(g.valveCover.w, g.valveCover.h, g.valveCover.d), C.valveCov, [0, g.valveCover.y, 0], null, "ENGINE_BLOCK");
  const rockerY = g.valveCover.y + 0.02;
  const rockerSpan = g.valveRockerSpan ?? 0.66;
  [-rockerSpan, -rockerSpan / 2, 0, rockerSpan / 2, rockerSpan].forEach((x) => {
    part(new THREE.BoxGeometry(0.08, 0.14, g.valveCover.d * 0.92), C.valveCov, [x, rockerY, 0], null, "ENGINE_BLOCK");
  });

  const runnerLen = g.runnerDrop ?? 0.30;
  const runnerR = g.runnerRadius ?? 0.09;
  part(new THREE.BoxGeometry(g.intManif.w, g.intManif.h, g.intManif.d), C.intManif, [0, g.intManif.y, g.intManif.z], null, "ENGINE_BLOCK");
  CX.forEach((x) => part(
    new THREE.CylinderGeometry(runnerR, runnerR, runnerLen, 12),
    C.intManif,
    [x, g.intManif.y, g.intManif.z - Math.abs(g.intManif.z) * 0.82],
    [Math.PI / 2, 0, 0],
    "ENGINE_BLOCK"
  ));
  part(new THREE.BoxGeometry(g.exhManif.w, g.exhManif.h, g.exhManif.d), C.exhManif, [0, g.exhManif.y, g.exhManif.z], null, "ENGINE_BLOCK");
  CX.forEach((x) => part(
    new THREE.CylinderGeometry(runnerR, runnerR, runnerLen, 12),
    C.exhManif,
    [x, g.exhManif.y, g.exhManif.z + Math.abs(g.exhManif.z) * 0.82],
    [Math.PI / 2, 0, 0],
    "ENGINE_BLOCK"
  ));

  const TG = new THREE.Group();
  TG.position.set(...g.turboPos);
  ensureComponentGroup("TURBOCHARGER").add(TG);
  const tPart = (geo, col, pos, rot) => {
    const [sm, wm] = mkMesh(geo, col);
    const grp = new THREE.Group();
    const tm1 = new THREE.Mesh(geo, sm); tm1.frustumCulled = false;
    const tm2 = new THREE.Mesh(geo, wm); tm2.frustumCulled = false;
    grp.add(tm1); grp.add(tm2);
    registerComponentMesh("TURBOCHARGER", tm1, sm);
    if (pos) grp.position.set(...pos);
    if (rot) { grp.rotation.x = rot[0]; grp.rotation.y = rot[1]; grp.rotation.z = rot[2]; }
    TG.add(grp);
  };
  tPart(new THREE.CylinderGeometry(0.38 * ts, 0.38 * ts, 0.32, 24), C.turbo, [-0.14, 0, 0], [0, 0, Math.PI / 2]);
  tPart(new THREE.CylinderGeometry(0.30 * ts, 0.30 * ts, 0.30, 24), C.turbo, [0, 0, 0.14], [Math.PI / 2, 0, 0]);
  tPart(new THREE.CylinderGeometry(0.06, 0.06, 0.48, 8), C.turbo, [0, 0, 0], [0, 0, Math.PI / 2]);

  const impG = new THREE.Group();
  impG.rotation.x = Math.PI / 2;
  for (let b = 0; b < 8; b++) {
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.28 * ts, 0.044, 0.026),
      new THREE.MeshPhongMaterial({ color: C.turbo, emissive: new THREE.Color(C.turbo).multiplyScalar(0.1), transparent: true, opacity: 0.85, shininess: 180 }));
    bl.frustumCulled = false;
    bl.rotation.z = (b / 8) * Math.PI * 2; impG.add(bl);
  }
  impG.position.set(...g.impellerPos);
  ensureComponentGroup("TURBOCHARGER").add(impG);

  part(new THREE.BoxGeometry(g.cac.w, g.cac.h, g.cac.d), C.cac, [0, g.cac.y, 0], null, "CAC");
  const finHalf = (g.cacFinSpan ?? g.cac.w * 0.9) / 2;
  for (let f = -finHalf; f <= finHalf + 0.01; f += 0.12) {
    part(new THREE.BoxGeometry(g.cac.w * 0.9, g.cac.h * 0.84, 0.014), C.fin, [f, g.cac.y, 0], null, "CAC");
  }

  const af = g.airfilter;
  part(new THREE.CylinderGeometry(af.radius, af.radius, 0.76, 20), C.airfilter, af.body, [0, 0, Math.PI / 2], "AIR_FILTER");
  part(new THREE.CylinderGeometry(af.radius, af.radius, 0.06, 20), 0x1a3a1a, af.cap, [0, 0, Math.PI / 2], "AIR_FILTER");

  pipes.intake.forEach((pts, i) => tube(pts, pipes.intakeRadii[i], C.pipeInt, C.iFlow, "intake"));
  pipes.exhaust.forEach((pts, i) => tube(pts, pipes.exhaustRadii[i], C.pipeExh, C.eFlow, "exhaust"));

  const aft = g.aftertreatment;
  part(new THREE.CylinderGeometry(aft.doc.radius, aft.doc.radius, aft.doc.length, 20), C.doc, [aft.doc.x, 0, 0], [0, 0, Math.PI / 2], "DPF_DOC");
  part(new THREE.CylinderGeometry(aft.dpf.radius, aft.dpf.radius, aft.dpf.length, 20), C.dpf, [aft.dpf.x, 0, 0], [0, 0, Math.PI / 2], "DPF_DOC");
  let scrPart = null;
  if (layout.hasScr && aft.scr) {
    scrPart = part(new THREE.CylinderGeometry(aft.scr.radius, aft.scr.radius, aft.scr.length, 20), C.scr, [aft.scr.x, 0, 0], [0, 0, Math.PI / 2], "SCR");
  }
  const tailLen = aft.tailpipe.length ?? 0.85;
  part(new THREE.CylinderGeometry(0.11, 0.09, tailLen, 12), 0x040a10, aft.tailpipe.pos, aft.tailpipe.rot, "EXHAUST_OUT");

  const egrPts2 = layout.egrPath.map((p) => new THREE.Vector3(...p));
  const egrCv = new THREE.CatmullRomCurve3(egrPts2);
  const egrTubeGeo = new THREE.TubeGeometry(egrCv, 28, 0.085, 8, false);
  const [eSm, eWm] = mkMesh(egrTubeGeo, C.egr); eSm.emissive.setHex(0x440099);
  const eG = new THREE.Group();
  const egm1 = new THREE.Mesh(egrTubeGeo, eSm); egm1.frustumCulled = false;
  const egm2 = new THREE.Mesh(egrTubeGeo, eWm); egm2.frustumCulled = false;
  eG.add(egm1); eG.add(egm2);
  registerComponentMesh("EGR_COOLER", egm1, eSm);
  ensureComponentGroup("EGR_COOLER").add(eG); eG.visible = false;

  const [evSm, evWm] = mkMesh(new THREE.BoxGeometry(0.28, 0.34, 0.28), C.egr);
  const evG = new THREE.Group();
  const evm1 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.28), evSm); evm1.frustumCulled = false;
  const evm2 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.28), evWm); evm2.frustumCulled = false;
  evG.add(evm1); evG.add(evm2);
  registerComponentMesh("EGR_COOLER", evm1, evSm);
  evG.position.set(...g.egrValvePos);
  ensureComponentGroup("EGR_COOLER").add(evG); evG.visible = false;

  const egm = new THREE.MeshBasicMaterial({ color: C.gFlow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide });
  const egmMesh = new THREE.Mesh(new THREE.TubeGeometry(egrCv, 28, 0.16, 8, false), egm);
  egmMesh.frustumCulled = false;
  parent.add(egmMesh);
  glowMats.push(egm); flowGlowMats.push(egm);

  const cr = g.coolantRail;
  part(new THREE.BoxGeometry(cr.w, cr.h, cr.d), C.cac, cr.pos);

  const gnd = new THREE.Mesh(new THREE.PlaneGeometry(30, 30),
    new THREE.MeshBasicMaterial({ color: 0x000c1a, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  gnd.rotation.x = -Math.PI / 2; gnd.position.set(0, -1.1, 0); parent.add(gnd);
  const scanRings = [];
  (g.scanRingRadii ?? [3.5, 4.8, 6.4]).forEach((r, i) => {
    const rm = new THREE.MeshBasicMaterial({ color: C.scanRing, transparent: true, opacity: 0.045 - i * 0.01, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.06, 84), rm);
    ring.rotation.x = -Math.PI / 2; ring.position.y = -1.09;
    parent.add(ring); scanRings.push(rm);
  });

  return {
    solidMats, wireMats, glowMats, interiorMats, flowGlowMats, flowGlowMeshes,
    pistonMats, pistons, impeller: impG, egrGroup: [eG, evG], scanRings, scrPart,
    turboRpmRef: layout.turboRpmRef,
    pistonStroke: layout.pistonStroke,
    componentMeshes,
    componentGroups,
  };
}
