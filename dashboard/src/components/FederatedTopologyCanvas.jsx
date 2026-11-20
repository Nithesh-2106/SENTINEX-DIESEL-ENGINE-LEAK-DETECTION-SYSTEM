import { useEffect, useRef } from "react";
import { setupCanvasSize } from "./spline/canvasPerf.js";
import useThemeTokens from "../hooks/useThemeTokens.js";

export default function FederatedTopologyCanvas({
  facilities = [],
  roundHistory = [],
  isRunning = false,
  currentPhase = "idle",
}) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const stateRef = useRef({ facilities, roundHistory, isRunning, currentPhase });
  const visibleRef = useRef(true);
  const { tokensRef } = useThemeTokens();

  useEffect(() => {
    stateRef.current = { facilities, roundHistory, isRunning, currentPhase };
  }, [facilities, roundHistory, isRunning, currentPhase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    let t = 0;

    const packets = [];
    const sparkles = [];

    function spawnPacket(fromNode, toNode, colour, label) {
      packets.push({
        fromX: fromNode.x,
        fromY: fromNode.y,
        toX: toNode.x,
        toY: toNode.y,
        progress: 0,
        speed: 0.008 + Math.random() * 0.004,
        colour,
        label,
        size: 4 + Math.random() * 2,
        trailLength: 0.3,
      });
    }

    function spawnSparkles(x, y, colour, count = 12) {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        sparkles.push({
          x,
          y,
          vx: Math.cos(angle) * (1 + Math.random() * 2),
          vy: Math.sin(angle) * (1 + Math.random() * 2),
          life: 1.0,
          decay: 0.02 + Math.random() * 0.02,
          size: 2 + Math.random() * 3,
          colour,
        });
      }
    }

    let nodes = null;
    let lastPhase = "idle";
    let phasePacketTimer = null;

    function resize() {
      setupCanvasSize(canvas, ctx);
      nodes = null;
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function getNodes(W, H) {
      const cx = W / 2;
      const cy = H / 2;
      const r = Math.min(W, H) * 0.32;

      const { facilities: facs } = stateRef.current;
      const T = tokensRef.current;
      const facilityColours = [
        T.cyanColour,
        T.okColour,
        T.violetColour,
      ];
      const facilityAngles = [
        -Math.PI / 2,
        -Math.PI / 2 + (Math.PI * 2) / 3,
        -Math.PI / 2 - (Math.PI * 2) / 3,
      ];

      const facilityNodes = facilityAngles.map((angle, i) => ({
        id: `facility_${i}`,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        colour: facilityColours[i],
        label: facs[i]?.facility || `Facility ${i + 1}`,
        sublabel: facs[i]?.city || "",
        f1: facs[i]?.local_test_f1 || 0,
        weight: facs[i]?.weight_pct || 33,
        radius: 22,
        type: "facility",
      }));

      const centerNode = {
        id: "fedavg",
        x: cx,
        y: cy,
        colour: "240, 165, 0",
        label: "Global",
        sublabel: "FedAvg",
        f1:
          stateRef.current.roundHistory.length > 0
            ? stateRef.current.roundHistory.at(-1)?.global_after?.leak_location_f1
            : null,
        radius: 28,
        type: "center",
      };

      return { facilityNodes, centerNode, cx, cy };
    }

    function handlePhaseChange(phase, nodeSet) {
      const { facilityNodes, centerNode } = nodeSet;
      clearTimeout(phasePacketTimer);

      if (phase === "transmitting") {
        facilityNodes.forEach((node, i) => {
          phasePacketTimer = setTimeout(() => {
            spawnPacket(node, centerNode, node.colour, "W");
            setTimeout(() => spawnPacket(node, centerNode, node.colour, "W"), 300);
            setTimeout(() => spawnPacket(node, centerNode, node.colour, "W"), 600);
          }, i * 200);
        });
      } else if (phase === "broadcasting") {
        facilityNodes.forEach((node, i) => {
          phasePacketTimer = setTimeout(() => {
            spawnPacket(centerNode, node, "240, 165, 0", "G");
            setTimeout(() => spawnPacket(centerNode, node, "240, 165, 0", "G"), 400);
          }, i * 150);
        });
      }
    }

    function draw() {
      const T = tokensRef.current;
      if (!visibleRef.current) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      const { w: W, h: H } = setupCanvasSize(canvas, ctx);
      ctx.clearRect(0, 0, W, H);

      if (!nodes || t % 30 === 0) {
        nodes = getNodes(W, H);
      }
      const { facilityNodes, centerNode } = nodes;
      const { currentPhase: phase } = stateRef.current;

      if (phase !== lastPhase) {
        handlePhaseChange(phase, nodes);
        lastPhase = phase;
      }

      const glowR = centerNode.radius * (2.5 + Math.sin(t * 0.03) * 0.3);
      const centerGlow = ctx.createRadialGradient(
        centerNode.x,
        centerNode.y,
        centerNode.radius,
        centerNode.x,
        centerNode.y,
        glowR * 2
      );
      centerGlow.addColorStop(0, "rgba(240, 165, 0, 0.10)");
      centerGlow.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(centerNode.x, centerNode.y, glowR * 2, 0, Math.PI * 2);
      ctx.fillStyle = centerGlow;
      ctx.fill();

      for (const node of facilityNodes) {
        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(centerNode.x, centerNode.y);

        const lineGrad = ctx.createLinearGradient(
          node.x,
          node.y,
          centerNode.x,
          centerNode.y
        );
        lineGrad.addColorStop(0, `rgba(${node.colour}, 0.15)`);
        lineGrad.addColorStop(1, "rgba(240, 165, 0, 0.15)");
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 0.8;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        const mx = (node.x + centerNode.x) / 2;
        const my = (node.y + centerNode.y) / 2;
        ctx.fillStyle = `rgba(${node.colour}, 0.4)`;
        ctx.font = "500 9px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${node.weight?.toFixed(1) || 33}%`, mx, my - 6);
      }

      for (let i = packets.length - 1; i >= 0; i--) {
        const pk = packets[i];
        pk.progress += pk.speed;

        if (pk.progress >= 1) {
          spawnSparkles(pk.toX, pk.toY, pk.colour, 10);
          packets.splice(i, 1);
          continue;
        }

        const px = pk.fromX + (pk.toX - pk.fromX) * pk.progress;
        const py = pk.fromY + (pk.toY - pk.fromY) * pk.progress;

        const trailStart = Math.max(0, pk.progress - pk.trailLength);
        const trailX = pk.fromX + (pk.toX - pk.fromX) * trailStart;
        const trailY = pk.fromY + (pk.toY - pk.fromY) * trailStart;
        const trailGrad = ctx.createLinearGradient(trailX, trailY, px, py);
        trailGrad.addColorStop(0, "transparent");
        trailGrad.addColorStop(0.6, `rgba(${pk.colour}, 0.15)`);
        trailGrad.addColorStop(1, `rgba(${pk.colour}, 0.6)`);
        ctx.beginPath();
        ctx.moveTo(trailX, trailY);
        ctx.lineTo(px, py);
        ctx.strokeStyle = trailGrad;
        ctx.lineWidth = pk.size * 0.4;
        ctx.stroke();

        const pkGlow = ctx.createRadialGradient(px, py, 0, px, py, pk.size * 3);
        pkGlow.addColorStop(0, `rgba(${pk.colour}, 0.4)`);
        pkGlow.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(px, py, pk.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = pkGlow;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py, pk.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${pk.colour}, 0.95)`;
        ctx.fill();

        if (pk.size > 4) {
          ctx.fillStyle = "rgba(0,0,0,0.8)";
          ctx.font = `700 ${pk.size * 1.1}px Inter, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(pk.label, px, py + pk.size * 0.4);
        }
      }

      for (let i = sparkles.length - 1; i >= 0; i--) {
        const sp = sparkles[i];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vy += 0.05;
        sp.vx *= 0.97;
        sp.life -= sp.decay;

        if (sp.life <= 0) {
          sparkles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(sp.x, sp.y);
        ctx.rotate(t * 0.1);
        ctx.beginPath();
        for (let s = 0; s < 4; s++) {
          const a = (s / 4) * Math.PI * 2;
          const inner = sp.size * 0.3;
          const outer = sp.size;
          ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
          ctx.lineTo(
            Math.cos(a + Math.PI / 4) * inner,
            Math.sin(a + Math.PI / 4) * inner
          );
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(${sp.colour}, ${sp.life})`;
        ctx.fill();
        ctx.restore();
      }

      for (const node of facilityNodes) {
        const pulse = 1 + Math.sin(t * 0.04 + facilityNodes.indexOf(node)) * 0.08;

        const nodeGlow = ctx.createRadialGradient(
          node.x,
          node.y,
          node.radius * 0.5,
          node.x,
          node.y,
          node.radius * 3 * pulse
        );
        nodeGlow.addColorStop(0, `rgba(${node.colour}, 0.18)`);
        nodeGlow.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * 3 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = nodeGlow;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${node.colour}, 0.10)`;
        ctx.strokeStyle = `rgba(${node.colour}, 0.70)`;
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${node.colour}, 0.9)`;
        ctx.fill();

        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(${node.colour}, 0.9)`;
        ctx.font = "600 11px Inter, sans-serif";
        ctx.fillText(node.label, node.x, node.y + node.radius + 16);

        ctx.fillStyle = T.labelDim;
        ctx.font = "400 9px Inter, sans-serif";
        ctx.fillText(node.sublabel, node.x, node.y + node.radius + 28);

        if (node.f1) {
          const f1Pct = `${(node.f1 * 100).toFixed(1)}%`;
          ctx.fillStyle = `rgba(${node.colour}, 0.7)`;
          ctx.font = "700 10px JetBrains Mono, monospace";
          ctx.fillText(f1Pct, node.x, node.y + node.radius + 40);
        }
      }

      const centerPulse = 1 + Math.sin(t * 0.05) * 0.1;

      const centerGlowFull = ctx.createRadialGradient(
        centerNode.x,
        centerNode.y,
        0,
        centerNode.x,
        centerNode.y,
        centerNode.radius * 4 * centerPulse
      );
      centerGlowFull.addColorStop(0, T.serverGlow);
      centerGlowFull.addColorStop(0.5, "rgba(240, 165, 0, 0.06)");
      centerGlowFull.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(
        centerNode.x,
        centerNode.y,
        centerNode.radius * 4 * centerPulse,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = centerGlowFull;
      ctx.fill();

      ctx.save();
      ctx.translate(centerNode.x, centerNode.y);
      ctx.rotate(t * 0.008);
      ctx.beginPath();
      ctx.arc(0, 0, centerNode.radius * 1.6, 0, Math.PI * 1.5);
      ctx.strokeStyle = "rgba(240, 165, 0, 0.25)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(centerNode.x, centerNode.y, centerNode.radius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(240, 165, 0, 0.12)";
      ctx.strokeStyle = "rgba(240, 165, 0, 0.75)";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(240, 165, 0, 0.9)";
      ctx.font = "700 12px Inter, sans-serif";
      ctx.fillText("FedAvg", centerNode.x, centerNode.y + 4);

      if (centerNode.f1) {
        ctx.fillStyle = `rgba(${T.okColour}, 0.8)`;
        ctx.font = "700 11px JetBrains Mono, monospace";
        ctx.fillText(
          `${(centerNode.f1 * 100).toFixed(1)}%`,
          centerNode.x,
          centerNode.y + centerNode.radius + 16
        );
        ctx.fillStyle = T.labelDim;
        ctx.font = "400 9px Inter, sans-serif";
        ctx.fillText("global F1", centerNode.x, centerNode.y + centerNode.radius + 28);
      }

      ctx.fillStyle = T.labelDim;
      ctx.font = "400 9px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "Raw sensor data never leaves each facility — weights only",
        W / 2,
        H - 12
      );

      t++;
      animRef.current = requestAnimationFrame(draw);
    }

    const idlePacketTimer = setInterval(() => {
      if (!nodes || !visibleRef.current) return;
      const { facilityNodes, centerNode } = nodes;
      const { currentPhase: phase } = stateRef.current;
      if (phase === "idle" || phase === "complete") {
        const randomFacility =
          facilityNodes[Math.floor(Math.random() * facilityNodes.length)];
        if (Math.random() > 0.5) {
          spawnPacket(randomFacility, centerNode, randomFacility.colour, "·");
        } else {
          spawnPacket(centerNode, randomFacility, "240, 165, 0", "·");
        }
      }
    }, 2000);

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      clearInterval(idlePacketTimer);
      clearTimeout(phasePacketTimer);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    const onVis = () => {
      visibleRef.current = !document.hidden;
      if (!document.hidden && canvasRef.current) {
        animRef.current = requestAnimationFrame(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
      }}
    />
  );
}
