import { useRef, useState, useEffect, lazy, Suspense } from "react";

const Spline = lazy(() => import("@splinetool/react-spline"));

export default function SplineSlot({
  sceneUrl,
  fallback,
  onSplineLoad,
  style = {},
  className = "",
  pointerEvents = false,
}) {
  const [splineReady, setSplineReady] = useState(false);
  const [splineError, setSplineError] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const splineRef = useRef(null);

  useEffect(() => {
    if (!sceneUrl) return undefined;
    const timer = setTimeout(() => setTimedOut(true), 4000);
    return () => clearTimeout(timer);
  }, [sceneUrl]);

  const handleLoad = (splineApp) => {
    splineRef.current = splineApp;
    setSplineReady(true);
    if (onSplineLoad) onSplineLoad(splineApp);
  };

  const handleError = () => {
    setSplineError(true);
  };

  const showFallback = !sceneUrl || splineError || timedOut;

  return (
    <div
      className={`spline-slot ${className}`}
      style={{
        position: "relative",
        overflow: "hidden",
        pointerEvents: pointerEvents ? "auto" : "none",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: showFallback || !splineReady ? 1 : 0,
          transition: "opacity 1s ease",
        }}
      >
        {fallback}
      </div>

      {sceneUrl && !splineError && !timedOut && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: splineReady ? 1 : 0,
            transition: "opacity 1.5s ease",
          }}
        >
          <Suspense fallback={null}>
            <Spline
              scene={sceneUrl}
              onLoad={handleLoad}
              onError={handleError}
              style={{ width: "100%", height: "100%" }}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}

export function useSpline() {
  return useRef(null);
}
