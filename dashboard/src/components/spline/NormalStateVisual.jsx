import { useCallback, useEffect, useRef } from "react";
import {
  setupCanvasSize,
  safeRaf,
  useDecorativeCanvasLoop,
  useGatedCanvasDraw,
} from "./canvasPerf.js";

/**
 * Live engine nominal-state hologram — airflow, RPM rhythm, steady pulse.
 */
export default function NormalStateVisual({
  opRpm = 1800,
  opLoad = 75,
  isStreaming = false,
  style = {},
  active = true,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animRef = useRef(null);
  const drawRef = useRef(null);
  const drawFnRef = useRef(null);
  const stateRef = useRef({ opRpm, opLoad, isStreaming });
  const particlesRef = useRef([]);
  const tRef = useRef(0);

  useEffect(() => {
    stateRef.current = { opRpm, opLoad, isStreaming };
  }, [opRpm, opLoad, isStreaming]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w: W, h: H } = setupCanvasSize(canvas, ctx);
    if (W < 1 || H < 1) {
      safeRaf(animRef, drawRef.current);
      return;
    }
    const cx = W * 0.5;
    const cy = H * 0.5;
    const { opRpm: rpm, opLoad: load, isStreaming: live } = stateRef.current;
    const t = tRef.current;
    const rpmNorm = Math.min(1.4, Math.max(0.35, rpm / 1800));
    const loadNorm = Math.min(1, Math.max(0.2, load / 100));
    const speed = live ? 0.04 + rpmNorm * 0.06 : 0.012;

    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(13, 184, 240, 0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    const rings = [
      { r: 52, w: 1.2, col: "rgba(52, 211, 153, 0.35)", dir: 1 },
      { r: 72, w: 0.9, col: "rgba(13, 184, 240, 0.28)", dir: -1 },
      { r: 92, w: 0.6, col: "rgba(52, 211, 153, 0.15)", dir: 1 },
    ];
    rings.forEach((ring, i) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * speed * ring.dir * (1 + i * 0.15));
      ctx.beginPath();
      ctx.arc(0, 0, ring.r, 0, Math.PI * 2);
      ctx.strokeStyle = ring.col;
      ctx.lineWidth = ring.w;
      ctx.stroke();
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * (ring.r - 4), Math.sin(ang) * (ring.r - 4));
        ctx.lineTo(Math.cos(ang) * ring.r, Math.sin(ang) * ring.r);
        ctx.stroke();
      }
      ctx.restore();
    });

    const pulse = 16 + Math.sin(t * speed * 2.2) * 4 * loadNorm;
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulse * 3.5);
    coreGrad.addColorStop(0, `rgba(52, 211, 153, ${0.45 + loadNorm * 0.2})`);
    coreGrad.addColorStop(0.4, "rgba(13, 184, 240, 0.2)");
    coreGrad.addColorStop(1, "transparent");
    ctx.beginPath();
    ctx.arc(cx, cy, pulse * 3.5, 0, Math.PI * 2);
    ctx.fillStyle = coreGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(52, 211, 153, 0.85)";
    ctx.fill();

    if (particlesRef.current.length < 48) {
      particlesRef.current = Array.from({ length: 48 }, (_, i) => ({
        x: Math.random() * W,
        y: cy + (Math.random() - 0.5) * 60,
        vx: 1.2 + Math.random() * 2.5,
        vy: (Math.random() - 0.5) * 0.4,
        size: 1 + Math.random() * 1.5,
        hue: i % 3 === 0 ? "52, 211, 153" : "13, 184, 240",
        alpha: 0.3 + Math.random() * 0.5,
      }));
    }

    const parts = particlesRef.current;
    for (const p of parts) {
      if (live) {
        p.x += p.vx * rpmNorm;
        p.y += p.vy + Math.sin(t * 0.05 + p.x * 0.02) * 0.15;
      }
      if (p.x > W + 10) {
        p.x = -10;
        p.y = cy + (Math.random() - 0.5) * 70;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.hue}, ${live ? p.alpha : p.alpha * 0.35})`;
      ctx.fill();
    }

    const waveY = H - 18;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 3) {
      const y = waveY + Math.sin((x + t * 3) * 0.04 * rpmNorm) * 5 * loadNorm;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(52, 211, 153, ${live ? 0.55 : 0.25})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    tRef.current += live ? 1.2 : 0.4;
    safeRaf(animRef, drawRef.current);
  }, []);

  const fpsGateRef = useDecorativeCanvasLoop({
    animRef,
    drawRef,
    containerRef,
    active,
    targetFps: 30,
  });

  useGatedCanvasDraw({
    animRef,
    drawRef,
    drawFnRef,
    fpsGateRef,
    draw,
    active,
  });

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      particlesRef.current = [];
      cancelAnimationFrame(animRef.current);
      safeRaf(animRef, drawRef.current);
    });
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", ...style }}>
      <canvas
        ref={canvasRef}
        className="normal-state-canvas"
        style={{ width: "100%", height: "100%", display: "block" }}
        aria-hidden
      />
    </div>
  );
}
