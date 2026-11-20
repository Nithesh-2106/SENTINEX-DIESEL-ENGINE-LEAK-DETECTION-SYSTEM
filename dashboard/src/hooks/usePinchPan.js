import { useCallback, useRef } from "react";

/**
 * Pan + pinch/wheel zoom for map surfaces.
 * Returns handlers and a ref whose transform is updated imperatively.
 */
export function usePinchPan({ minScale = 1, maxScale = 3, onGestureStart } = {}) {
  const surfaceRef = useRef(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const pointersRef = useRef(new Map());
  const panRef = useRef(null);
  const pinchRef = useRef(null);

  const clamp = (k) => Math.min(maxScale, Math.max(minScale, k));

  const apply = useCallback(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const { x, y, k } = transformRef.current;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${k})`;
  }, []);

  const reset = useCallback(() => {
    transformRef.current = { x: 0, y: 0, k: 1 };
    apply();
  }, [apply]);

  const onWheel = useCallback(
    (e) => {
      e.preventDefault();
      onGestureStart?.();
      const el = surfaceRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      const t = transformRef.current;
      const nextK = clamp(t.k * factor);
      const ratio = nextK / t.k;
      transformRef.current = {
        k: nextK,
        x: cx - (cx - t.x) * ratio,
        y: cy - (cy - t.y) * ratio,
      };
      apply();
    },
    [apply, clamp, onGestureStart],
  );

  const onPointerDown = useCallback(
    (e) => {
      if (e.button !== 0 && e.pointerType !== "touch") return;
      onGestureStart?.();
      const el = surfaceRef.current;
      if (!el) return;
      el.setPointerCapture(e.pointerId);
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointersRef.current.size === 1) {
        panRef.current = { ...transformRef.current, px: e.clientX, py: e.clientY };
      } else if (pointersRef.current.size === 2) {
        const pts = [...pointersRef.current.values()];
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        pinchRef.current = { dist, ...transformRef.current };
      }
    },
    [onGestureStart],
  );

  const onPointerMove = useCallback(
    (e) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointersRef.current.size === 1 && panRef.current) {
        const dx = e.clientX - panRef.current.px;
        const dy = e.clientY - panRef.current.py;
        transformRef.current = {
          k: panRef.current.k,
          x: panRef.current.x + dx,
          y: panRef.current.y + dy,
        };
        panRef.current = { ...transformRef.current, px: e.clientX, py: e.clientY };
        apply();
      } else if (pointersRef.current.size === 2 && pinchRef.current) {
        const pts = [...pointersRef.current.values()];
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const ratio = dist / pinchRef.current.dist;
        const nextK = clamp(pinchRef.current.k * ratio);
        transformRef.current = { ...transformRef.current, k: nextK };
        apply();
      }
    },
    [apply, clamp],
  );

  const onPointerUp = useCallback(
    (e) => {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size === 0) {
        panRef.current = null;
        pinchRef.current = null;
      } else if (pointersRef.current.size === 1) {
        pinchRef.current = null;
        const [pt] = pointersRef.current.values();
        panRef.current = { ...transformRef.current, px: pt.x, py: pt.y };
      }
      try {
        surfaceRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [],
  );

  return {
    surfaceRef,
    transformRef,
    reset,
    handlers: {
      onWheel,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
