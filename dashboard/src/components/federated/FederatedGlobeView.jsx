import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import Globe from "react-globe.gl";
import * as THREE from "three";
import { INDIA_MAP_PINS, COUNTRY_LABELS } from "../../data/indiaStates.js";
import { CATERPILLAR_GLOBAL_NETWORK } from "../../constants/federatedFacilities.js";
import { useContainedGestures } from "../../hooks/useContainedGestures.js";

const GLOBAL_POV = { lat: 22, lng: 10, altitude: 2.1 };
const INDIA_POV = { lat: 22.5, lng: 79.0, altitude: 1.35 };
const EARTH_TEXTURE = "/fl-globe/earth-night.jpg";

const coreGeo = new THREE.SphereGeometry(1, 10, 10);

function makeMarker(color, size = 1) {
  return new THREE.Mesh(
    coreGeo,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 }),
  );
}

export default function FederatedGlobeView({
  onFacilityClick,
  onZoomToIndia,
  paused = false,
}) {
  const globeRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ w: 500, h: 400 });
  const [rotationActive, setRotationActive] = useState(true);

  useContainedGestures(containerRef, !paused);

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ w: Math.floor(width), h: Math.floor(height) });
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!globeRef.current) return;
    globeRef.current.pointOfView(GLOBAL_POV, 0);
    const controls = globeRef.current.controls();
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 0.45;
    controls.enableZoom = true;
    controls.zoomSpeed = 0.55;
    controls.enablePan = false;
    controls.minDistance = 120;
    controls.maxDistance = 420;
  }, []);

  useEffect(() => {
    if (!globeRef.current) return;
    const controls = globeRef.current.controls();
    const shouldRotate = rotationActive && !paused;
    controls.autoRotate = shouldRotate;
    controls.autoRotateSpeed = -0.65;
  }, [rotationActive, paused]);

  const snapToIndia = useCallback(() => {
    globeRef.current?.pointOfView(INDIA_POV, 900);
  }, []);

  const toggleRotation = useCallback(() => {
    setRotationActive((prev) => {
      if (prev) snapToIndia();
      return !prev;
    });
  }, [snapToIndia]);

  const groundPins = useMemo(
    () => INDIA_MAP_PINS.filter((p) => p.type !== "cloud_server"),
    [],
  );

  const worldPoints = useMemo(
    () =>
      CATERPILLAR_GLOBAL_NETWORK.filter(
        (f) => f.country !== "India" && !f.isCloud,
      ).map((f) => ({
        id: f.id,
        name: f.name,
        city: f.city,
        state: f.state,
        country: f.country,
        cellType: f.cellType,
        lat: f.coordinates.lat,
        lng: f.coordinates.lng,
        isIndia: false,
        isFlClient: Boolean(f.isFlClient),
        markerColor: f.colour || "#8fa8c8",
        pointSize: f.isFlClient ? 0.34 : 0.28,
      })),
    [],
  );

  const indiaPoints = useMemo(
    () =>
      groundPins.map((pin) => ({
        ...pin,
        isIndia: true,
        markerColor: pin.colour,
        pointSize: 0.38,
      })),
    [groundPins],
  );

  const allPoints = useMemo(
    () => [...indiaPoints, ...worldPoints],
    [indiaPoints, worldPoints],
  );

  const labelsData = useMemo(
    () =>
      COUNTRY_LABELS.map((c) => ({
        ...c,
        color: "rgba(235,242,252,0.88)",
      })),
    [],
  );

  const pointThreeObject = useCallback((d) => {
    const col = d.markerColor || d.colour || "#8fa8c8";
    return makeMarker(col, d.pointSize);
  }, []);

  const getPointLabel = useCallback((point) => {
    const country = point.isIndia ? "India" : point.country || "Global";
    const specs = point.isFlClient
      ? [
          point.description,
          point.environment,
          point.altitude,
          point.trainRows != null
            ? `${point.trainRows.toLocaleString()} training rows`
            : null,
        ]
          .filter(Boolean)
          .map((line) => `<div class="fl-globe-tooltip__spec">${line}</div>`)
          .join("")
      : point.cellType
        ? `<div class="fl-globe-tooltip__type">${point.cellType}</div>`
        : "";

    return `
      <div class="fl-globe-tooltip liquid-glass-card">
        <div class="fl-globe-tooltip__eyebrow">${point.isFlClient ? `${point.flRole || "FL CLIENT"} · ` : ""}${country}</div>
        <div class="fl-globe-tooltip__title">${point.name}</div>
        <div class="fl-globe-tooltip__sub">${point.city || ""}${point.state ? ` · ${point.state}` : ""}</div>
        ${specs}
      </div>`;
  }, []);

  return (
    <div ref={containerRef} className="fl-unified-globe fl-map-surface">
      <Globe
        ref={globeRef}
        width={dimensions.w}
        height={dimensions.h}
        globeImageUrl={EARTH_TEXTURE}
        backgroundColor="rgba(0,0,0,0)"
        showAtmosphere={false}
        labelsData={labelsData}
        labelLat="lat"
        labelLng="lng"
        labelText="text"
        labelSize={(d) => (d.text === "INDIA" ? 2.6 : (d.size ?? 1.5) * 1.35)}
        labelColor="color"
        labelDotRadius={0}
        labelResolution={3}
        labelAltitude={0.004}
        pointsData={allPoints}
        pointLat="lat"
        pointLng="lng"
        pointAltitude={0.001}
        pointRadius="pointSize"
        pointThreeObject={pointThreeObject}
        pointThreeObjectExtend="pointSize"
        pointLabel={getPointLabel}
        onPointClick={(p) => p.isIndia && onFacilityClick?.(p.id)}
        enablePointerInteraction={!paused}
      />

      <div className="fl-globe-controls">
        <button
          type="button"
          className={`fl-globe-ctrl-btn ${rotationActive && !paused ? "is-active" : ""}`}
          title={rotationActive ? "Stop and face India" : "Resume rotation"}
          onClick={toggleRotation}
        >
          {rotationActive && !paused ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M21 12a9 9 0 1 1-2.64-6.36" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              <path d="M21 4v5h-5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <button
          type="button"
          className="fl-globe-ctrl-btn"
          title="Open India map"
          onClick={() => onZoomToIndia?.()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.75" />
            <path d="M15.5 15.5L21 21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="fl-globe-site-count">
        {`DRAG TO ROTATE · SCROLL TO ZOOM · ${worldPoints.length} GLOBAL · ${groundPins.length} FEDERATED`}
      </div>
    </div>
  );
}
