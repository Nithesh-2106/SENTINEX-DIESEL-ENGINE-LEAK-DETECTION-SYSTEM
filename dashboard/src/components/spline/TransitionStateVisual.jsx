import { useCallback, useEffect, useRef } from "react";
import { setupCanvasSize, useCanvasVisibility } from "./canvasPerf.js";

const GLITTER_COUNT = 36;

function initGlitter() {
  return Array.from({ length: GLITTER_COUNT }, (_, i) => ({
    x: 0.15 + Math.random() * 0.7,
    y: 0.2 + Math.random() * 0.55,
    phase: Math.random() * Math.PI * 2,
    speed: 0.02 + Math.random() * 0.03,
    size: 0.5 + Math.random() * 1.2,
  }));
}

function settleRatio(act, sp, scale) {
  const err = Math.abs(sp - act);
  return Math.max(0, Math.min(1, 1 - err / scale));
}

/** Side-view holographic engine wireframe blocks */
const ENGINE_PARTS = [
  { id: "intake", x: -0.42, y: 0.08, w: 0.18, h: 0.22, label: "INTAKE" },
  { id: "block", x: -0.12, y: -0.02, w: 0.28, h: 0.38, label: "BLOCK" },
  { id: "turbo", x: 0.02, y: -0.28, w: 0.14, h: 0.12, label: "TURBO" },
  { id: "cac", x: -0.38, y: -0.12, w: 0.12, h: 0.14, label: "CAC" },
  { id: "exhaust", x: 0.22, y: 0.04, w: 0.2, h: 0.18, label: "EXH" },
  { id: "dpf", x: 0.38, y: 0.1, w: 0.14, h: 0.14, label: "DPF" },
];

function drawHoloPart(ctx, part, cx, cy, scale, t, pulse) {
  const x = cx + part.x * scale;
  const y = cy + part.y * scale;
  const w = part.w * scale;
  const h = part.h * scale;
  const glow = 0.35 + pulse * 0.45;

  ctx.save();
  ctx.translate(x, y);

  ctx.shadowColor = "rgba(13, 184, 240, 0.8)";
  ctx.shadowBlur = 6 + pulse * 10;
  ctx.strokeStyle = `rgba(125, 211, 252, ${0.45 + pulse * 0.4})`;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-w / 2, -h / 2, w, h);

  ctx.shadowBlur = 0;
  ctx.fillStyle = `rgba(13, 184, 240, ${0.04 + pulse * 0.06})`;
  ctx.fillRect(-w / 2, -h / 2, w, h);

  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.lineTo(w / 2, 0);
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.08 + pulse * 0.12})`;
  ctx.lineWidth = 0.5;
  ctx.stroke();

  const scanY = ((t * 1.8 + part.x * 40) % h) - h / 2;
  ctx.fillStyle = `rgba(125, 211, 252, ${0.15 + pulse * 0.2})`;
  ctx.fillRect(-w / 2, scanY, w, 2);

  ctx.font = `600 ${Math.max(7, scale * 0.028)}px system-ui, sans-serif`;
  ctx.fillStyle = `rgba(125, 211, 252, ${0.35 + pulse * 0.3})`;
  ctx.textAlign = "center";
  ctx.fillText(part.label, 0, h / 2 + 10);

  ctx.restore();
}

export default function TransitionStateVisual({
  opRpm = 0,
  spRpm = 0,
  opLoad = 0,
  spLoad = 0,
  style = {},
}) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const drawRef = useRef(null);
  const tRef = useRef(0);
  const glitterRef = useRef(initGlitter());
  const metricsRef = useRef({ opRpm, spRpm, opLoad, spLoad });

  useEffect(() => {
    metricsRef.current = { opRpm, spRpm, opLoad, spLoad };
  }, [opRpm, spRpm, opLoad, spLoad]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w: W, h: H } = setupCanvasSize(canvas, ctx);
    const cx = W * 0.5;
    const cy = H * 0.52;
    const scale = Math.min(W, H) * 0.92;
    const t = tRef.current;
    const { opRpm: actR, spRpm: spR, opLoad: actL, spLoad: spL } = metricsRef.current;

    const rpmRatio = settleRatio(actR, spR, Math.max(120, Math.abs(spR - actR) + 80));
    const loadRatio = settleRatio(actL, spL, Math.max(18, Math.abs(spL - actL) + 12));
    const pulse = rpmRatio * 0.55 + loadRatio * 0.45;

    ctx.clearRect(0, 0, W, H);

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "rgba(6, 12, 22, 0.2)");
    bg.addColorStop(0.5, "rgba(13, 184, 240, 0.04)");
    bg.addColorStop(1, "rgba(6, 10, 18, 0.35)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const floorY = cy + scale * 0.28;
    ctx.strokeStyle = "rgba(13, 184, 240, 0.12)";
    ctx.lineWidth = 0.5;
    for (let i = -4; i <= 4; i++) {
      const gx = cx + i * scale * 0.08;
      ctx.beginPath();
      ctx.moveTo(gx, floorY);
      ctx.lineTo(cx + (i * scale * 0.14), H);
      ctx.stroke();
    }
    for (let j = 0; j < 6; j++) {
      const gy = floorY + j * scale * 0.06;
      ctx.beginPath();
      ctx.moveTo(cx - scale * 0.5, gy);
      ctx.lineTo(cx + scale * 0.5, gy);
      ctx.stroke();
    }

    const holoAngle = t * 0.008;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(holoAngle * 0.15);
    for (let ring = 1; ring <= 3; ring++) {
      const r = scale * (0.12 + ring * 0.06) + Math.sin(t * 0.03 + ring) * 2;
      ctx.beginPath();
      ctx.ellipse(0, scale * 0.12, r * 1.4, r * 0.35, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(125, 211, 252, ${0.08 + ring * 0.04})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    ENGINE_PARTS.forEach((part) => drawHoloPart(ctx, part, cx, cy, scale, t, pulse));

    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.ellipse(0, scale * 0.05, scale * 0.08, scale * 0.05, 0, 0, Math.PI * 2);
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, scale * 0.1);
    coreGrad.addColorStop(0, `rgba(255, 255, 255, ${0.7 + pulse * 0.3})`);
    coreGrad.addColorStop(0.4, `rgba(125, 211, 252, ${0.35 + pulse * 0.25})`);
    coreGrad.addColorStop(1, "transparent");
    ctx.fillStyle = coreGrad;
    ctx.fill();
    ctx.restore();

    const scanLineY = (t * 1.2) % H;
    const scanGrad = ctx.createLinearGradient(0, scanLineY - 20, 0, scanLineY + 20);
    scanGrad.addColorStop(0, "transparent");
    scanGrad.addColorStop(0.5, "rgba(125, 211, 252, 0.12)");
    scanGrad.addColorStop(1, "transparent");
    ctx.fillStyle = scanGrad;
    ctx.fillRect(0, scanLineY - 20, W, 40);

    for (const g of glitterRef.current) {
      const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(t * g.speed + g.phase));
      const px = g.x * W + Math.sin(t * 0.006 + g.phase) * 4;
      const py = g.y * H + Math.cos(t * 0.005 + g.phase) * 3;
      ctx.beginPath();
      ctx.arc(px, py, g.size * twinkle, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${twinkle * 0.75})`;
      ctx.fill();
      if (twinkle > 0.7) {
        ctx.strokeStyle = `rgba(125, 211, 252, ${twinkle * 0.4})`;
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.moveTo(px - 3, py);
        ctx.lineTo(px + 3, py);
        ctx.moveTo(px, py - 3);
        ctx.lineTo(px, py + 3);
        ctx.stroke();
      }
    }

    const arcR = scale * 0.38;
    const startA = Math.PI * 0.15;
    const endA = Math.PI * 0.85;
    ctx.beginPath();
    ctx.arc(cx, cy + scale * 0.22, arcR, startA, endA);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth = 2;
    ctx.stroke();
    const progA = startA + (endA - startA) * pulse;
    ctx.beginPath();
    ctx.arc(cx, cy + scale * 0.22, arcR, startA, progA);
    const arcGrad = ctx.createLinearGradient(cx - arcR, cy, cx + arcR, cy);
    arcGrad.addColorStop(0, "rgba(125, 211, 252, 0.5)");
    arcGrad.addColorStop(1, "rgba(255, 255, 255, 0.9)");
    ctx.strokeStyle = arcGrad;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();

    tRef.current += 1;
    animRef.current = requestAnimationFrame(drawRef.current);
  }, []);

  useEffect(() => {
    drawRef.current = draw;
    animRef.current = requestAnimationFrame(draw);
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(animRef.current);
      animRef.current = requestAnimationFrame(drawRef.current);
    });
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, [draw]);

  useCanvasVisibility(animRef, () => drawRef.current && requestAnimationFrame(drawRef.current));

  return (
    <canvas
      ref={canvasRef}
      className="transition-state-canvas"
      style={{ width: "100%", height: "100%", display: "block", ...style }}
    />
  );
}
