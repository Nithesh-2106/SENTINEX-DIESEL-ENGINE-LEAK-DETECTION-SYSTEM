import { useEffect, useState, useRef } from "react";
import { getTesterDisplayName, isHeadRole } from "../utils/testerRegistry.js";

const ROLE_CONFIG = {
  tester: {
    eyebrow: "SENTINEX detects",
    title: "Welcome, Tester",
    subtitle: "Operator Console",
    lines: ["Live sensor stream", "SHAP explainability", "Digital Twin ready"],
    accent: "#0DB8F0",
    accent2: "#00D4A8",
    accentRgb: "13, 184, 240",
    portal: "STREAMING PIPELINE",
    durationMs: 2100,
  },
  head: {
    eyebrow: "SENTINEX detects",
    title: "Welcome, Test Head",
    subtitle: "Supervisor Console",
    lines: ["Approval inbox", "Federated metrics", "Oversight layer active"],
    accent: "#A78BFA",
    accent2: "#818CF8",
    accentRgb: "167, 139, 250",
    portal: "OVERSIGHT LAYER",
    durationMs: 2000,
  },
};

export default function LoginWelcomeTransition({ role, onComplete }) {
  const isHead = isHeadRole(role);
  const cfg = isHead ? ROLE_CONFIG.head : {
    ...ROLE_CONFIG.tester,
    title: `Welcome, ${getTesterDisplayName(role)}`,
    portal: "PARALLEL TEST CELL",
  };
  const durationMs = cfg.durationMs;
  const [progress, setProgress] = useState(0);
  const [linesVisible, setLinesVisible] = useState(0);
  const [exiting, setExiting] = useState(false);

  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const progressRef = useRef(0);
  const lastTickRef = useRef(0);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    completedRef.current = false;
    setProgress(0);
    setLinesVisible(0);
    setExiting(false);
    progressRef.current = 0;

    const start = performance.now();
    const exitStartMs = durationMs * 0.72;
    const exitAnimMs = 560;
    const completeAt = exitStartMs + exitAnimMs;
    const lineDelays = cfg.lines.map((_, i) => 200 + i * 180);

    let raf = 0;
    let cancelled = false;

    const finish = () => {
      if (cancelled || completedRef.current) return;
      completedRef.current = true;
      onCompleteRef.current?.();
    };

    const tick = (now) => {
      if (cancelled) return;
      const elapsed = now - start;
      const pct = Math.min(100, (elapsed / exitStartMs) * 100);
      progressRef.current = pct;

      if (now - lastTickRef.current > 48) {
        lastTickRef.current = now;
        setProgress(pct);
      }

      const visible = lineDelays.filter((d) => elapsed >= d).length;
      setLinesVisible((v) => (v !== visible ? visible : v));

      if (elapsed >= exitStartMs) setExiting((e) => (e ? e : true));

      if (elapsed >= completeAt) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    const safety = setTimeout(finish, completeAt + 80);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(safety);
    };
  }, [role, durationMs, cfg.lines]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const [hr, hg, hb] = cfg.accentRgb.split(",").map((n) => parseInt(n.trim(), 10));

    const particles = Array.from({ length: 56 }, () => ({
      a: Math.random() * Math.PI * 2,
      r: 0.15 + Math.random() * 0.75,
      speed: 0.006 + Math.random() * 0.014,
      size: 1 + Math.random() * 2,
    }));

    let t = 0;
    let cancelled = false;

    const draw = () => {
      if (cancelled) return;
      const W = (canvas.width = window.innerWidth);
      const H = (canvas.height = window.innerHeight);
      const pct = progressRef.current;
      const cx = W / 2;
      const cy = H / 2;
      const boost = pct > 68 ? 2.8 : 1;

      ctx.clearRect(0, 0, W, H);

      for (const p of particles) {
        p.r += p.speed * boost;
        if (p.r > 1.15) p.r = 0.12;
        const px = cx + Math.cos(p.a + t * 0.012) * p.r * Math.min(W, H) * 0.46;
        const py = cy + Math.sin(p.a + t * 0.012) * p.r * Math.min(W, H) * 0.36;
        const alpha = (1 - p.r) * 0.55;
        ctx.fillStyle = `rgba(${hr}, ${hg}, ${hb}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      const tunnelR = Math.min(W, H) * (0.12 + (pct / 100) * 0.58);
      ctx.strokeStyle = `rgba(${hr}, ${hg}, ${hb}, ${0.15 + (pct / 100) * 0.25})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, tunnelR, 0, Math.PI * 2);
      ctx.stroke();

      t += 1;
      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelled = true;
      cancelAnimationFrame(animRef.current);
    };
  }, [cfg.accentRgb]);

  return (
    <div
      className={`login-portal-overlay login-portal-overlay--role-${role} ${exiting ? "login-portal-overlay--exit" : ""}`}
      style={{
        "--portal-accent": cfg.accent,
        "--portal-accent2": cfg.accent2,
        "--portal-rgb": cfg.accentRgb,
      }}
    >
      <canvas ref={canvasRef} className="login-portal-canvas" aria-hidden />

      <div className="login-portal-liquid login-portal-liquid--1" />
      <div className="login-portal-liquid login-portal-liquid--2" />
      <div className="login-portal-vignette" />

      <div className="login-portal-core">
        <div className="login-portal-ring-outer" />
        <div className="login-portal-ring-mid" />
        <div className="login-portal-ring-inner" />

        <div className="login-portal-copy">
          <p className="login-portal-eyebrow">{cfg.eyebrow}</p>
          <h1 className="login-portal-title">{cfg.title}</h1>
          <p className="login-portal-sub">{cfg.subtitle}</p>

          <ul className="login-portal-lines">
            {cfg.lines.map((line, i) => (
              <li key={line} className={i < linesVisible ? "visible" : ""}>
                <span className="login-portal-line-dot" />
                {line}
              </li>
            ))}
          </ul>

          <div className="login-portal-bar">
            <div className="login-portal-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="login-portal-foot">
            ARIA explains · Entering {cfg.portal}
          </p>
        </div>
      </div>
    </div>
  );
}
