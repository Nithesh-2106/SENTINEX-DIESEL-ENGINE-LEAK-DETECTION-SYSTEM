import { useEffect, useRef, useCallback } from "react";
import {
  setupCanvasSize,
  safeRaf,
  useDecorativeCanvasLoop,
  useGatedCanvasDraw,
} from "./canvasPerf.js";
import useThemeTokens from "../../hooks/useThemeTokens.js";

export default function DataStreamBg({
  colour,
  density = 0.4,
  style = {},
  active = true,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animRef = useRef(null);
  const drawRef = useRef(null);
  const drawFnRef = useRef(null);
  const columnsRef = useRef(null);
  const { tokensRef } = useThemeTokens();

  const CHARS = "01ABCDEFkPa°CMPRXY0123456789".split("");
  const FONT_SIZE = 11;

  const initColumns = useCallback((W, H) => {
    const colCount = Math.floor(W / (FONT_SIZE * 2.2));
    columnsRef.current = Array.from({ length: colCount }, (_, i) => ({
      x: i * FONT_SIZE * 2.2,
      y: Math.random() * -H,
      speed: 0.4 + Math.random() * 1.1,
      opacity: 0.04 + Math.random() * 0.06 * density,
      length: 4 + Math.floor(Math.random() * 8),
      chars: Array.from({ length: 12 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]),
      charTimer: 0,
      charInterval: 10 + Math.floor(Math.random() * 14),
    }));
  }, [density]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const streamColour = colour || tokensRef.current.streamColour;
    const { w: W, h: H } = setupCanvasSize(canvas, ctx);
    if (W < 1 || H < 1) {
      safeRaf(animRef, drawRef.current);
      return;
    }

    if (!columnsRef.current) {
      initColumns(W, H);
    }

    const columns = columnsRef.current;
    ctx.clearRect(0, 0, W, H);
    ctx.font = `${FONT_SIZE}px JetBrains Mono, monospace`;

    for (const col of columns) {
      col.y += col.speed;
      col.charTimer++;

      if (col.charTimer >= col.charInterval) {
        col.charTimer = 0;
        const idx = Math.floor(Math.random() * col.chars.length);
        col.chars[idx] = CHARS[Math.floor(Math.random() * CHARS.length)];
      }

      for (let i = 0; i < col.length; i++) {
        const cy = col.y - i * FONT_SIZE;
        if (cy < 0 || cy > H) continue;

        const alpha = col.opacity * (1 - i / col.length);
        const finalAlpha = i === 0 ? alpha * 3 : alpha;

        ctx.fillStyle = `rgba(${streamColour}, ${Math.min(0.5, finalAlpha)})`;
        ctx.fillText(col.chars[i % col.chars.length], col.x, cy);
      }

      if (col.y - col.length * FONT_SIZE > H) {
        col.y = -FONT_SIZE * col.length;
        col.speed = 0.4 + Math.random() * 1.1;
      }
    }

    safeRaf(animRef, drawRef.current);
  }, [colour, initColumns, tokensRef]);

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
    deps: [],
  });

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      columnsRef.current = null;
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
