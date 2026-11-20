import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import Globe from "react-globe.gl";
import { INDIA_MAP_PINS } from "../../data/indiaStates.js";
import { CATERPILLAR_GLOBAL_NETWORK } from "../../constants/federatedFacilities.js";

const INDIA_POV = { lat: 20.5937, lng: 78.9629, altitude: 2.2 };

export default function SentinexGlobe({
  currentPhase = "idle",
  activeTransmissions = [],
  facilityStates = {},
  currentRound = 0,
  active = true,
  onIndiaClick,
  onFacilityClick,
}) {
  const globeRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ w: 500, h: 400 });
  const [arcs, setArcs] = useState([]);
  const [rotationActive, setRotationActive] = useState(false);
  const rotationRef = useRef(null);
  const tabVisibleRef = useRef(true);

  // World facilities — real Caterpillar centers outside India (correct coords).
  const worldPoints = useMemo(
    () =>
      CATERPILLAR_GLOBAL_NETWORK.filter((f) => f.country !== "India").map((f) => ({
        id: f.id,
        name: f.name,
        city: f.city,
        state: f.state,
        country: f.country,
        cellType: f.cellType,
        siteType: f.siteType,
        lat: f.coordinates.lat,
        lng: f.coordinates.lng,
        isIndia: false,
        pointColor: f.colour || "rgba(180,200,230,0.55)",
        pointSize: 0.32,
        pointAltitude: 0.006,
      })),
    [],
  );

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ w: Math.floor(width), h: Math.floor(height) });
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onVis = () => {
      tabVisibleRef.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Initial framing — face India.
  useEffect(() => {
    if (!globeRef.current) return;
    globeRef.current.pointOfView(INDIA_POV, 1200);
  }, []);

  // Continuous rotation while enabled.
  useEffect(() => {
    const ROTATION_SPEED = 0.32;
    function rotate() {
      if (rotationActive && active && tabVisibleRef.current && globeRef.current) {
        const pov = globeRef.current.pointOfView();
        globeRef.current.pointOfView({
          lat: pov.lat,
          lng: pov.lng + ROTATION_SPEED,
          altitude: pov.altitude,
        });
      }
      rotationRef.current = requestAnimationFrame(rotate);
    }
    rotationRef.current = requestAnimationFrame(rotate);
    return () => cancelAnimationFrame(rotationRef.current);
  }, [rotationActive, active]);

  const toggleRotation = useCallback(() => {
    setRotationActive((prev) => {
      const next = !prev;
      // When stopping, snap the globe back to face India for the user.
      if (!next && globeRef.current) {
        globeRef.current.pointOfView(INDIA_POV, 900);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (activeTransmissions.length === 0) {
      setArcs([]);
      return;
    }
    const serverPin = INDIA_MAP_PINS.find((p) => p.id === "fedavg_server");
    const newArcs = activeTransmissions
      .map((tx) => {
        const fromPin =
          tx.from === "fedavg_server" ? serverPin : INDIA_MAP_PINS.find((p) => p.id === tx.from);
        const toPin =
          tx.to === "fedavg_server" ? serverPin : INDIA_MAP_PINS.find((p) => p.id === tx.to);
        if (!fromPin || !toPin) return null;
        return {
          id: tx.id,
          startLat: fromPin.lat,
          startLng: fromPin.lng,
          endLat: toPin.lat,
          endLng: toPin.lng,
          color:
            tx.type === "weight"
              ? ["rgba(16,255,170,0.9)", "rgba(16,255,170,0.0)"]
              : ["rgba(240,165,0,0.9)", "rgba(240,165,0,0.0)"],
          dashLength: 0.5,
          dashGap: 0.3,
          dashAnimateTime: 1200,
          strokeWidth: 1.2,
        };
      })
      .filter(Boolean);
    setArcs(newArcs);
  }, [activeTransmissions]);

  const allPoints = useMemo(
    () => [
      ...INDIA_MAP_PINS.map((pin) => ({
        ...pin,
        pointSize: pin.type === "cloud_server" ? 1.1 : pin.isFlClient ? 0.9 : 0.75,
        pointColor: pin.colour,
        pointAltitude:
          pin.type === "cloud_server" ? 0.09 : pin.isFlClient ? 0.018 : 0.014,
        isIndia: true,
      })),
      ...worldPoints,
    ],
    [worldPoints],
  );

  const rings =
    currentPhase !== "idle"
      ? INDIA_MAP_PINS.filter((p) => p.type === "test_cell").map((pin) => ({
          lat: pin.lat,
          lng: pin.lng,
          maxR: 3.5,
          propagationSpeed: 2.5,
          repeatPeriod: 900,
          color: (t) => `rgba(${pin.colourRGB}, ${1 - t})`,
        }))
      : [];

  const getPointLabel = useCallback(
    (point) => {
      if (!point.isIndia) {
        return `
        <div style="background:rgba(6,10,18,0.96);border:1px solid rgba(180,200,230,0.35);border-radius:8px;padding:7px 11px;font-family:Inter,sans-serif;min-width:150px;pointer-events:none">
          <div style="font-size:7px;font-weight:700;letter-spacing:.09em;color:rgba(255,255,255,.32);margin-bottom:2px">CATERPILLAR · ${point.country}</div>
          <div style="font-size:12px;font-weight:700;color:#cfe0f5">${point.name}</div>
          <div style="font-size:9px;color:rgba(255,255,255,.5);margin-top:2px">${point.city}${point.state ? `, ${point.state}` : ""} · ${point.country}</div>
          <div style="font-size:8px;color:rgba(255,255,255,.32);margin-top:3px">${point.cellType || ""}</div>
        </div>`;
      }
      if (point.type === "cloud_server") {
        return `
        <div style="background:rgba(8,12,20,0.95);border:1px solid rgba(240,165,0,0.45);border-radius:8px;padding:8px 12px;font-family:Inter,sans-serif;min-width:170px;pointer-events:none">
          <div style="font-size:8px;font-weight:700;letter-spacing:.09em;color:rgba(255,255,255,.35);margin-bottom:3px">FEDAVG CLOUD SERVER</div>
          <div style="font-size:13px;font-weight:700;color:rgb(240,165,0)">${point.name}</div>
          <div style="font-size:9px;color:rgba(255,255,255,.5);margin-top:2px">${point.city}, ${point.state}</div>
          <div style="font-size:8px;color:rgba(240,165,0,.6);margin-top:4px">No raw sensor data stored</div>
        </div>`;
      }
      const fState = facilityStates[point.id];
      const f1Badge = fState?.localF1
        ? `<div style="margin-top:5px;border-top:1px solid rgba(255,255,255,.07);padding-top:5px">
          <span style="font-size:8px;color:rgba(255,255,255,.3)">Local F1 </span>
          <span style="font-size:12px;font-weight:700;color:rgb(10,255,170);font-family:JetBrains Mono,monospace">${(fState.localF1 * 100).toFixed(1)}%</span>
        </div>`
        : "";
      return `
      <div style="background:rgba(8,12,20,0.95);border:1px solid ${point.colour}44;border-radius:8px;padding:8px 12px;font-family:Inter,sans-serif;min-width:175px;pointer-events:none">
        <div style="font-size:8px;font-weight:700;letter-spacing:.09em;color:rgba(255,255,255,.32);margin-bottom:3px">${point.flRole} · CATERPILLAR INDIA</div>
        <div style="font-size:13px;font-weight:700;color:${point.colour}">${point.name}</div>
        <div style="font-size:9px;color:rgba(255,255,255,.5);margin-top:2px">${point.city}, ${point.state} · India</div>
        ${f1Badge}
      </div>`;
    },
    [facilityStates],
  );

  const handlePointClick = useCallback(
    (point) => {
      if (!point.isIndia) return;
      onFacilityClick?.(point.id);
    },
    [onFacilityClick],
  );

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        borderRadius: 12,
        background:
          "radial-gradient(ellipse at center, rgba(3,8,18,0.95) 0%, rgba(2,4,10,1) 100%)",
      }}
    >
      <Globe
        ref={globeRef}
        width={dimensions.w}
        height={dimensions.h}
        globeImageUrl="https://unpkg.com/three-globe/example/img/earth-night.jpg"
        bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundColor="rgba(0,0,0,0)"
        showAtmosphere
        atmosphereColor="rgba(13,184,240,0.18)"
        atmosphereAltitude={0.15}
        pointsData={allPoints}
        pointLat="lat"
        pointLng="lng"
        pointAltitude="pointAltitude"
        pointRadius="pointSize"
        pointColor="pointColor"
        pointLabel={getPointLabel}
        pointsMerge={false}
        onPointClick={handlePointClick}
        arcsData={arcs}
        arcStartLat="startLat"
        arcStartLng="startLng"
        arcEndLat="endLat"
        arcEndLng="endLng"
        arcColor="color"
        arcDashLength="dashLength"
        arcDashGap="dashGap"
        arcDashAnimateTime="dashAnimateTime"
        arcStroke="strokeWidth"
        arcAltitude={0.22}
        ringsData={rings}
        ringLat="lat"
        ringLng="lng"
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"
        ringColor="color"
        ringAltitude={0.005}
        enablePointerInteraction
      />

      <div className="fl-globe-controls">
        <button
          type="button"
          className={`fl-globe-ctrl-btn ${rotationActive ? "is-active" : ""}`}
          title={rotationActive ? "Stop rotation (face India)" : "Rotate globe"}
          aria-label={rotationActive ? "Stop rotation" : "Rotate globe"}
          onClick={toggleRotation}
        >
          {rotationActive ? (
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
          title="Zoom into India map"
          aria-label="Zoom into India map"
          onClick={() => {
            setRotationActive(false);
            onIndiaClick?.();
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.75" />
            <path d="M15.5 15.5L21 21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            <circle cx="10.5" cy="10.5" r="2.5" fill="currentColor" opacity="0.35" />
          </svg>
        </button>
      </div>

      <div className="fl-globe-site-count">
        5 INDIA FL CELLS · {worldPoints.length} GLOBAL CAT CENTERS
      </div>

      {currentPhase !== "idle" && (
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            background: "rgba(8,12,20,0.90)",
            border: "1px solid rgba(13,184,240,.25)",
            borderRadius: 8,
            padding: "5px 12px",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#0DB8F0",
              animation: "fl-pulse-dot 0.8s ease-in-out infinite",
            }}
          />
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".07em", color: "#0DB8F0" }}>
            ROUND {currentRound} — {currentPhase.toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}
