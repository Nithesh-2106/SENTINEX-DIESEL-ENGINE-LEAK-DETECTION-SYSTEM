import { useEffect, useRef, useCallback, useState } from "react";
import { setupCanvasSize, useCanvasVisibility } from "./canvasPerf.js";

export const AI_ORBS = [
  { id: "shap", label: "SHAP", title: "Explainability", desc: "Which sensors drive each leak prediction", x: 0.07, y: 0.22, color: "#0DB8F0", orbit: 0 },
  { id: "fl", label: "FL", title: "Federated", desc: "Cross-facility learning without raw data sharing", x: 0.93, y: 0.2, color: "#34D399", orbit: 1.2 },
  { id: "rca", label: "RCA", title: "Root Cause", desc: "Physics-based ranked failure hypotheses", x: 0.06, y: 0.86, color: "#A78BFA", orbit: 2.4 },
  { id: "twin", label: "TWIN", title: "Digital Twin", desc: "3D engine with live SHAP overlay", x: 0.94, y: 0.84, color: "#38BDF8", orbit: 3.1 },
  { id: "guard", label: "GUARD", title: "Steady Guard", desc: "Suppresses false alarms during transients", x: 0.72, y: 0.1, color: "#3DAA8A", orbit: 4.5 },
  { id: "ml", label: "ML", title: "Ensemble ML", desc: "Leak location, severity & action heads", x: 0.88, y: 0.52, color: "#818CF8", orbit: 5.8 },
];

/** Center brand lockup — keep decorative orbs out of this zone */
const BRAND_SAFE = { xMin: 0.22, xMax: 0.78, yMin: 0, yMax: 0.2 };

function makeLiquidBlobs(W, H) {
  return Array.from({ length: 7 }, (_, i) => ({
    x: W * (0.15 + (i * 0.12) % 0.7),
    y: H * (0.25 + ((i * 0.17) % 0.5)),
    r: 90 + i * 22,
    vx: (Math.random() - 0.5) * 0.28,
    vy: (Math.random() - 0.5) * 0.28,
    phase: Math.random() * Math.PI * 2,
    hue: i % 2 === 0 ? 195 : 265,
  }));
}

function drawGlassOrb(ctx, x, y, baseR, t, color, hoverBoost, orbitPhase) {
  const pulse = 1 + Math.sin(t * 0.02 + orbitPhase) * 0.03;
  const r = baseR * pulse * (1 + hoverBoost * 0.15);
  const [hr, hg, hb] = hexToRgb(color);

  const g2 = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
  g2.addColorStop(0, `rgba(${hr}, ${hg}, ${hb}, ${0.12 + hoverBoost * 0.1})`);
  g2.addColorStop(1, "transparent");
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
  ctx.fill();

  const sphere = ctx.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.05, x, y, r);
  sphere.addColorStop(0, `rgba(255, 255, 255, ${0.2 + hoverBoost * 0.15})`);
  sphere.addColorStop(0.4, `rgba(${hr}, ${hg}, ${hb}, 0.35)`);
  sphere.addColorStop(1, `rgba(${hr}, ${hg}, ${hb}, 0.05)`);
  ctx.fillStyle = sphere;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(${hr}, ${hg}, ${hb}, ${0.35 + hoverBoost * 0.2})`;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export default function LoginLiquidCanvas({ activeRole = "tester", onOrbHover, style = {} }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const animRef = useRef(null);
  const drawRef = useRef(null);
  const mouseRef = useRef({ x: -999, y: -999, active: false });
  const ripplesRef = useRef([]);
  const trailRef = useRef([]);
  const particlesRef = useRef([]);
  const [hoveredId, setHoveredId] = useState(null);
  const [dims, setDims] = useState({ w: 1, h: 1 });

  const roleAccent = activeRole === "head" ? [167, 139, 250] : [13, 184, 240];

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!draw.t) draw.t = 0;
    const t = draw.t;
    const { w: W, h: H } = setupCanvasSize(canvas, ctx);
    if (draw.lastW !== W || draw.lastH !== H) {
      draw.blobs = makeLiquidBlobs(W, H);
      draw.lastW = W;
      draw.lastH = H;
      setDims({ w: W, h: H });
    }

    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#02060f");
    bg.addColorStop(0.5, "#040c18");
    bg.addColorStop(1, "#020408");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    for (const blob of draw.blobs) {
      blob.x += blob.vx + Math.sin(t * 0.006 + blob.phase) * 0.55;
      blob.y += blob.vy + Math.cos(t * 0.005 + blob.phase) * 0.45;
      if (blob.x < blob.r * 0.2 || blob.x > W - blob.r * 0.2) blob.vx *= -1;
      if (blob.y < blob.r * 0.2 || blob.y > H - blob.r * 0.2) blob.vy *= -1;

      if (mouseRef.current.active) {
        const dx = blob.x - mx;
        const dy = blob.y - my;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < 320) {
          const force = Math.pow((320 - dist) / 320, 1.4);
          const swirl = Math.sin(t * 0.04 + blob.phase) * 0.8;
          blob.x += (dx / dist) * force * 3.2 + (-dy / dist) * swirl * force;
          blob.y += (dy / dist) * force * 3.2 + (dx / dist) * swirl * force;
        }
      }
    }

    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < draw.blobs.length; i++) {
      for (let j = i + 1; j < draw.blobs.length; j++) {
        const a = draw.blobs[i];
        const b = draw.blobs[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const merge = Math.max(0, 1 - dist / (a.r + b.r + 40));
        if (merge > 0.05) {
          const mx2 = (a.x + b.x) / 2;
          const my2 = (a.y + b.y) / 2;
          const mr = (a.r + b.r) * 0.45 * merge;
          const lg = ctx.createRadialGradient(mx2, my2, 0, mx2, my2, mr);
          lg.addColorStop(0, `rgba(${roleAccent.join(",")}, ${merge * 0.18})`);
          lg.addColorStop(1, "transparent");
          ctx.fillStyle = lg;
          ctx.beginPath();
          ctx.arc(mx2, my2, mr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    for (const blob of draw.blobs) {
      const pulse = 1 + Math.sin(t * 0.018 + blob.phase) * 0.1;
      const lg = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.r * pulse);
      lg.addColorStop(0, `rgba(${roleAccent.join(",")}, ${mouseRef.current.active ? 0.14 : 0.07})`);
      lg.addColorStop(0.45, `rgba(56, 189, 248, ${mouseRef.current.active ? 0.08 : 0.03})`);
      lg.addColorStop(1, "transparent");
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(blob.x, blob.y, blob.r * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    for (let i = 0; i < 5; i++) {
      const waveY = H * (0.2 + i * 0.15) + Math.sin(t * 0.012 + i * 1.4) * 28;
      const waveG = ctx.createLinearGradient(0, waveY - 40, 0, waveY + 40);
      waveG.addColorStop(0, "transparent");
      waveG.addColorStop(0.45, `rgba(${roleAccent.join(",")}, 0.04)`);
      waveG.addColorStop(0.5, `rgba(255, 255, 255, 0.06)`);
      waveG.addColorStop(0.55, `rgba(56, 189, 248, 0.05)`);
      waveG.addColorStop(1, "transparent");
      ctx.fillStyle = waveG;
      ctx.fillRect(0, waveY - 40, W, 80);
    }

    if (!particlesRef.current.length) {
      particlesRef.current = Array.from({ length: 48 }, () => ({
        edge: Math.floor(Math.random() * AI_ORBS.length),
        t: Math.random(),
        speed: 0.001 + Math.random() * 0.002,
      }));
    }

    let nearestId = null;
    let nearestDist = Infinity;

    const orbPositions = AI_ORBS.map((node) => ({
      ...node,
      px: node.x * W,
      py: node.y * H,
    }));

    for (let i = 0; i < orbPositions.length; i++) {
      for (let j = i + 1; j < orbPositions.length; j++) {
        const a = orbPositions[i];
        const b = orbPositions[j];
        const flicker = 0.06 + Math.sin(t * 0.025 + i * j) * 0.05;
        const grad = ctx.createLinearGradient(a.px, a.py, b.px, b.py);
        grad.addColorStop(0, `rgba(${hexToRgb(a.color).join(",")}, ${flicker})`);
        grad.addColorStop(0.5, `rgba(255,255,255,${flicker * 0.5})`);
        grad.addColorStop(1, `rgba(${hexToRgb(b.color).join(",")}, ${flicker})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.px, a.py);
        ctx.lineTo(b.px, b.py);
        ctx.stroke();
      }
    }

    for (const p of particlesRef.current) {
      p.t += p.speed;
      if (p.t > 1) p.t = 0;
      const a = orbPositions[p.edge % orbPositions.length];
      const b = orbPositions[(p.edge + 2) % orbPositions.length];
      const px = a.px + (b.px - a.px) * p.t;
      const py = a.py + (b.py - a.py) * p.t;
      const [pr, pg, pb] = hexToRgb(a.color);
      ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, 0.7)`;
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const node of orbPositions) {
      const inBrandZone =
        node.x >= BRAND_SAFE.xMin &&
        node.x <= BRAND_SAFE.xMax &&
        node.y >= BRAND_SAFE.yMin &&
        node.y <= BRAND_SAFE.yMax;
      if (inBrandZone) continue;

      const dx = mx - node.px;
      const dy = my - node.py;
      const dist = Math.hypot(dx, dy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestId = dist < 56 ? node.id : null;
      }
      const hover = nearestId === node.id ? 1 : 0;
      drawGlassOrb(ctx, node.px, node.py, 14, t, node.color, hover, node.orbit);
    }

    for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
      const r = ripplesRef.current[i];
      r.r += 2.8;
      r.a -= 0.016;
      if (r.a <= 0) ripplesRef.current.splice(i, 1);
      else {
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${roleAccent.join(",")}, ${r.a})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    if (mouseRef.current.active) {
      if (draw.lastMx !== mx || draw.lastMy !== my) {
        trailRef.current.push({ x: mx, y: my, life: 1, hue: t % 360 });
        if (trailRef.current.length > 24) trailRef.current.shift();
        draw.lastMx = mx;
        draw.lastMy = my;
      }

      for (let i = trailRef.current.length - 1; i >= 0; i--) {
        const tr = trailRef.current[i];
        tr.life -= 0.035;
        if (tr.life <= 0) trailRef.current.splice(i, 1);
        else {
          const tg = ctx.createRadialGradient(tr.x, tr.y, 0, tr.x, tr.y, 28 * tr.life);
          tg.addColorStop(0, `rgba(${roleAccent.join(",")}, ${tr.life * 0.28})`);
          tg.addColorStop(0.5, `rgba(13, 184, 240, ${tr.life * 0.06})`);
          tg.addColorStop(1, "transparent");
          ctx.fillStyle = tg;
          ctx.beginPath();
          ctx.arc(tr.x, tr.y, 28 * tr.life, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (let ring = 0; ring < 3; ring++) {
        const rr = 40 + ring * 28 + Math.sin(t * 0.05 + ring) * 12;
        ctx.beginPath();
        ctx.arc(mx, my, rr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${roleAccent.join(",")}, ${0.22 - ring * 0.06})`;
        ctx.lineWidth = 1.2 - ring * 0.2;
        ctx.stroke();
      }

      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, 140);
      mg.addColorStop(0, `rgba(${roleAccent.join(",")}, 0.12)`);
      mg.addColorStop(0.4, `rgba(${roleAccent.join(",")}, 0.05)`);
      mg.addColorStop(1, "transparent");
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(mx, my, 160, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = "source-over";
    } else {
      trailRef.current.length = 0;
    }

    if (nearestId !== draw.lastNearest) {
      draw.lastNearest = nearestId;
      setHoveredId(nearestId);
      onOrbHover?.(nearestId);
    }

    draw.t += 1;
    animRef.current = requestAnimationFrame(drawRef.current);
  }, [activeRole, onOrbHover, roleAccent]);

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

  const onPointerMove = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mouseRef.current = { x, y, active: true };
    wrapRef.current?.classList.add("login-liquid-wrap--hover");
    if (wrapRef.current) {
      wrapRef.current.style.setProperty("--cursor-x", `${(x / rect.width) * 100}%`);
      wrapRef.current.style.setProperty("--cursor-y", `${(y / rect.height) * 100}%`);
    }
  };

  const onPointerLeave = () => {
    mouseRef.current.active = false;
    setHoveredId(null);
    onOrbHover?.(null);
    if (wrapRef.current) {
      wrapRef.current.classList.remove("login-liquid-wrap--hover");
    }
  };

  const onClick = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    for (let i = 0; i < 3; i++) {
      ripplesRef.current.push({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        r: 6 + i * 8,
        a: 0.5 - i * 0.12,
      });
    }
  };

  return (
    <div ref={wrapRef} className="login-liquid-wrap" style={style}>
      <canvas
        ref={canvasRef}
        className="login-liquid-canvas"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
      />

      {AI_ORBS.map((orb) => {
        const inBrandZone =
          orb.x >= BRAND_SAFE.xMin &&
          orb.x <= BRAND_SAFE.xMax &&
          orb.y >= BRAND_SAFE.yMin &&
          orb.y <= BRAND_SAFE.yMax;
        if (inBrandZone) return null;

        const isHot = hoveredId === orb.id;
        return (
          <div
            key={orb.id}
            className={`login-orb-label ${isHot ? "active" : ""}`}
            style={{
              left: `${orb.x * 100}%`,
              top: `${orb.y * 100}%`,
              "--orb-color": orb.color,
            }}
            aria-hidden
          >
            <span className="login-orb-label-dot" />
            <span className="login-orb-label-text">{orb.label}</span>
          </div>
        );
      })}

    </div>
  );
}
