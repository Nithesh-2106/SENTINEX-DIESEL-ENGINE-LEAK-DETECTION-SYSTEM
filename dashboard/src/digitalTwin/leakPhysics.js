/**
 * Physics-accurate leak particle behaviours per scenario.
 * Additive to existing intake/exhaust flow blips and red leak cloud.
 */
import * as THREE from "three";
import { ZONE_TO_COMPONENT } from "./componentSensorMap.js";

export const LEAK_PARTICLE_CONFIGS = {
  Normal: {
    escapeParticles: false,
    flowModifier: 1.0,
    downstreamFlowModifier: 1.0,
    description: "Normal operation — full flow",
  },

  Intake_PreTurbo: {
    escapeParticles: true,
    escapeLocation: "AIR_FILTER",
    escapeConfig: {
      count: 35,
      speed: 0.8,
      spread: 2.5,
      direction: { x: 0, y: 1, z: 0.5 },
      colour: 0xff4444,
      size: 0.12,
      opacity: 0.9,
      behaviour: "burst_outward",
    },
    flowModifier: 0.55,
    downstreamFlowModifier: 0.60,
    intakeParticleColour: 0xff8844,
    addGapVisual: true,
    gapLocation: "intake_pipe_inlet",
    gapSize: 0.15,
    description: "Air escaping upstream of turbocharger",
  },

  Intake_PostTurbo_CAC: {
    escapeParticles: true,
    escapeLocation: "CAC",
    escapeConfig: {
      count: 40,
      speed: 1.4,
      spread: 3.0,
      direction: { x: 0.3, y: 1, z: 0.3 },
      colour: 0xff6600,
      size: 0.10,
      opacity: 0.95,
      behaviour: "pressurised_burst",
    },
    flowModifier: 0.50,
    downstreamFlowModifier: 0.55,
    intakeParticleColour: 0xff6600,
    addGapVisual: true,
    gapLocation: "cac_outlet",
    gapSize: 0.12,
    description: "Pressurised charge air escaping at CAC",
  },

  Exhaust_PreTurbine: {
    escapeParticles: true,
    escapeLocation: "ENGINE_BLOCK",
    escapeConfig: {
      count: 45,
      speed: 1.2,
      spread: 2.8,
      direction: { x: -0.2, y: 1, z: 0.4 },
      colour: 0xff2200,
      size: 0.14,
      opacity: 0.85,
      behaviour: "hot_gas_rise",
    },
    exhaustFlowModifier: 0.60,
    exhaustParticleColour: 0xff2200,
    addHeatDistortion: true,
    heatGlowColour: 0xff3300,
    heatGlowIntensity: 0.7,
    description: "Hot exhaust escaping before turbocharger turbine",
  },

  Exhaust_PostTurbine: {
    escapeParticles: true,
    escapeLocation: "DPF_DOC",
    escapeConfig: {
      count: 25,
      speed: 0.6,
      spread: 2.0,
      direction: { x: 0.5, y: 0.5, z: 0 },
      colour: 0xaa4400,
      size: 0.08,
      opacity: 0.7,
      behaviour: "low_pressure_drift",
    },
    exhaustFlowModifier: 0.75,
    downstreamFlowModifier: 0.70,
    description: "Exhaust leaking after turbocharger turbine",
  },

  EGR_Leak: {
    escapeParticles: true,
    escapeLocation: "EGR_COOLER",
    escapeConfig: {
      count: 20,
      speed: 0.5,
      spread: 1.5,
      direction: { x: 0, y: 0.8, z: 0.4 },
      colour: 0x884400,
      size: 0.09,
      opacity: 0.75,
      behaviour: "egr_recirculation_leak",
    },
    egrFlowModifier: 0.40,
    egrParticleColour: 0x884400,
    addEGRPathDim: true,
    description: "Recirculated exhaust gas escaping EGR circuit",
  },

  CAC_Direct_Leak: {
    escapeParticles: true,
    escapeLocation: "CAC",
    escapeConfig: {
      count: 50,
      speed: 1.6,
      spread: 3.5,
      direction: { x: 0, y: 1, z: 0 },
      colour: 0xff8800,
      size: 0.13,
      opacity: 1.0,
      behaviour: "cac_internal_crossflow",
    },
    flowModifier: 0.30,
    addCACCrossflow: true,
    crossflowColour: 0xff6600,
    crossflowCount: 15,
    description: "Charge air bypassing through fractured CAC core",
  },

  Minor_Intake_Leak: {
    escapeParticles: true,
    escapeLocation: "AIR_FILTER",
    escapeConfig: {
      count: 10,
      speed: 0.3,
      spread: 1.0,
      direction: { x: 0, y: 0.5, z: 0.3 },
      colour: 0xffaa44,
      size: 0.06,
      opacity: 0.5,
      behaviour: "minor_seep",
    },
    flowModifier: 0.88,
    description: "Small distributed air seep across intake connections",
  },
};

const GAP_POSITIONS = {
  intake_pipe_inlet: [-3.2, 0.75, 0],
  cac_outlet: [0.5, 2.8, 0],
};

const ORIGINAL_INTAKE_COLOR = 0x00eeff;
const ORIGINAL_EXHAUST_COLOR = 0xff6622;
const ORIGINAL_EGR_COLOR = 0x88ff44;

function zonePosition(t, componentKey) {
  const zoneId = Object.entries(ZONE_TO_COMPONENT).find(([, k]) => k === componentKey)?.[0];
  const zone = t.layout?.zoneAnchors?.find((z) => z.id === zoneId);
  if (zone) return new THREE.Vector3(...zone.pos);
  const leakPos = t.leakPositions?.[componentKey];
  if (leakPos) return new THREE.Vector3(...leakPos);
  return new THREE.Vector3(0, 1, 0);
}

function escapeOrigin(t, scenario, config) {
  const leakPos = t.leakPositions?.[scenario];
  if (leakPos) return new THREE.Vector3(...leakPos);
  return zonePosition(t, config.escapeLocation);
}

function createEscapeEmitter(t, origin, config, escapeConfig, severityMultiplier, scenario) {
  const maxCount = Math.min(50, Math.floor(escapeConfig.count * severityMultiplier));
  const count = Math.max(1, maxCount);

  const positions = new Float32Array(count * 3);
  const velocities = [];
  const lifetimes = new Float32Array(count);
  const sizes = new Float32Array(count);

  const dir = escapeConfig.direction;
  const spread = escapeConfig.spread * 0.1;

  for (let i = 0; i < count; i++) {
    positions[i * 3] = origin.x + (Math.random() - 0.5) * 0.4;
    positions[i * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.4;
    positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.4;

    const speed = escapeConfig.speed * severityMultiplier;
    velocities.push({
      x: dir.x * speed + (Math.random() - 0.5) * spread,
      y: dir.y * speed + (Math.random() - 0.5) * spread,
      z: dir.z * speed + (Math.random() - 0.5) * spread,
    });
    lifetimes[i] = Math.random() * 2.5;
    sizes[i] = escapeConfig.size;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    color: escapeConfig.colour,
    size: escapeConfig.size,
    transparent: true,
    opacity: escapeConfig.opacity * severityMultiplier,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 16;
  t.contentGroup?.add(points);

  const emitter = {
    points,
    count,
    velocities,
    lifetimes,
    maxLifetime: escapeConfig.behaviour === "low_pressure_drift" ? 4.0 : 2.5,
    behaviour: escapeConfig.behaviour,
    origin: origin.clone(),
    config: escapeConfig,
    severityMultiplier,
    scenario,
    flashFrames: escapeConfig.behaviour === "pressurised_burst" ? 5 : 0,
    seepTimer: 0,
    crossflowPts: null,
  };

  if (config.addCACCrossflow) {
    const cfCount = Math.min(15, config.crossflowCount || 15);
    const cfPos = new Float32Array(cfCount * 3);
    const cfVel = [];
    for (let i = 0; i < cfCount; i++) {
      cfPos[i * 3] = origin.x;
      cfPos[i * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.6;
      cfPos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.3;
      cfVel.push({
        x: (Math.random() > 0.5 ? 1 : -1) * 0.8,
        y: (Math.random() - 0.5) * 0.05,
        z: (Math.random() - 0.5) * 0.05,
      });
    }
    const cfGeo = new THREE.BufferGeometry();
    cfGeo.setAttribute("position", new THREE.BufferAttribute(cfPos, 3));
    const cfMat = new THREE.PointsMaterial({
      color: config.crossflowColour || 0xff6600,
      size: 0.09,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      sizeAttenuation: true,
    });
    const cfPts = new THREE.Points(cfGeo, cfMat);
    cfPts.frustumCulled = false;
    cfPts.renderOrder = 16;
    t.contentGroup?.add(cfPts);
    emitter.crossflowPts = { points: cfPts, velocities: cfVel, count: cfCount };
  }

  return emitter;
}

function resetHeatGlow(t) {
  if (!t._heatGlowMeshes) return;
  t._heatGlowMeshes.forEach(({ mesh }) => {
    const mat = mesh.material;
    if (!mat?.emissive) return;
    if (mesh.userData._leakPhysOrigEmissive != null) {
      mat.emissive.copy(mesh.userData._leakPhysOrigEmissive);
      mat.emissiveIntensity = mesh.userData._leakPhysOrigIntensity ?? 0;
    } else {
      mat.emissive.setHex(0x000000);
      mat.emissiveIntensity = 0;
    }
  });
  t._heatGlowMeshes = null;
  t.heatGlowActive = false;
}

export function clearLeakPhysics(t) {
  if (!t?.scene) return;

  t.intakeFlowModifier = 1.0;
  t.exhaustFlowModifier = 1.0;
  t.egrFlowModifier = 1.0;
  t.downstreamFlowModifier = 1.0;

  if (t.intakePts?.material) {
    t.intakePts.material.color.setHex(ORIGINAL_INTAKE_COLOR);
    t.intakePts.material.opacity = 0.92;
  }
  if (t.exhaustPts?.material) {
    t.exhaustPts.material.color.setHex(ORIGINAL_EXHAUST_COLOR);
    t.exhaustPts.material.opacity = 0.92;
  }
  if (t.egrPts?.material) {
    t.egrPts.material.color.setHex(ORIGINAL_EGR_COLOR);
    t.egrPts.material.opacity = 0.95;
  }

  const emitter = t.scene.userData.escapeEmitter;
  if (emitter) {
    t.contentGroup?.remove(emitter.points);
    emitter.points.geometry?.dispose();
    emitter.points.material?.dispose();
    if (emitter.crossflowPts) {
      t.contentGroup?.remove(emitter.crossflowPts.points);
      emitter.crossflowPts.points.geometry?.dispose();
      emitter.crossflowPts.points.material?.dispose();
    }
  }
  t.scene.userData.escapeEmitter = null;

  clearSecondaryLeakPhysics(t);

  const gap = t.scene.userData.gapIndicator;
  if (gap) {
    t.contentGroup?.remove(gap);
    gap.geometry?.dispose();
    gap.material?.dispose();
  }
  t.scene.userData.gapIndicator = null;

  resetHeatGlow(t);

  t.colourLerpProgress = 1.0;
  t.colourLerp = null;
  t.activeLeakPhysicsScenario = null;
}

export function applyLeakPhysics(t, scenario, severity) {
  if (!t?.scene) return;

  const config = LEAK_PARTICLE_CONFIGS[scenario];
  if (!config || scenario === "Normal") {
    clearLeakPhysics(t);
    return;
  }

  clearLeakPhysics(t);

  const severityMultiplier =
    severity === "Minor"
      ? 0.6
      : severity === "Moderate"
        ? 0.8
        : severity === "Severe"
          ? 1.0
          : severity === "Critical"
            ? 1.2
            : 1.0;

  t.intakeFlowModifier = config.flowModifier ?? 1.0;
  t.exhaustFlowModifier = config.exhaustFlowModifier ?? 1.0;
  t.egrFlowModifier = config.egrFlowModifier ?? 1.0;
  t.downstreamFlowModifier = config.downstreamFlowModifier ?? 1.0;

  if (config.intakeParticleColour && t.intakePts?.material) {
    t.colourLerp = {
      source: new THREE.Color(t.intakePts.material.color),
      target: new THREE.Color(config.intakeParticleColour),
      field: "intake",
    };
    t.colourLerpProgress = 0;
  }
  if (config.exhaustParticleColour && t.exhaustPts?.material) {
    t.colourLerp = {
      source: new THREE.Color(t.exhaustPts.material.color),
      target: new THREE.Color(config.exhaustParticleColour),
      field: "exhaust",
    };
    t.colourLerpProgress = 0;
  }
  if (config.egrParticleColour && t.egrPts?.material) {
    t.colourLerp = {
      source: new THREE.Color(t.egrPts.material.color),
      target: new THREE.Color(config.egrParticleColour),
      field: "egr",
    };
    t.colourLerpProgress = 0;
  }

  if (config.addEGRPathDim && t.egrPts?.material) {
    t.egrPts.material.opacity = 0.25;
  }

  if (config.escapeParticles && config.escapeConfig) {
    const origin = escapeOrigin(t, scenario, config);
    t.scene.userData.escapeEmitter = createEscapeEmitter(
      t, origin, config, config.escapeConfig, severityMultiplier, scenario
    );
  }

  if (config.addHeatDistortion) {
    const meshes = t.componentMeshes?.ENGINE_BLOCK || [];
    t._heatGlowMeshes = meshes.map(({ mesh }) => {
      const mat = mesh.material;
      if (mat?.emissive) {
        mesh.userData._leakPhysOrigEmissive = mat.emissive.clone();
        mesh.userData._leakPhysOrigIntensity = mat.emissiveIntensity ?? 0;
      }
      return { mesh, targetColor: config.heatGlowColour, targetIntensity: config.heatGlowIntensity };
    });
    t.heatGlowActive = true;
    t.heatGlowConfig = config;
  }

  if (config.addGapVisual) {
    const gapPos = GAP_POSITIONS[config.gapLocation] || escapeOrigin(t, scenario, config).toArray();
    const radius = config.gapSize || 0.12;
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.02, 8, 24),
      new THREE.MeshBasicMaterial({
        color: 0xff2200,
        transparent: true,
        opacity: 0.8,
      })
    );
    torus.position.set(...gapPos);
    torus.rotation.x = Math.PI / 2;
    t.contentGroup?.add(torus);
    t.scene.userData.gapIndicator = torus;
  }

  t.activeLeakPhysicsScenario = scenario;
}

export function updateParticleColourLerp(t, progress) {
  if (!t.colourLerp) return;
  const { source, target, field } = t.colourLerp;
  const lerped = new THREE.Color().lerpColors(source, target, Math.min(1, progress));
  const pts = field === "intake" ? t.intakePts
    : field === "exhaust" ? t.exhaustPts
    : t.egrPts;
  if (pts?.material) pts.material.color.copy(lerped);
}

export function updateHeatGlow(t, elapsed) {
  if (!t.heatGlowActive || !t._heatGlowMeshes?.length) return;
  const cfg = t.heatGlowConfig || {};
  const pulse = Math.sin(elapsed * 4) * 0.15;
  const col = new THREE.Color(cfg.heatGlowColour || 0xff3300);
  t._heatGlowMeshes.forEach(({ mesh, targetIntensity }) => {
    const mat = mesh.material;
    if (!mat?.emissive) return;
    mat.emissive.copy(col);
    mat.emissiveIntensity = (targetIntensity || 0.7) + pulse;
  });
}

function respawnParticle(emitter, i) {
  const pos = emitter.points.geometry.attributes.position.array;
  const o = emitter.origin;
  pos[i * 3] = o.x + (Math.random() - 0.5) * 0.4;
  pos[i * 3 + 1] = o.y + (Math.random() - 0.5) * 0.4;
  pos[i * 3 + 2] = o.z + (Math.random() - 0.5) * 0.4;

  const ec = emitter.config;
  const spread = ec.spread * 0.1;
  const speed = ec.speed * emitter.severityMultiplier;
  const dir = ec.direction;

  if (emitter.behaviour === "burst_outward") {
    const angle = Math.random() * Math.PI * 2;
    const radial = speed * 0.5;
    emitter.velocities[i] = {
      x: Math.cos(angle) * radial + dir.x * speed * 0.3,
      y: dir.y * speed + Math.random() * spread,
      z: Math.sin(angle) * radial + dir.z * speed * 0.3,
    };
  } else {
    emitter.velocities[i] = {
      x: dir.x * speed + (Math.random() - 0.5) * spread,
      y: dir.y * speed + (Math.random() - 0.5) * spread,
      z: dir.z * speed + (Math.random() - 0.5) * spread,
    };
  }
  emitter.lifetimes[i] = 0;
}

export function updateEscapeParticles(emitter, dt, elapsed) {
  if (!emitter?.points) return;

  const pos = emitter.points.geometry.attributes.position.array;
  const mat = emitter.points.material;
  const behaviour = emitter.behaviour;

  if (behaviour === "minor_seep") {
    emitter.seepTimer += dt;
    if (emitter.seepTimer >= 0.8) {
      emitter.seepTimer = 0;
      const idx = Math.floor(Math.random() * emitter.count);
      respawnParticle(emitter, idx);
    }
  }

  if (emitter.flashFrames > 0) {
    mat.opacity = Math.min(1, emitter.config.opacity * emitter.severityMultiplier + 0.3);
    emitter.flashFrames--;
  }

  for (let i = 0; i < emitter.count; i++) {
    const v = emitter.velocities[i];
    emitter.lifetimes[i] += dt;

    if (behaviour === "minor_seep" && emitter.lifetimes[i] > emitter.maxLifetime) {
      pos[i * 3] = -999;
      continue;
    }

    if (behaviour === "burst_outward") {
      v.x *= 0.97;
      v.y *= 0.97;
      v.z *= 0.97;
    } else if (behaviour === "pressurised_burst") {
      v.y -= 0.02;
    } else if (behaviour === "hot_gas_rise") {
      v.x += Math.sin(elapsed * 3 + i) * 0.02;
      mat.size = emitter.config.size * (1 + emitter.lifetimes[i] * 0.01);
    } else if (behaviour === "low_pressure_drift") {
      v.x += (Math.random() - 0.5) * 0.01;
      v.y += (Math.random() - 0.5) * 0.01;
      v.z += (Math.random() - 0.5) * 0.01;
    } else if (behaviour === "egr_recirculation_leak") {
      v.y += 0.01;
    } else if (behaviour === "minor_seep") {
      v.y += 0.008;
    }

    pos[i * 3] += v.x * dt * 3;
    pos[i * 3 + 1] += v.y * dt * 3;
    pos[i * 3 + 2] += v.z * dt * 3;

    if (behaviour !== "minor_seep" && emitter.lifetimes[i] >= emitter.maxLifetime) {
      respawnParticle(emitter, i);
    }

    const lifeFrac = emitter.lifetimes[i] / emitter.maxLifetime;
    if (behaviour !== "hot_gas_rise" && behaviour !== "minor_seep") {
      mat.opacity = emitter.config.opacity * emitter.severityMultiplier * (1 - lifeFrac * 0.5);
    }
  }

  emitter.points.geometry.attributes.position.needsUpdate = true;

  if (emitter.crossflowPts) {
    const cf = emitter.crossflowPts;
    const cfPos = cf.points.geometry.attributes.position.array;
    for (let i = 0; i < cf.count; i++) {
      const cv = cf.velocities[i];
      cfPos[i * 3] += cv.x * dt * 2;
      cfPos[i * 3 + 1] += cv.y * dt * 2;
      cfPos[i * 3 + 2] += cv.z * dt * 2;
      if (Math.abs(cfPos[i * 3] - emitter.origin.x) > 1.2) {
        cfPos[i * 3] = emitter.origin.x;
        cv.x *= -1;
      }
    }
    cf.points.geometry.attributes.position.needsUpdate = true;
  }
}

export function tickGapIndicator(t, elapsed) {
  const gap = t?.scene?.userData?.gapIndicator;
  if (!gap?.material) return;
  gap.material.opacity = 0.5 + Math.sin(elapsed * Math.PI * 2) * 0.25;
}

export function getActiveIntakeParticleCount(t) {
  const mod = t.intakeFlowModifier ?? 1.0;
  return Math.floor((t.intakeCount || 0) * mod);
}

export function getActiveExhaustParticleCount(t) {
  const mod = t.exhaustFlowModifier ?? 1.0;
  return Math.floor((t.exhaustCount || 0) * mod);
}

export function getActiveEgrParticleCount(t) {
  const mod = t.egrFlowModifier ?? 1.0;
  return Math.floor((t.gOff?.length || 0) * mod);
}

const SECONDARY_LEAK_PURPLE = 0x7c3aed;

export function clearSecondaryLeakPhysics(t) {
  if (!t?.scene) return;
  const emitter = t.scene.userData.secondaryEscapeEmitter;
  if (emitter) {
    t.contentGroup?.remove(emitter.points);
    emitter.points.geometry?.dispose();
    emitter.points.material?.dispose();
    if (emitter.crossflowPts) {
      t.contentGroup?.remove(emitter.crossflowPts.points);
      emitter.crossflowPts.points.geometry?.dispose();
      emitter.crossflowPts.points.material?.dispose();
    }
  }
  t.scene.userData.secondaryEscapeEmitter = null;
}

/** Secondary leak escape particles — additive to primary leak physics. */
export function applySecondaryLeakPhysics(t, scenario, severity) {
  if (!t?.scene) return;
  clearSecondaryLeakPhysics(t);

  const config = LEAK_PARTICLE_CONFIGS[scenario];
  if (!config?.escapeParticles || !config.escapeConfig || scenario === "Normal") return;

  const severityMultiplier =
    severity === "Minor"
      ? 0.5
      : severity === "Moderate"
        ? 0.65
        : severity === "Severe"
          ? 0.8
          : severity === "Critical"
            ? 0.95
            : 0.65;

  const origin = escapeOrigin(t, scenario, config);
  const secondaryEscape = {
    ...config.escapeConfig,
    count: Math.max(12, Math.round((config.escapeConfig.count || 30) * 0.6)),
    colour: SECONDARY_LEAK_PURPLE,
    opacity: 0.75,
  };
  t.scene.userData.secondaryEscapeEmitter = createEscapeEmitter(
    t,
    origin,
    config,
    secondaryEscape,
    severityMultiplier,
    scenario
  );
}
