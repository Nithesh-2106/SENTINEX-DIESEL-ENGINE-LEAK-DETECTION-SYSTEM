import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import Globe from "react-globe.gl";
import { INDIA_MAP_PINS, INDIA_GEOJSON_URL, CAT_STATES } from "../../data/indiaStates.js";

function stateNameFromProps(props = {}) {
  return props.ST_NM || props.NAME_1 || props.st_nm || props.name || "";
}

export default function IndiaGlobe3D({
  visible = false,
  currentPhase = "idle",
  activeTransmissions = [],
  facilityStates = {},
  currentRound = 0,
  onBack,
  onFacilityClick,
}) {
  const globeRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ w: 500, h: 400 });
  const [statePolygons, setStatePolygons] = useState([]);
  const [arcs, setArcs] = useState([]);

  const serverPin = useMemo(
    () => INDIA_MAP_PINS.find((p) => p.id === "fedavg_server"),
    [],
  );

  const groundPins = useMemo(
    () => INDIA_MAP_PINS.filter((p) => p.type !== "cloud_server"),
    [],
  );

  const globePoints = useMemo(
    () =>
      INDIA_MAP_PINS.map((pin) => ({
        ...pin,
        pointSize: pin.type === "cloud_server" ? 1.6 : pin.isFlClient ? 0.9 : 0.7,
        pointColor: pin.colour,
        pointAltitude:
          pin.type === "cloud_server" ? 0.16 : pin.isFlClient ? 0.022 : 0.018,
      })),
    [],
  );

  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    fetch(INDIA_GEOJSON_URL)
      .then((r) => r.json())
      .then((geo) => {
        if (cancelled) return;
        const features = Array.isArray(geo?.features) ? geo.features : [];
        setStatePolygons(features);
      })
      .catch(() => {
        if (!cancelled) setStatePolygons([]);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ w: Math.floor(width), h: Math.floor(height) });
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !globeRef.current) return undefined;
    globeRef.current.pointOfView({ lat: 21.5, lng: 79.0, altitude: 0.42 }, 1200);
    return undefined;
  }, [visible]);

  useEffect(() => {
    if (!serverPin) return;

    const staticLinks = groundPins.map((pin) => ({
      id: `link-${pin.id}`,
      startLat: pin.lat,
      startLng: pin.lng,
      endLat: serverPin.lat,
      endLng: serverPin.lng,
      color: [`rgba(${pin.colourRGB}, 0.22)`, `rgba(240,165,0,0.08)`],
      strokeWidth: pin.isFlClient ? 0.9 : 0.5,
      dashLength: 0.55,
      dashGap: 0.45,
      dashAnimateTime: 0,
    }));

    const txArcs = activeTransmissions
      .map((tx) => {
        const fromPin =
          tx.from === "fedavg_server"
            ? serverPin
            : INDIA_MAP_PINS.find((p) => p.id === tx.from);
        const toPin =
          tx.to === "fedavg_server" ? serverPin : INDIA_MAP_PINS.find((p) => p.id === tx.to);
        if (!fromPin || !toPin) return null;
        const isGlobal = tx.type === "global";
        return {
          id: tx.id,
          startLat: fromPin.lat,
          startLng: fromPin.lng,
          endLat: toPin.lat,
          endLng: toPin.lng,
          color: isGlobal
            ? ["rgba(240,165,0,0.95)", "rgba(13,184,240,0.15)"]
            : [`rgba(${fromPin.colourRGB}, 0.95)`, "rgba(240,165,0,0.2)"],
          strokeWidth: 1.8,
          dashLength: 0.45,
          dashGap: 0.25,
          dashAnimateTime: isGlobal ? 1400 : 1100,
        };
      })
      .filter(Boolean);

    setArcs([...staticLinks, ...txArcs]);
  }, [activeTransmissions, groundPins, serverPin]);

  const getPointLabel = useCallback(
    (point) => {
      const fState = facilityStates[point.id];
      const f1Line = fState?.localF1
        ? `<div style="font-size:9px;color:#10FFAA;margin-top:4px">F1 ${(fState.localF1 * 100).toFixed(1)}%</div>`
        : "";
      const roleLine =
        point.type === "cloud_server"
          ? "AWS ap-south-1 · virtual cloud"
          : point.flRole;
      return `
        <div style="background:rgba(6,10,18,0.96);border:1px solid ${point.colour}55;border-radius:8px;padding:8px 10px;font-family:Inter,sans-serif;pointer-events:none;min-width:120px">
          <div style="font-size:7px;font-weight:700;letter-spacing:.08em;color:rgba(255,255,255,.35)">${roleLine}</div>
          <div style="font-size:12px;font-weight:700;color:${point.colour}">${point.city}</div>
          ${f1Line}
        </div>`;
    },
    [facilityStates],
  );

  if (!visible) return null;

  return (
    <div ref={containerRef} className="fl-india-globe3d">
      <Globe
        ref={globeRef}
        width={dimensions.w}
        height={dimensions.h}
        globeImageUrl="https://unpkg.com/three-globe/example/img/earth-night.jpg"
        bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundColor="rgba(0,0,0,0)"
        showAtmosphere
        atmosphereColor="rgba(13,184,240,0.14)"
        atmosphereAltitude={0.12}
        polygonsData={statePolygons}
        polygonGeoJsonGeometry={(d) => d.geometry}
        polygonCapColor={(d) => {
          const name = stateNameFromProps(d.properties);
          const cat = CAT_STATES[name];
          return cat ? `${cat.colour}55` : "rgba(35,55,85,0.45)";
        }}
        polygonSideColor={() => "rgba(13,184,240,0.12)"}
        polygonStrokeColor={(d) => {
          const name = stateNameFromProps(d.properties);
          return CAT_STATES[name] ? CAT_STATES[name].colour : "rgba(80,120,160,0.35)";
        }}
        polygonAltitude={0.006}
        pointsData={globePoints}
        pointLat="lat"
        pointLng="lng"
        pointAltitude="pointAltitude"
        pointRadius="pointSize"
        pointColor="pointColor"
        pointLabel={getPointLabel}
        onPointClick={(p) => onFacilityClick?.(p.id)}
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
        arcAltitude={0.14}
        enablePointerInteraction
      />

      <button type="button" className="fl-india-back-btn" onClick={onBack}>
        ← Globe
      </button>

      <div className="fl-india-globe3d__legend">
        <span className="fl-india-globe3d__legend-title">INDIA 3D · FEDERATED NETWORK</span>
        <span className="fl-india-globe3d__legend-sub">
          ☁ FedAvg elevated · 5 FL test cells · bidirectional weight flow
        </span>
      </div>

      {currentPhase !== "idle" && (
        <div className="fl-india-globe3d__phase">
          <span className="fl-india-globe3d__phase-dot" />
          ROUND {currentRound} — {currentPhase.toUpperCase()}
        </div>
      )}
    </div>
  );
}
