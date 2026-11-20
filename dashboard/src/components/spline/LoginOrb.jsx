import { useEffect, useRef, useCallback } from "react";
import { setupCanvasSize, useCanvasVisibility } from "./canvasPerf.js";
import useThemeTokens from "../../hooks/useThemeTokens.js";

export default function LoginOrb({ style = {}, active = true }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const drawRef = useRef(null);
  const frameSkipRef = useRef(0);
  const { tokensRef } = useThemeTokens();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const T = tokensRef.current;

    if (!active) {
      frameSkipRef.current += 1;
      if (frameSkipRef.current % 3 !== 0) {
        animRef.current = requestAnimationFrame(drawRef.current);
        return;
      }
    } else {
      frameSkipRef.current = 0;
    }

    if (!draw.t) draw.t = 0;
    const t = draw.t;

    const PARTICLE_COUNT = 120;
    if (!draw.particles) {
      draw.particles = Array.from({ length: PARTICLE_COUNT }, () => {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 0.85 + Math.random() * 0.15;
        return {
          theta,
          phi,
          r,
          tOffset: Math.random() * Math.PI * 2,
          speed: 0.0002 + Math.random() * 0.0003,
          size: 1.5 + Math.random() * 2.5,
          opacity: 0.3 + Math.random() * 0.7,
          connects: Math.random() > 0.6,
        };
      });
    }

    function project(p, cx, cy, radius, rotY) {
      const sinY = Math.sin(rotY);
      const cosY = Math.cos(rotY);
      const x = p.r * Math.sin(p.phi) * Math.cos(p.theta);
      const y = p.r * Math.cos(p.phi);
      const z = p.r * Math.sin(p.phi) * Math.sin(p.theta);
      const rx = x * cosY - z * sinY;
      const rz = x * sinY + z * cosY;
      const fov = 2.5;
      const scale = fov / (fov + rz);
      return {
        sx: cx + rx * radius * scale,
        sy: cy + y * radius * scale,
        scale,
        z: rz,
        visible: rz > -0.3,
      };
    }

    const { w: W, h: H } = setupCanvasSize(canvas, ctx);
    ctx.clearRect(0, 0, W, H);

    const cx = W * 0.5;
    const cy = H * 0.5;
    const radius = Math.min(W, H) * 0.38;
    const rotY = t * 0.00025;

    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.4);
    glow.addColorStop(0, `rgba(${T.cyanColour}, 0.08)`);
    glow.addColorStop(0.5, `rgba(${T.violetColour}, 0.04)`);
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    const sphere = ctx.createRadialGradient(
      cx - radius * 0.2,
      cy - radius * 0.2,
      0,
      cx,
      cy,
      radius
    );
    sphere.addColorStop(0, T.orbGlow1);
    sphere.addColorStop(0.4, T.orbGlow2);
    sphere.addColorStop(1, `rgba(${T.cyanColour}, 0.02)`);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = sphere;
    ctx.fill();

    for (let ring = 0; ring < 3; ring++) {
      const ringAngle = t * 0.0001 * (ring + 1) + (ring * Math.PI) / 3;
      const rx = Math.cos(ringAngle) * radius * 0.6;
      const ry = radius * 0.8;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.abs(rx), ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${T.cyanColour}, ${0.05 + ring * 0.02})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    const projected = draw.particles.map((p) => ({
      p,
      proj: project(p, cx, cy, radius, rotY),
    }));
    projected.sort((a, b) => a.proj.z - b.proj.z);

    const visible = projected.filter(({ proj }) => proj.visible);
    for (let i = 0; i < visible.length; i++) {
      if (!visible[i].p.connects) continue;
      for (let j = i + 1; j < visible.length; j++) {
        if (!visible[j].p.connects) continue;
        const { sx: ax, sy: ay } = visible[i].proj;
        const { sx: bx, sy: by } = visible[j].proj;
        const dist = Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
        if (dist < radius * 0.45) {
          const alpha = (1 - dist / (radius * 0.45)) * 0.15;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.strokeStyle = `rgba(${T.cyanColour}, ${alpha})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    for (const { p, proj } of projected) {
      if (!proj.visible) continue;
      const brightness = (proj.z + 1) / 2;
      const alpha = p.opacity * brightness * 0.9;
      const size = p.size * proj.scale;

      if (brightness > 0.5) {
        const glowR = ctx.createRadialGradient(proj.sx, proj.sy, 0, proj.sx, proj.sy, size * 4);
        glowR.addColorStop(0, `rgba(${T.cyanColour}, ${alpha * 0.5})`);
        glowR.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(proj.sx, proj.sy, size * 4, 0, Math.PI * 2);
        ctx.fillStyle = glowR;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(proj.sx, proj.sy, size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${
        brightness > 0.7 ? T.violetColour : T.cyanColour
      }, ${alpha})`;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI * 1.2, Math.PI * 1.85);
    ctx.strokeStyle = T.labelDim;
    ctx.lineWidth = radius * 0.08;
    ctx.stroke();

    draw.t += 1;
    animRef.current = requestAnimationFrame(drawRef.current);
  }, [active, tokensRef]);

  useEffect(() => {
    drawRef.current = draw;
    animRef.current = requestAnimationFrame(draw);

    const ro = new ResizeObserver(() => {
      if (drawRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = requestAnimationFrame(drawRef.current);
      }
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
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        ...style,
      }}
    />
  );
}
