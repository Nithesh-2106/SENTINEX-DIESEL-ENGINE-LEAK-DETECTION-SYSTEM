import { useEffect, useRef } from "react";

/** Prevent browser/page zoom while interacting with map surfaces. */
export function useContainedGestures(containerRef, active = true) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !active) return undefined;

    const blockWheel = (e) => {
      e.preventDefault();
    };

    const blockGesture = (e) => {
      e.preventDefault();
    };

    el.addEventListener("wheel", blockWheel, { passive: false });
    el.addEventListener("gesturestart", blockGesture);
    el.addEventListener("gesturechange", blockGesture);
    el.addEventListener("gestureend", blockGesture);

    return () => {
      el.removeEventListener("wheel", blockWheel);
      el.removeEventListener("gesturestart", blockGesture);
      el.removeEventListener("gesturechange", blockGesture);
      el.removeEventListener("gestureend", blockGesture);
    };
  }, [containerRef, active]);
}
