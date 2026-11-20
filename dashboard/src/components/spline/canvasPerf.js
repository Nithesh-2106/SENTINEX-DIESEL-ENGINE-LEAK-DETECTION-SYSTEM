import { useCallback, useEffect, useRef } from "react";

/** Cap canvas backing-store resolution for smoother compositing on retina displays. */
export function getDpr() {
  return Math.min(window.devicePixelRatio || 1, 1.25);
}

export function setupCanvasSize(canvas, ctx) {
  const dpr = getDpr();
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  if (w < 1 || h < 1) return { w: 0, h: 0 };
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}

/** Returns true when a new frame should be drawn at the target FPS. */
export function createFpsGate(targetFps = 30) {
  let last = 0;
  const interval = 1000 / targetFps;
  return () => {
    const now = performance.now();
    if (now - last < interval) return false;
    last = now;
    return true;
  };
}

/** Schedule rAF only when callback is a real function — avoids render crashes. */
export function safeRaf(animRef, callback) {
  if (typeof callback !== "function") return;
  animRef.current = requestAnimationFrame(callback);
}

export function useCanvasVisibility(animRef, restartDraw) {
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      } else if (typeof restartDraw === "function") {
        safeRaf(animRef, restartDraw);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [animRef, restartDraw]);
}

export function usePanelVisibility(ref, onChange) {
  useEffect(() => {
    const el = ref?.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;

    const io = new IntersectionObserver(
      ([entry]) => onChange(entry.isIntersecting),
      { threshold: 0.05, rootMargin: "40px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, onChange]);
}

/**
 * Pause decorative canvas loops when inactive or off-screen.
 * Does NOT start the loop — the component's useEffect owns startup.
 */
export function useDecorativeCanvasLoop({
  animRef,
  drawRef,
  containerRef,
  active = true,
  targetFps = 30,
}) {
  const fpsGateRef = useRef(createFpsGate(targetFps));
  const intersectingRef = useRef(true);

  const schedule = useCallback(() => {
    if (!active || !intersectingRef.current || document.hidden) return;
    safeRaf(animRef, drawRef.current);
  }, [active, animRef, drawRef]);

  useEffect(() => {
    fpsGateRef.current = createFpsGate(targetFps);
  }, [targetFps]);

  useEffect(() => {
    if (!active) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  }, [active, animRef]);

  const onIntersect = useCallback((visible) => {
    intersectingRef.current = visible;
    if (!visible) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    } else if (active && !document.hidden) {
      schedule();
    }
  }, [active, animRef, schedule]);

  usePanelVisibility(containerRef, onIntersect);
  useCanvasVisibility(animRef, schedule);

  return fpsGateRef;
}

/**
 * Build a gated draw loop and keep drawRef in sync for visibility hooks.
 */
export function useGatedCanvasDraw({
  animRef,
  drawRef,
  drawFnRef,
  fpsGateRef,
  draw,
  active,
  deps = [],
}) {
  useEffect(() => {
    drawFnRef.current = draw;
    const gatedDraw = () => {
      if (!fpsGateRef.current()) {
        safeRaf(animRef, gatedDraw);
        return;
      }
      drawFnRef.current?.();
    };
    drawRef.current = gatedDraw;
    if (active) safeRaf(animRef, gatedDraw);

    return () => {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
      drawRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, draw, fpsGateRef, ...deps]);
}
