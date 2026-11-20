import { useEffect, useRef, useCallback } from "react";
import { setupCanvasSize, useCanvasVisibility } from "./canvasPerf.js";
import useThemeTokens from "../../hooks/useThemeTokens.js";

export default function FederatedOrbits({
  isRunning = false,
  roundNumber = 0,
  style = {},
  active = true,
}) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const drawRef = useRef(null);
  const propsRef = useRef({ isRunning, roundNumber });
  const transmissionsRef = useRef([]);
  const lastRoundRef = useRef(0);
  const tRef = useRef(0);
  const frameSkipRef = useRef(0);
  const { tokensRef } = useThemeTokens();

  useEffect(() => {
    propsRef.current = { isRunning, roundNumber };
  }, [isRunning, roundNumber]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!active) {
      frameSkipRef.current += 1;
      if (frameSkipRef.current % 3 !== 0) {
        animRef.current = requestAnimationFrame(drawRef.current);
        return;
      }
    } else {
      frameSkipRef.current = 0;
    }

    const CLIENTS = [
      { label: "Hosur Cell 1", colour: tokensRef.current.cyanColour, angleOffset: 0 },
      { label: "Hosur Cell 2", colour: tokensRef.current.okColour, angleOffset: (Math.PI * 2) / 3 },
      { label: "Pune Cell", colour: tokensRef.current.violetColour, angleOffset: (Math.PI * 4) / 3 },
    ];

    const T = tokensRef.current;

    const { w: W, h: H } = setupCanvasSize(canvas, ctx);
    const cx = W / 2;
    const cy = H / 2;
    const orbitR = Math.min(W, H) * 0.35;
    const { isRunning: running, roundNumber: round } = propsRef.current;
    const t = tRef.current;
    const transmissions = transmissionsRef.current;

    ctx.clearRect(0, 0, W, H);

    ctx.beginPath();
    ctx.arc(cx, cy, orbitR, 0, Math.PI * 2);
    ctx.strokeStyle = T.edgeLine;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([4, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    const speed = running ? 0.0003 : 0.00008;
    const clientNodes = CLIENTS.map((c) => {
      const angle = t * speed + c.angleOffset;
      return {
        ...c,
        x: cx + Math.cos(angle) * orbitR,
        y: cy + Math.sin(angle) * orbitR,
      };
    });

    if (running && round !== lastRoundRef.current) {
      lastRoundRef.current = round;
      for (const node of clientNodes) {
        setTimeout(() => {
          transmissionsRef.current.push({
            fromX: node.x,
            fromY: node.y,
            progress: 0,
            colour: node.colour,
            going: true,
          });
        }, Math.random() * 500);
      }
      setTimeout(() => {
        for (const node of clientNodes) {
          setTimeout(() => {
            transmissionsRef.current.push({
              fromX: node.x,
              fromY: node.y,
              progress: 0,
              colour: node.colour,
              going: false,
            });
          }, Math.random() * 300);
        }
      }, 1500);
    }

    for (let i = transmissions.length - 1; i >= 0; i--) {
      const tx = transmissions[i];
      tx.progress += 0.012;

      const startX = tx.going ? tx.fromX : cx;
      const startY = tx.going ? tx.fromY : cy;
      const endX = tx.going ? cx : tx.fromX;
      const endY = tx.going ? cy : tx.fromY;

      const px = startX + (endX - startX) * tx.progress;
      const py = startY + (endY - startY) * tx.progress;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(px, py);
      const trailGrad = ctx.createLinearGradient(startX, startY, px, py);
      trailGrad.addColorStop(0, "transparent");
      trailGrad.addColorStop(1, `rgba(${tx.colour}, 0.4)`);
      ctx.strokeStyle = trailGrad;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${tx.colour}, 0.9)`;
      ctx.fill();

      if (tx.progress >= 1) transmissions.splice(i, 1);
    }

    for (const node of clientNodes) {
      ctx.beginPath();
      ctx.moveTo(node.x, node.y);
      ctx.lineTo(cx, cy);
      ctx.strokeStyle = `rgba(${node.colour}, 0.06)`;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }

    for (const node of clientNodes) {
      const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, 20);
      glow.addColorStop(0, `rgba(${node.colour}, 0.25)`);
      glow.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(node.x, node.y, 20, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(node.x, node.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${node.colour}, 0.15)`;
      ctx.strokeStyle = `rgba(${node.colour}, 0.6)`;
      ctx.lineWidth = 1.2;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = `rgba(${node.colour}, 0.7)`;
      ctx.font = `600 ${Math.max(9, W * 0.012)}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(node.label, node.x, node.y + 24);
    }

    const centralR = running ? 18 + Math.sin(t * 0.05) * 3 : 16;
    const centralGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, centralR * 3);
    centralGlow.addColorStop(0, T.serverGlow);
    centralGlow.addColorStop(0.4, `rgba(${T.violetColour}, 0.10)`);
    centralGlow.addColorStop(1, "transparent");
    ctx.beginPath();
    ctx.arc(cx, cy, centralR * 3, 0, Math.PI * 2);
    ctx.fillStyle = centralGlow;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, centralR, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${T.cyanColour}, 0.12)`;
    ctx.strokeStyle = running
      ? `rgba(${T.okColour}, ${0.6 + Math.sin(t * 0.1) * 0.3})`
      : `rgba(${T.cyanColour}, 0.5)`;
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = T.labelColour;
    ctx.font = `700 ${Math.max(9, W * 0.011)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("FedAvg", cx, cy + 3);
    ctx.fillText("Global", cx, cy - 7);

    tRef.current += 1;
    animRef.current = requestAnimationFrame(drawRef.current);
  }, [active, tokensRef]);

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
      style={{ width: "100%", height: "100%", display: "block", ...style }}
    />
  );
}
