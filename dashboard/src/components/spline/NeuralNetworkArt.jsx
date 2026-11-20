import { useEffect, useRef, useCallback } from "react";
import { setupCanvasSize, useCanvasVisibility } from "./canvasPerf.js";
import useThemeTokens from "../../hooks/useThemeTokens.js";

export default function NeuralNetworkArt({ style = {}, active = true, compact = false }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const drawRef = useRef(null);
  const frameSkipRef = useRef(0);
  const networkRef = useRef({ nodes: [], edges: [] });
  const pulseTimerRef = useRef(null);
  const { tokensRef } = useThemeTokens();

  const buildNetwork = useCallback((W, H) => {
    const LAYERS = compact ? [3, 5, 5, 2] : [4, 6, 6, 3];
    const nodes = [];
    const edges = [];
    const padX = compact ? 20 : 28;
    const padY = compact ? 6 : 12;
    const innerW = Math.max(60, W - padX * 2);
    const innerH = Math.max(24, H - padY * 2);
    const netW = compact ? Math.min(innerW, Math.max(280, W * 0.42)) : innerW;
    const netOffsetX = padX + (innerW - netW) / 2;
    const layerGap = netW / (LAYERS.length + 1);
    const margin = Math.max(compact ? 4 : 8, innerH * (compact ? 0.08 : 0.12));

    LAYERS.forEach((count, li) => {
      const x = netOffsetX + layerGap * (li + 1);
      const nodeGap = (innerH - margin * 2) / (count - 1 || 1);
      for (let ni = 0; ni < count; ni++) {
        nodes.push({
          x,
          y: count === 1 ? padY + innerH / 2 : padY + margin + nodeGap * ni,
          layer: li,
          index: ni,
          pulse: 0,
        });
      }
    });

    for (const a of nodes) {
      for (const b of nodes) {
        if (b.layer === a.layer + 1) {
          edges.push({
            from: a,
            to: b,
            pulsePos: Math.random(),
            pulseSpeed: 0.004 + Math.random() * 0.004,
            pulseActive: false,
            pulseProgress: 0,
          });
        }
      }
    }

    networkRef.current = { nodes, edges };

    function propagatePulse(node, intensity) {
      node.pulse = intensity;
      setTimeout(() => {
        node.pulse = 0;
      }, 300);

      const outEdges = edges.filter((e) => e.from === node);
      for (const edge of outEdges) {
        setTimeout(() => {
          edge.pulseActive = true;
          edge.pulseProgress = 0;
          const nextNode = edge.to;
          const travelTime = 500 + Math.random() * 300;
          setTimeout(() => {
            edge.pulseActive = false;
            propagatePulse(nextNode, intensity * (0.7 + Math.random() * 0.3));
          }, travelTime);
        }, Math.random() * 100);
      }
    }

    function spawnPulse() {
      const inputNodes = nodes.filter((n) => n.layer === 0);
      if (inputNodes.length === 0) return;
      const start = inputNodes[Math.floor(Math.random() * inputNodes.length)];
      propagatePulse(start, 1.0);
    }

    if (pulseTimerRef.current) clearInterval(pulseTimerRef.current);
    pulseTimerRef.current = setInterval(spawnPulse, 1500);
  }, [compact]);

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

    const { w: W, h: H } = setupCanvasSize(canvas, ctx);
    const { nodes, edges } = networkRef.current;
    const T = tokensRef.current;

    if (nodes.length === 0) {
      buildNetwork(W, H);
    }

    ctx.clearRect(0, 0, W, H);

    for (const edge of edges) {
      if (edge.pulseActive) {
        edge.pulseProgress += edge.pulseSpeed * 2;
        if (edge.pulseProgress > 1) edge.pulseProgress = 1;
      }
    }

    for (const edge of edges) {
      ctx.beginPath();
      ctx.moveTo(edge.from.x, edge.from.y);
      ctx.lineTo(edge.to.x, edge.to.y);
      ctx.strokeStyle = edge.pulseActive
        ? `rgba(${T.cyanColour}, 0.15)`
        : T.edgeColour;
      ctx.lineWidth = 0.6;
      ctx.stroke();

      if (edge.pulseActive && edge.pulseProgress < 1) {
        const px = edge.from.x + (edge.to.x - edge.from.x) * edge.pulseProgress;
        const py = edge.from.y + (edge.to.y - edge.from.y) * edge.pulseProgress;

        const grad = ctx.createLinearGradient(
          edge.from.x + (edge.to.x - edge.from.x) * Math.max(0, edge.pulseProgress - 0.2),
          edge.from.y + (edge.to.y - edge.from.y) * Math.max(0, edge.pulseProgress - 0.2),
          px,
          py
        );
        grad.addColorStop(0, "transparent");
        grad.addColorStop(1, `rgba(${T.cyanColour}, 0.5)`);
        ctx.beginPath();
        ctx.moveTo(
          edge.from.x + (edge.to.x - edge.from.x) * Math.max(0, edge.pulseProgress - 0.2),
          edge.from.y + (edge.to.y - edge.from.y) * Math.max(0, edge.pulseProgress - 0.2)
        );
        ctx.lineTo(px, py);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${T.cyanColour}, 0.9)`;
        ctx.fill();
      }
    }

    for (const node of nodes) {
      const isActive = node.pulse > 0.1;
      const r = isActive ? (compact ? 3.5 : 5) : compact ? 2.5 : 4;
      const alpha = isActive ? 0.9 : 0.4;

      if (isActive) {
        const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, r * 4);
        glow.addColorStop(0, `rgba(${T.pulseColour}, ${node.pulse * 0.5})`);
        glow.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(node.x, node.y, r * 4, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = isActive
        ? `rgba(${T.pulseColour}, ${alpha})`
        : `rgba(${T.nodeColour}, ${alpha})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(node.x, node.y, r - 1, 0, Math.PI * 2);
      ctx.fillStyle = isActive
        ? `rgba(${T.pulseColour}, ${node.pulse * 0.6})`
        : `rgba(${T.nodeColour}, 0.08)`;
      ctx.fill();

      if (node.pulse > 0) node.pulse *= 0.95;
    }

    animRef.current = requestAnimationFrame(drawRef.current);
  }, [active, buildNetwork, compact, tokensRef]);

  useEffect(() => {
    drawRef.current = draw;
    animRef.current = requestAnimationFrame(draw);

    const ro = new ResizeObserver(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      buildNetwork(canvas.offsetWidth, canvas.offsetHeight);
      cancelAnimationFrame(animRef.current);
      animRef.current = requestAnimationFrame(drawRef.current);
    });
    if (canvasRef.current) ro.observe(canvasRef.current);

    return () => {
      cancelAnimationFrame(animRef.current);
      clearInterval(pulseTimerRef.current);
      ro.disconnect();
    };
  }, [draw, buildNetwork]);

  useCanvasVisibility(animRef, () => drawRef.current && requestAnimationFrame(drawRef.current));

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block", ...style }}
    />
  );
}
