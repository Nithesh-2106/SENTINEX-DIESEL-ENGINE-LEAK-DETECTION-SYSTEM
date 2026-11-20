import { useEffect, useRef, useCallback } from "react";
import {
  setupCanvasSize,
  safeRaf,
  useDecorativeCanvasLoop,
  useGatedCanvasDraw,
} from "./canvasPerf.js";
import useThemeTokens from "../../hooks/useThemeTokens.js";

export default function LeakStateVisual({
  isLeak = false,
  severity = "None",
  style = {},
  active = true,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animRef = useRef(null);
  const drawRef = useRef(null);
  const drawFnRef = useRef(null);
  const stateRef = useRef({ isLeak, severity });
  const ringsRef = useRef([]);
  const spawnIntervalRef = useRef(null);
  const chaosParticlesRef = useRef(null);
  const tRef = useRef(0);
  const { tokensRef } = useThemeTokens();

  useEffect(() => {
    stateRef.current = { isLeak, severity };
  }, [isLeak, severity]);

  const spawnRing = useCallback(() => {
    const state = stateRef.current;
    const T = tokensRef.current;
    ringsRef.current.push({
      r: 0,
      maxR: state.isLeak ? 120 : 80,
      speed: state.isLeak ? 1.5 : 0.6,
      colour: state.isLeak ? T.leakColour : T.cyanColour,
      alpha: state.isLeak ? 0.6 : 0.35,
      lw: state.isLeak ? 1.5 : 0.8,
    });
  }, [tokensRef]);

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
    const cx = W / 2;
    const cy = H / 2;
    const state = stateRef.current;
    const T = tokensRef.current;
    const t = tRef.current;
    const rings = ringsRef.current;

    ctx.clearRect(0, 0, W, H);

    const pulseR = state.isLeak ? 18 + Math.sin(t * 0.08) * 6 : 14 + Math.sin(t * 0.03) * 4;
    const pulseGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulseR * 3);
    pulseGrad.addColorStop(
      0,
      state.isLeak ? `rgba(${T.leakColour}, 0.5)` : `rgba(${T.cyanColour}, 0.4)`
    );
    pulseGrad.addColorStop(1, "transparent");
    ctx.beginPath();
    ctx.arc(cx, cy, pulseR * 3, 0, Math.PI * 2);
    ctx.fillStyle = pulseGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
    ctx.fillStyle = state.isLeak ? `rgba(${T.leakColour}, 0.9)` : `rgba(${T.cyanColour}, 0.8)`;
    ctx.fill();

    for (let i = rings.length - 1; i >= 0; i--) {
      const ring = rings[i];
      ring.r += ring.speed;
      const progress = ring.r / ring.maxR;
      const alpha = ring.alpha * (1 - progress);

      ctx.beginPath();
      ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${ring.colour}, ${alpha})`;
      ctx.lineWidth = ring.lw * (1 - progress * 0.5);
      ctx.stroke();

      if (ring.r >= ring.maxR) rings.splice(i, 1);
    }

    if (state.isLeak && chaosParticlesRef.current) {
      for (const cp of chaosParticlesRef.current) {
        cp.opacity -= 0.02;
        if (cp.opacity <= 0) {
          cp.angle = Math.random() * Math.PI * 2;
          cp.speed = 0.8 + Math.random() * 2.5;
          cp.dist = 5;
          cp.opacity = 0.8 + Math.random() * 0.2;
          cp.active = true;
        }
        if (cp.active) {
          cp.dist += cp.speed;
          const px = cx + Math.cos(cp.angle) * cp.dist;
          const py = cy + Math.sin(cp.angle) * cp.dist;
          ctx.beginPath();
          ctx.arc(px, py, cp.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 120, 100, ${Math.max(0, cp.opacity)})`;
          ctx.fill();
        }
      }
    }

    tRef.current += 1;
    safeRaf(animRef, drawRef.current);
  }, [tokensRef]);

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
    deps: [isLeak],
  });

  useEffect(() => {
    chaosParticlesRef.current = Array.from({ length: 30 }, () => ({
      angle: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 2,
      dist: 20 + Math.random() * 60,
      size: 1 + Math.random() * 2,
      opacity: Math.random(),
      active: false,
    }));

    const resetSpawnInterval = () => {
      if (spawnIntervalRef.current) clearInterval(spawnIntervalRef.current);
      spawnRing();
      spawnIntervalRef.current = setInterval(
        spawnRing,
        stateRef.current.isLeak ? 600 : 1800
      );
    };

    resetSpawnInterval();

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(animRef.current);
      safeRaf(animRef, drawRef.current);
    });
    if (canvasRef.current) ro.observe(canvasRef.current);

    return () => {
      clearInterval(spawnIntervalRef.current);
      ro.disconnect();
    };
  }, [spawnRing]);

  useEffect(() => {
    if (spawnIntervalRef.current) clearInterval(spawnIntervalRef.current);
    spawnRing();
    spawnIntervalRef.current = setInterval(
      spawnRing,
      isLeak ? 600 : 1800
    );
    return () => clearInterval(spawnIntervalRef.current);
  }, [isLeak, spawnRing]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", ...style }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}
