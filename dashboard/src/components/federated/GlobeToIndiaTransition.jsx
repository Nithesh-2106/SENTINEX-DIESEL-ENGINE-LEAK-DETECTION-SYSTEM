import { useState, useEffect, lazy, Suspense } from "react";
import { prefetchIndiaGeo } from "../../utils/indiaGeoCache.js";

const FederatedGlobeView = lazy(() => import("./FederatedGlobeView.jsx"));
const IndiaMapView = lazy(() => import("./IndiaMapView.jsx"));

export default function GlobeToIndiaTransition(props) {
  const [view, setView] = useState("globe");
  const { onViewChange } = props;

  useEffect(() => {
    prefetchIndiaGeo().catch(() => {});
  }, []);

  useEffect(() => {
    onViewChange?.(view);
  }, [onViewChange, view]);

  const isIndia = view === "india";

  return (
    <div className="fl-globe-transition fl-map-surface">
      <div
        className={`fl-globe-transition__layer fl-globe-transition__layer--globe${isIndia ? " is-inactive" : " is-active"}`}
        aria-hidden={isIndia}
      >
        <Suspense fallback={<div className="fl-globe-loading">Loading globe…</div>}>
          <FederatedGlobeView
            {...props}
            paused={isIndia}
            onZoomToIndia={() => setView("india")}
          />
        </Suspense>
      </div>

      <div
        className={`fl-globe-transition__layer fl-globe-transition__layer--india${isIndia ? " is-active" : " is-prerendered"}`}
        aria-hidden={!isIndia}
      >
        <Suspense fallback={<div className="fl-globe-loading">Loading India map…</div>}>
          <IndiaMapView
            {...props}
            active={isIndia}
            onBack={() => setView("globe")}
          />
        </Suspense>
      </div>
    </div>
  );
}
