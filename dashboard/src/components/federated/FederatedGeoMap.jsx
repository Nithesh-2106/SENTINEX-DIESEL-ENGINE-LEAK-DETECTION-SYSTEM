import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import Globe from "react-globe.gl";
import {
  CATERPILLAR_GLOBAL_NETWORK,
  CATERPILLAR_FACILITIES,
  FL_CLIENT_LIST,
  AGGREGATION_SERVER,
  sitesInCountry,
  statesInCountry,
} from "../../constants/federatedFacilities";
import {
  COUNTRY_REGIONS,
  GLOBE_TEXTURES,
  GLOBAL_VIEW,
} from "../../constants/federatedGeoNav";
import IndiaCountryMap from "./IndiaCountryMap.jsx";

function formatCoords(lat, lng) {
  const latH = lat >= 0 ? "N" : "S";
  const lngH = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${latH}, ${Math.abs(lng).toFixed(4)}°${lngH}`;
}

const SITE_TYPE_LABELS = {
  test_cell: "Engine Test Cell",
  prototype_lab: "Prototype Lab",
  aggregation_server: "FL Cloud Server",
  technical_center: "Technical Center",
  proving_ground: "Proving Ground",
  manufacturing: "Manufacturing Plant",
  demonstration: "Demo & Learning Center",
};

function getCountryName(feat) {
  return (
    feat?.properties?.NAME ||
    feat?.properties?.ADMIN ||
    feat?.properties?.name ||
    feat?.properties?.NAME_EN ||
    null
  );
}

function getFeatureCenter(feat) {
  const pts = [];
  const walk = (v) => {
    if (!Array.isArray(v)) return;
    if (typeof v[0] === "number" && typeof v[1] === "number") {
      pts.push(v);
      return;
    }
    v.forEach(walk);
  };
  walk(feat?.geometry?.coordinates);
  if (!pts.length) return null;
  const [sumLng, sumLat] = pts.reduce(
    (acc, p) => [acc[0] + p[0], acc[1] + p[1]],
    [0, 0],
  );
  return { lat: sumLat / pts.length, lng: sumLng / pts.length };
}

function siteLabelHtml(site, facilityStates) {
  const f1 = facilityStates[site.id]?.localF1;
  const f1Line = f1
    ? `<div style="font-size:10px;font-weight:700;color:#10FFAA;margin-top:5px">Local F1: ${(f1 * 100).toFixed(1)}%</div>`
    : "";
  const badge = site.isFlClient
    ? `<span style="font-size:8px;font-weight:700;color:#0DB8F0">FL CLIENT</span>`
    : site.isPrototype
      ? `<span style="font-size:8px;font-weight:700;color:#38BDF8">PROTOTYPE</span>`
      : site.isCloud
        ? `<span style="font-size:8px;font-weight:700;color:#F0A500">CLOUD</span>`
        : "";
  return `
    <div style="background:rgba(6,10,18,0.96);border:1px solid ${site.colour}55;border-radius:6px;padding:10px 12px;font-family:Inter,sans-serif;min-width:200px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:8px;font-weight:700;letter-spacing:.1em;color:rgba(255,255,255,.35)">CATERPILLAR</span>
        ${badge}
      </div>
      <div style="font-size:13px;font-weight:700;color:${site.colour}">${site.name}</div>
      <div style="font-size:10px;color:rgba(255,255,255,.55);margin-top:3px">${site.city}, ${site.state}</div>
      <div style="font-size:9px;color:rgba(255,255,255,.32);margin-top:5px;padding-top:4px;border-top:1px solid rgba(255,255,255,.07)">
        ${SITE_TYPE_LABELS[site.siteType] || site.cellType || "Facility"}
      </div>
      ${f1Line}
    </div>
  `;
}

export default function FederatedGeoMap({
  currentPhase = "idle",
  activeTransmissions = [],
  facilityStates = {},
  currentRound = 0,
}) {
  const globeRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ w: 600, h: 400 });
  const [countries, setCountries] = useState({ features: [] });
  const [hoverCountry, setHoverCountry] = useState(null);
  const [selectedSite, setSelectedSite] = useState(null);
  const [focusedCountry, setFocusedCountry] = useState(null);
  const [map2d, setMap2d] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [viewAltitude, setViewAltitude] = useState(GLOBAL_VIEW.altitude);
  const [arcs, setArcs] = useState([]);
  const [globeReady, setGlobeReady] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(GLOBE_TEXTURES.countries)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setCountries(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ w: Math.max(1, Math.floor(width)), h: Math.max(1, Math.floor(height)) });
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const flyTo = useCallback((pov, ms = 1200) => {
    globeRef.current?.pointOfView(pov, ms);
    setViewAltitude(pov.altitude ?? GLOBAL_VIEW.altitude);
  }, []);

  useEffect(() => {
    if (!globeReady || map2d) return;
    flyTo(GLOBAL_VIEW, 0);
  }, [globeReady, map2d, flyTo]);

  // Auto-rotate when idle
  useEffect(() => {
    if (!globeReady || map2d) return undefined;
    const controls = globeRef.current?.controls();
    if (!controls) return undefined;
    const shouldRotate = !isHovering && !hoverCountry && !focusedCountry && !selectedSite;
    controls.autoRotate = shouldRotate;
    controls.autoRotateSpeed = 2.2;
    return () => {
      controls.autoRotate = false;
    };
  }, [globeReady, map2d, isHovering, hoverCountry, focusedCountry, selectedSite]);

  useEffect(() => {
    if (activeTransmissions.length === 0) {
      setArcs([]);
      return;
    }
    const lookup = Object.fromEntries(
      [...FL_CLIENT_LIST, CATERPILLAR_FACILITIES.chennai_proto, AGGREGATION_SERVER].map((s) => [s.id, s]),
    );
    setArcs(
      activeTransmissions
        .map((tx) => {
          const from = lookup[tx.from];
          const to = lookup[tx.to];
          if (!from || !to) return null;
          return {
            id: tx.id,
            startLat: from.coordinates.lat,
            startLng: from.coordinates.lng,
            endLat: to.coordinates.lat,
            endLng: to.coordinates.lng,
            color:
              tx.type === "weight"
                ? ["rgba(13,184,240,0.9)", "rgba(13,184,240,0)"]
                : ["rgba(240,165,0,0.9)", "rgba(240,165,0,0)"],
            dashLength: 0.35,
            dashGap: 0.18,
            dashAnimateTime: 1400,
            strokeWidth: tx.type === "weight" ? 3.4 : 3.0,
          };
        })
        .filter(Boolean),
    );
  }, [activeTransmissions]);

  const highlightCountry = hoverCountry || focusedCountry;

  const visibleSites = useMemo(() => {
    if (!highlightCountry) return CATERPILLAR_GLOBAL_NETWORK;
    return sitesInCountry(highlightCountry);
  }, [highlightCountry]);

  const points = useMemo(
    () =>
      CATERPILLAR_GLOBAL_NETWORK.map((site) => {
        const inHighlight = !highlightCountry || site.country === highlightCountry;
        const isTxNode = activeTransmissions.some(
          (tx) => tx.from === site.id || tx.to === site.id,
        );
        const baseSize = inHighlight
          ? site.isFlClient
            ? 0.6
            : site.isCloud
              ? 0.7
              : site.isPrototype
                ? 0.5
                : 0.4
          : 0.15;
        return {
          id: site.id,
          lat: site.coordinates.lat,
          lng: site.coordinates.lng,
          size: isTxNode ? baseSize * 1.35 : baseSize,
          color: inHighlight ? site.colour : "rgba(100,120,150,0.35)",
          site,
          inHighlight,
          isTxNode,
        };
      }),
    [activeTransmissions, highlightCountry],
  );

  const stateLabels = useMemo(() => {
    if (!highlightCountry || viewAltitude > 0.85) return [];
    return statesInCountry(highlightCountry).map((st) => ({
      lat: st.lat,
      lng: st.lng,
      text: st.name,
      size: 0.5,
      color: "rgba(180,200,230,0.7)",
    }));
  }, [highlightCountry, viewAltitude]);

  const siteLabels = useMemo(() => {
    if (!highlightCountry || viewAltitude > 0.75) return [];
    return visibleSites.map((site) => ({
      lat: site.coordinates.lat,
      lng: site.coordinates.lng,
      text: site.city,
      size: site.isFlClient ? 0.65 : 0.45,
      color: site.colour,
    }));
  }, [visibleSites, highlightCountry, viewAltitude]);

  const rings = useMemo(() => {
    if (currentPhase === "idle") return [];
    return FL_CLIENT_LIST.map((f) => ({
      lat: f.coordinates.lat,
      lng: f.coordinates.lng,
      maxR: 2.5,
      propagationSpeed: 1.8,
      repeatPeriod: 1400,
      color: (t) => `rgba(${f.colourRGB}, ${1 - t})`,
    }));
  }, [currentPhase]);

  const handleCountryClick = useCallback((feat) => {
    const name = getCountryName(feat);
    if (!name) return;
    if (name === "India") {
      setMap2d(true);
      setFocusedCountry("India");
      setSelectedSite(null);
      return;
    }
    const region = COUNTRY_REGIONS[name];
    setFocusedCountry(name);
    setSelectedSite(null);
    if (region) {
      flyTo({ lat: region.lat, lng: region.lng, altitude: region.altitude });
      return;
    }
    const center = getFeatureCenter(feat);
    if (center) {
      flyTo({ lat: center.lat, lng: center.lng, altitude: 0.8 });
    }
  }, [flyTo]);

  const handleSiteClick = useCallback(
    (point) => {
      const site = point.site;
      setSelectedSite(site);
      if (site.country === "India") {
        setMap2d(true);
        setFocusedCountry("India");
      } else {
        flyTo({
          lat: site.coordinates.lat,
          lng: site.coordinates.lng,
          altitude: 0.3,
        });
      }
    },
    [flyTo],
  );

  const resetView = useCallback(() => {
    setMap2d(false);
    setFocusedCountry(null);
    setSelectedSite(null);
    setHoverCountry(null);
    flyTo(GLOBAL_VIEW);
  }, [flyTo]);

  const hoverCountrySites = hoverCountry ? sitesInCountry(hoverCountry) : [];

  if (map2d) {
    return (
      <div ref={containerRef} className="fl-geo-map">
        <IndiaCountryMap
          facilityStates={facilityStates}
          onBack={resetView}
          onSiteClick={setSelectedSite}
        />
        {selectedSite && (
          <div className="fl-geo-detail-card">
            <div className="fl-geo-detail-header">
              <div>
                <div className="fl-geo-detail-eyebrow">
                  {selectedSite.isFlClient ? "FL CLIENT" : selectedSite.isPrototype ? "PROTOTYPE" : selectedSite.isCloud ? "CLOUD" : "FACILITY"}
                </div>
                <div className="fl-geo-detail-name" style={{ color: selectedSite.colour }}>
                  {selectedSite.name}
                </div>
                <div className="fl-geo-detail-loc">
                  {selectedSite.city}, {selectedSite.state}
                </div>
                <div className="fl-geo-detail-coords mono">
                  {formatCoords(selectedSite.coordinates.lat, selectedSite.coordinates.lng)}
                </div>
              </div>
              <button type="button" className="fl-geo-detail-close" onClick={() => setSelectedSite(null)}>
                ×
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fl-geo-map"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <Globe
        ref={globeRef}
        width={dimensions.w}
        height={dimensions.h}
        onGlobeReady={() => mountedRef.current && setGlobeReady(true)}
        globeImageUrl={GLOBE_TEXTURES.globe}
        bumpImageUrl={GLOBE_TEXTURES.bump}
        backgroundImageUrl={null}
        backgroundColor="rgba(2,4,10,0)"
        showAtmosphere
        atmosphereColor="rgba(13,184,240,0.22)"
        atmosphereAltitude={0.18}
        showGraticules
        graticuleColor="rgba(120,160,220,0.06)"
        polygonsData={countries.features}
        polygonCapColor={(feat) => {
          const name = getCountryName(feat);
          if (hoverCountry === name) return "rgba(13,184,240,0.32)";
          if (focusedCountry === name) return "rgba(13,184,240,0.14)";
          return "rgba(40,60,90,0.04)";
        }}
        polygonSideColor={() => "rgba(10,20,40,0.35)"}
        polygonStrokeColor={(feat) => {
          const name = getCountryName(feat);
          if (hoverCountry === name) return "rgba(13,184,240,0.55)";
          if (focusedCountry === name) return "rgba(13,184,240,0.4)";
          return "rgba(80,120,180,0.08)";
        }}
        polygonAltitude={(feat) =>
          getCountryName(feat) === hoverCountry ? 0.012 : 0.004
        }
        onPolygonHover={(feat) => setHoverCountry(getCountryName(feat))}
        onPolygonClick={handleCountryClick}
        pointsData={points}
        pointLat="lat"
        pointLng="lng"
        pointAltitude={0.014}
        pointRadius="size"
        pointColor="color"
        pointLabel={(p) => (p.inHighlight ? siteLabelHtml(p.site, facilityStates) : "")}
        onPointClick={handleSiteClick}
        pointsMerge={false}
        labelsData={[...stateLabels, ...siteLabels]}
        labelLat="lat"
        labelLng="lng"
        labelText="text"
        labelSize="size"
        labelColor="color"
        labelDotRadius={0.18}
        labelResolution={2}
        labelAltitude={0.016}
        htmlElementsData={points.filter((p) => p.isTxNode)}
        htmlLat={(p) => p.lat}
        htmlLng={(p) => p.lng}
        htmlAltitude={0.03}
        htmlElement={() => {
          const el = document.createElement("div");
          el.className = "fl-tx-chip";
          el.textContent =
            currentPhase === "transmitting"
              ? "WEIGHT"
              : currentPhase === "broadcasting"
                ? "MODEL"
                : "NODE";
          return el;
        }}
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
        arcAltitude={0.28}
        ringsData={rings}
        ringLat="lat"
        ringLng="lng"
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"
        ringColor="color"
        ringAltitude={0.006}
        enablePointerInteraction
      />

      <div className="fl-geo-nav">
        <button type="button" className="fl-geo-nav-btn" onClick={resetView}>
          🌐 Global
        </button>
        {focusedCountry && (
          <>
            <span className="fl-geo-nav-sep">›</span>
            <span className="fl-geo-nav-crumb">{focusedCountry}</span>
          </>
        )}
        {focusedCountry === "India" && (
          <button type="button" className="fl-geo-nav-btn fl-geo-nav-btn--india" onClick={() => setMap2d(true)}>
            2D Map
          </button>
        )}
      </div>

      {hoverCountry && (
        <div className="fl-geo-hover-panel">
          <div className="fl-geo-hover-title">{hoverCountry}</div>
          {hoverCountrySites.length > 0 ? (
            hoverCountrySites.map((s) => (
              <div key={s.id} className="fl-geo-hover-site">
                <span className="fl-geo-legend-dot" style={{ background: s.colour }} />
                {s.name} — {s.city}
              </div>
            ))
          ) : (
            <div className="fl-geo-hover-empty">No Caterpillar sites in this region</div>
          )}
          {hoverCountry === "India" && (
            <div className="fl-geo-hover-hint">Click to open 2D state map</div>
          )}
        </div>
      )}

      {currentPhase !== "idle" && (
        <div className="fl-geo-phase">
          <span className="fl-geo-phase-dot" />
          <div>
            <div className="fl-geo-phase-label">
              {currentPhase === "training" && "LOCAL TRAINING"}
              {currentPhase === "transmitting" && "UPLOADING TO CLOUD"}
              {currentPhase === "aggregating" && "CLOUD FEDAVG"}
              {currentPhase === "broadcasting" && "DOWNLOADING MODEL"}
              {currentPhase === "evaluating" && "EVALUATING"}
            </div>
            <div className="fl-geo-phase-round">Round {currentRound}</div>
          </div>
        </div>
      )}
    </div>
  );
}
