import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";
import SentinexLiveLogo from "../components/SentinexLiveLogo.jsx";
import styles from "./IntroPage.module.css";

const FEATURES = [
  "ML Pipeline",
  "SHAP Explainability",
  "ARIA",
  "Digital Twin",
  "Federated Learning",
  "Sensor Health",
  "Multi-Leak Detection",
];

const HEADLINE_LETTERS = "SENTINEX".split("");
const SUBTITLE_WORDS = ["Diesel", "Leak", "Intelligence"];

const TAGLINE_LINES = [
  "AI-powered diesel engine leak detection",
  "that sees what humans miss in real time",
];

const INTRO_SEEN_KEY = "sentinex_intro_seen";

function LiquidTagline({ lines, visible }) {
  return (
    <div className={`${styles.liquidTagline} ${visible ? styles.visible : ""}`}>
      {lines.map((line, lineIdx) => (
        <p key={line} className={styles.liquidLine}>
          {line.split("").map((ch, charIdx) =>
            ch === " " ? (
              <span key={`sp-${lineIdx}-${charIdx}`} className={styles.liquidSpace} aria-hidden>
                &nbsp;
              </span>
            ) : (
              <span
                key={`${lineIdx}-${charIdx}`}
                className={styles.liquidChar}
                style={{ animationDelay: `${lineIdx * 0.35 + charIdx * 0.028}s` }}
              >
                {ch}
              </span>
            )
          )}
        </p>
      ))}
    </div>
  );
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function createStars(count, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  return Array.from({ length: count }, () => {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    const centerBoost = 1 - dist / maxDist;
    return {
      x,
      y,
      size: 0.3 + Math.random() * 1.2,
      opacity: 0.2 + Math.random() * 0.4 + centerBoost * 0.25,
      speed: 0.01 + Math.random() * 0.04,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.02 + Math.random() * 0.03,
    };
  });
}

function buildParticleGroup(count, color, size, innerBias = 0.55) {
  const positions = new Float32Array(count * 3);
  const meta = [];

  for (let i = 0; i < count; i += 1) {
    const u = Math.random();
    const radius = u < innerBias ? 2.5 + Math.random() * 0.5 : Math.random() * 4;
    const angle = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * 1.2;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    meta.push({
      angle,
      speed: 0.001 + Math.random() * 0.004,
      orbitRadius: radius,
      y,
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.userData.meta = meta;
  return points;
}

function createRing(radius, tube, color, opacity, rotation = { x: 0, y: 0, z: 0 }) {
  const geometry = new THREE.TorusGeometry(radius, tube, 3, 200);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.set(
    (rotation.x * Math.PI) / 180,
    (rotation.y * Math.PI) / 180,
    (rotation.z * Math.PI) / 180
  );
  return mesh;
}

function createGlowRing(radius, tube, color, opacity) {
  const geometry = new THREE.TorusGeometry(radius, tube * 3, 3, 200);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  return new THREE.Mesh(geometry, material);
}

function createDataArcs(parent, mobile) {
  const arcs = [];
  const count = mobile ? 4 : 6;
  const colors = ["#8CB8E8", "#6EA8DC"];

  for (let i = 0; i < count; i += 1) {
    const theta = (i / count) * Math.PI * 2;
    const ringX = Math.sin(theta) * 2.8;
    const ringZ = Math.cos(theta) * 2.8;
    const start = new THREE.Vector3(
      Math.sin(theta) * 0.15,
      (Math.random() - 0.5) * 0.2,
      Math.cos(theta) * 0.15
    );
    const mid = new THREE.Vector3(ringX * 0.45, 0.35 + Math.random() * 0.2, ringZ * 0.45);
    const end = new THREE.Vector3(ringX, 0, ringZ);

    const curve = new THREE.CatmullRomCurve3([start, mid, end]);
    const geometry = new THREE.TubeGeometry(curve, 30, 0.003, 4, false);
    const material = new THREE.MeshBasicMaterial({
      color: colors[i % 2],
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.phase = Math.random() * Math.PI * 2;
    parent.add(mesh);
    arcs.push(mesh);
  }

  return arcs;
}

export default function IntroPage() {
  const navigate = useNavigate();
  const starCanvasRef = useRef(null);
  const threeMountRef = useRef(null);
  const contentRef = useRef(null);

  const [phase, setPhase] = useState(0);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768
  );

  const mouseTarget = useRef({ x: 0, y: 0 });
  const mouseSmooth = useRef({ x: 0, y: 0 });
  const parallaxRaf = useRef(null);

  const handleLogin = useCallback(() => {
    try {
      localStorage.setItem(INTRO_SEEN_KEY, "true");
    } catch {
      // ignore
    }
    navigate("/login");
  }, [navigate]);

  useEffect(() => {
    const steps = [200, 500, 700, 900, 1100, 1300, 1500, 1700, 2000, 2300];
    const timers = steps.map((ms, i) => window.setTimeout(() => setPhase(i + 1), ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      mouseTarget.current = {
        x: e.clientX / window.innerWidth - 0.5,
        y: e.clientY / window.innerHeight - 0.5,
      };
    };
    window.addEventListener("mousemove", onMove);

    const tick = () => {
      mouseSmooth.current.x = lerp(mouseSmooth.current.x, mouseTarget.current.x, 0.05);
      mouseSmooth.current.y = lerp(mouseSmooth.current.y, mouseTarget.current.y, 0.05);

      const mx = mouseSmooth.current.x;
      const my = mouseSmooth.current.y;

      if (contentRef.current) {
        contentRef.current.style.transform = `translate(calc(-50% + ${mx * -6}px), calc(-50% + ${my * -3}px))`;
      }

      parallaxRaf.current = requestAnimationFrame(tick);
    };

    parallaxRaf.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(parallaxRaf.current);
    };
  }, []);

  useEffect(() => {
    const canvas = starCanvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext("2d");
    let animId = null;
    let stars = [];
    let visible = true;
    let w = 0;
    let h = 0;
    let frame = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.offsetWidth;
      h = canvas.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = createStars(200, w, h);
    };

    const draw = () => {
      if (!visible) return;
      animId = requestAnimationFrame(draw);
      frame += 1;
      ctx.clearRect(0, 0, w, h);

      for (const star of stars) {
        star.y += star.speed;
        if (star.y > h) {
          star.y = 0;
          star.x = Math.random() * w;
        }
        const twinkle = 0.65 + Math.sin(frame * star.twinkleSpeed + star.twinklePhase) * 0.35;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${star.opacity * twinkle})`;
        ctx.fill();
      }
    };

    resize();
    animId = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);

    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            ([entry]) => {
              visible = entry.isIntersecting;
              if (visible && !animId) animId = requestAnimationFrame(draw);
            },
            { threshold: 0.05 }
          )
        : null;
    io?.observe(canvas);

    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(animId);
        animId = null;
      } else if (visible) {
        animId = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      io?.disconnect();
    };
  }, []);

  useEffect(() => {
    const mount = threeMountRef.current;
    if (!mount) return undefined;

    const mobile = window.innerWidth < 768;
    const scale = mobile ? 0.7 : 1;
    const particleCount = mobile ? 800 : 1500;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000508, 0.08);

    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.z = 7;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    renderer.domElement.className = styles.threeCanvas;

    const group = new THREE.Group();
    group.scale.setScalar(scale);
    scene.add(group);

    const ringConfigs = [
      { r: 2.8, tube: 0.008, color: "#8CB8E8", opacity: 0.55, spin: { y: 0.003 } },
      { r: 3.0, tube: 0.004, color: "#6EA8DC", opacity: 0.38, spin: { y: -0.002 } },
      { r: 2.5, tube: 0.005, color: "#B8D8F0", opacity: 0.28, spin: { z: 0.001 } },
    ];

    const rings = ringConfigs.map((cfg) => {
      const ring = createRing(cfg.r, cfg.tube, cfg.color, cfg.opacity, { x: 15 });
      const glow = createGlowRing(cfg.r, cfg.tube, cfg.color, 0.06);
      glow.rotation.x = ring.rotation.x;
      group.add(ring, glow);
      return { ring, glow, spin: cfg.spin };
    });

    const particlesA = buildParticleGroup(particleCount, "#8CB8E8", 0.015);
    const particlesB = buildParticleGroup(particleCount, "#6EA8DC", 0.01);
    group.add(particlesA, particlesB);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 16, 16),
      new THREE.MeshBasicMaterial({ color: "#5A9FD4", wireframe: true })
    );
    const coreGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 16, 16),
      new THREE.MeshBasicMaterial({ color: "#8CB8E8", transparent: true, opacity: 0.08 })
    );
    group.add(core, coreGlow);

    const arcs = createDataArcs(group, mobile);

    let animId = null;
    let running = true;
    let time = 0;
    const mouse3d = { x: 0, y: 0 };

    const onMove = (e) => {
      mouse3d.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse3d.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("mousemove", onMove);

    const updateParticles = (points, repulse) => {
      const positions = points.geometry.attributes.position;
      const meta = points.userData.meta;
      for (let i = 0; i < meta.length; i += 1) {
        const m = meta[i];
        m.angle += m.speed;
        let x = Math.sin(m.angle) * m.orbitRadius;
        let z = Math.cos(m.angle) * m.orbitRadius;
        const y = m.y;

        const dx = x - repulse.x * 3;
        const dz = z - repulse.y * 3;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 1.0 && dist > 0.001) {
          const force = (1.0 - dist) * 0.03;
          x += (dx / dist) * force;
          z += (dz / dist) * force;
        }

        positions.setXYZ(i, x, y, z);
      }
      positions.needsUpdate = true;
    };

    const animate = () => {
      if (!running) return;
      animId = requestAnimationFrame(animate);
      time += 0.016;

      rings.forEach(({ ring, glow, spin }) => {
        if (spin.x) ring.rotation.x += spin.x;
        if (spin.y) ring.rotation.y += spin.y;
        if (spin.z) ring.rotation.z += spin.z;
        glow.rotation.copy(ring.rotation);
      });

      core.rotation.x += 0.005;
      core.rotation.y += 0.003;
      core.rotation.z += 0.007;
      coreGlow.rotation.copy(core.rotation);

      arcs.forEach((arc) => {
        arc.userData.phase += 0.02;
        arc.material.opacity = 0.25 + Math.sin(arc.userData.phase) * 0.15;
        arc.rotation.y += 0.001;
      });

      const repulse = { x: lerp(0, mouse3d.x, 0.08), y: lerp(0, mouse3d.y, 0.08) };
      updateParticles(particlesA, repulse);
      updateParticles(particlesB, repulse);

      const orbitX = Math.sin(time * 0.08) * 0.8;
      const orbitY = Math.sin(time * 0.05) * 0.4;
      camera.position.x = lerp(camera.position.x, orbitX + mouse3d.x * 1.5, 0.05);
      camera.position.y = lerp(camera.position.y, orbitY - mouse3d.y * 0.8, 0.05);
      camera.position.z = 7;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    const onResize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", onResize);

    const onVis = () => {
      running = !document.hidden;
      if (running) animate();
      else cancelAnimationFrame(animId);
    };
    document.addEventListener("visibilitychange", onVis);

    animate();

    return () => {
      running = false;
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);

      arcs.forEach((a) => {
        a.geometry.dispose();
        a.material.dispose();
        group.remove(a);
      });
      rings.forEach(({ ring, glow }) => {
        ring.geometry.dispose();
        ring.material.dispose();
        glow.geometry.dispose();
        glow.material.dispose();
      });
      [particlesA, particlesB].forEach((p) => {
        p.geometry.dispose();
        p.material.dispose();
      });
      core.geometry.dispose();
      core.material.dispose();
      coreGlow.geometry.dispose();
      coreGlow.material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [isMobile]);

  return (
    <div className={styles.page}>
      <canvas ref={starCanvasRef} className={`${styles.layer} ${styles.starCanvas}`} aria-hidden />

      <div
        ref={threeMountRef}
        className={`${styles.layer} ${styles.threeMount} ${styles.threeFade} ${phase >= 1 ? styles.visible : ""}`}
        aria-hidden
      />

      <div className={`${styles.layer} ${styles.contentLayer}`}>
        <div ref={contentRef} className={styles.introContent}>
          <div className={`${styles.heroLogo} ${phase >= 2 ? styles.visible : ""}`}>
            <SentinexLiveLogo size={isMobile ? 64 : 84} />
          </div>

          <h1 className={`${styles.frostHeadline} ${phase >= 3 ? styles.visible : ""}`}>
            <span className={styles.frostHeadlineGlow} aria-hidden>
              SENTINEX
            </span>
            <span className={styles.frostHeadlineInner}>
              {HEADLINE_LETTERS.map((letter, i) => (
                <span
                  key={`${letter}-${i}`}
                  className={styles.frostLetter}
                  style={{ animationDelay: `${i * 0.07}s` }}
                >
                  {letter}
                </span>
              ))}
            </span>
          </h1>

          <p className={styles.introLine2}>
            {SUBTITLE_WORDS.map((word, i) => (
              <span
                key={word}
                className={`${styles.word} ${phase >= 4 + i ? styles.visible : ""}`}
              >
                {word}
              </span>
            ))}
          </p>

          <LiquidTagline lines={TAGLINE_LINES} visible={phase >= 7} />

          <div className={styles.introFeatures}>
            {FEATURES.map((feat, i) => (
              <span
                key={feat}
                className={`${styles.featureChip} ${phase >= 8 ? styles.visible : ""}`}
                style={{ transitionDelay: phase >= 8 ? `${i * 0.08}s` : "0s" }}
              >
                <span className={styles.featureChipSheen} aria-hidden />
                {feat}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className={`fixed bottom-10 sm:bottom-12 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center ${styles.bottomFooter}`}>
        <button
          type="button"
          className={`${styles.loginBtn} ${phase >= 9 ? styles.visible : ""}`}
          onClick={handleLogin}
        >
          <span className={styles.btnSheen} aria-hidden />
          <span className={styles.btnText}>ENTER SENTINEX</span>
          <span className={styles.btnArrow}>→</span>
        </button>

        <div className={styles.bottomCluster}>
          <div className={`${styles.introTag} ${styles.introTagBottom} ${phase >= 2 ? styles.visible : ""}`}>
            ◈ CATERPILLAR TECH CHALLENGE 2026
          </div>
          <div className={styles.teamDecoderzz}>
            <span className={styles.teamGlowBack} aria-hidden>
              TEAM DECODERZZ
            </span>
            <span className={styles.teamGlowSweep} aria-hidden />
            <span className={styles.teamText}>TEAM DECODERZZ</span>
          </div>
        </div>
      </div>

      <div className={styles.scanOverlay} aria-hidden />
    </div>
  );
}
