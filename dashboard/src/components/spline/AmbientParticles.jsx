import { useEffect, useRef, useCallback } from "react";
import {
  setupCanvasSize,
  safeRaf,
  useDecorativeCanvasLoop,
  useGatedCanvasDraw,
} from "./canvasPerf.js";
import useThemeTokens from "../../hooks/useThemeTokens.js";

export default function AmbientParticles({
  count = 60,
  colour,
  maxOpacity = 0.35,
  speed = 0.3,
  style = {},
  active = true,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animRef = useRef(null);
  const drawRef = useRef(null);
  const drawFnRef = useRef(null);
  const particlesRef = useRef(null);
  const linkFrameRef = useRef(0);
  const { tokensRef } = useThemeTokens();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const particleColour = colour || tokensRef.current.particleColour;
    const { w: W, h: H } = setupCanvasSize(canvas, ctx);
    if (W < 1 || H < 1) {
      safeRaf(animRef, drawRef.current);
      return;
    }

    if (!particlesRef.current || particlesRef.current.length !== count) {
      particlesRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * speed,
        vy: (Math.random() - 0.5) * speed,
        size: 0.8 + Math.random() * 1.8,
        opacity: Math.random() * maxOpacity,
        opacityDir: Math.random() > 0.5 ? 1 : -1,
        opacitySpeed: 0.002 + Math.random() * 0.004,
      }));
    }

    const particles = particlesRef.current;
    ctx.clearRect(0, 0, W, H);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;

      p.opacity += p.opacityDir * p.opacitySpeed;
      if (p.opacity >= maxOpacity) {
        p.opacity = maxOpacity;
        p.opacityDir = -1;
      }
      if (p.opacity <= 0.02) {
        p.opacity = 0.02;
        p.opacityDir = 1;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${particleColour}, ${p.opacity})`;
      ctx.fill();
    }

    linkFrameRef.current += 1;
    if (linkFrameRef.current % 2 === 0 && particles.length <= 24) {
      const maxDist = 90;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distSq = dx * dx + dy * dy;
          if (distSq < maxDist * maxDist) {
            const dist = Math.sqrt(distSq);
            const alpha = (1 - dist / maxDist) * 0.06;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(${particleColour}, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
    }

    safeRaf(animRef, drawRef.current);
  }, [count, colour, maxOpacity, speed, tokensRef]);

  const fpsGateRef = useDecorativeCanvasLoop({
    animRef,
    drawRef,
    containerRef,
    active,
    targetFps: 24,
  });

  useGatedCanvasDraw({
    animRef,
    drawRef,
    drawFnRef,
    fpsGateRef,
    draw,
    active,
    deps: [count],
  });

  useEffect(() => {
    particlesRef.current = null;
  }, [count]);

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      particlesRef.current = null;
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
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}
