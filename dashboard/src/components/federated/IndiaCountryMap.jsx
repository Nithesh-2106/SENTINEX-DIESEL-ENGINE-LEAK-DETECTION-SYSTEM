import { useEffect, useState, useMemo } from "react";
import { sitesInCountry } from "../../constants/federatedFacilities";
import { GLOBE_TEXTURES } from "../../constants/federatedGeoNav";

const BOUNDS = { minLat: 6.5, maxLat: 37.5, minLng: 68.0, maxLng: 97.5 };

function project(lat, lng, w, h, pad = 16) {
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  const x = pad + ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * iw;
  const y = pad + ih - ((lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * ih;
  return [x, y];
}

function coordsToPath(coords, w, h) {
  const ring = (r) =>
    r
      .map((c, i) => {
        const [x, y] = project(c[1], c[0], w, h);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + " Z";

  if (coords[0]?.[0]?.length === 2 && typeof coords[0][0][0] === "number") {
    return ring(coords[0]);
  }
  if (coords[0]?.[0]?.[0]?.length === 2) {
    return coords.map((poly) => ring(poly[0])).join(" ");
  }
  return ring(coords);
}

const FALLBACK_STATE_FEATURES = [
  {
    type: "Feature",
    properties: { ST_NM: "Tamil Nadu" },
    geometry: {
      type: "Polygon",
      coordinates: [[[76.5, 8.2], [80.6, 8.2], [80.6, 13.8], [76.5, 13.8], [76.5, 8.2]]],
    },
  },
  {
    type: "Feature",
    properties: { ST_NM: "Maharashtra" },
    geometry: {
      type: "Polygon",
      coordinates: [[[72.2, 15.5], [80.8, 15.5], [80.8, 22.2], [72.2, 22.2], [72.2, 15.5]]],
    },
  },
  {
    type: "Feature",
    properties: { ST_NM: "Karnataka" },
    geometry: {
      type: "Polygon",
      coordinates: [[[74.0, 11.5], [78.9, 11.5], [78.9, 18.5], [74.0, 18.5], [74.0, 11.5]]],
    },
  },
  {
    type: "Feature",
    properties: { ST_NM: "Andhra Pradesh" },
    geometry: {
      type: "Polygon",
      coordinates: [[[78.0, 12.4], [84.5, 12.4], [84.5, 19.8], [78.0, 19.8], [78.0, 12.4]]],
    },
  },
  {
    type: "Feature",
    properties: { ST_NM: "Telangana" },
    geometry: {
      type: "Polygon",
      coordinates: [[[77.1, 15.7], [81.2, 15.7], [81.2, 19.1], [77.1, 19.1], [77.1, 15.7]]],
    },
  },
];

export default function IndiaCountryMap({
  facilityStates = {},
  onBack,
  onSiteClick,
  hoverState = null,
  onStateHover,
}) {
  const [states, setStates] = useState([]);
  const [dims, setDims] = useState({ w: 600, h: 400 });
  const [hoverSite, setHoverSite] = useState(null);

  const sites = useMemo(() => sitesInCountry("India"), []);

  useEffect(() => {
    let cancelled = false;
    fetch(GLOBE_TEXTURES.indiaStates)
      .then((r) => r.json())
      .then((geo) => {
        const features = Array.isArray(geo?.features) ? geo.features : [];
        if (!cancelled) setStates(features.length ? features : FALLBACK_STATE_FEATURES);
      })
      .catch(() => {
        if (!cancelled) setStates(FALLBACK_STATE_FEATURES);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      const el = document.querySelector(".india-map-svg");
      if (el) {
        const rect = el.getBoundingClientRect();
        setDims({ w: rect.width, h: rect.height });
      }
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const { w, h } = dims;

  return (
    <div className="india-map-view">
      <div className="india-map-toolbar">
        <button type="button" className="fl-geo-nav-btn" onClick={onBack}>
          ← Globe
        </button>
        <span className="india-map-title">INDIA — STATE MAP</span>
        <span className="india-map-sub">Prototype &amp; FL test cells</span>
      </div>

      <svg className="india-map-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
        <rect width={w} height={h} fill="rgba(4,8,16,0.95)" />

        {states.map((feat, i) => {
          const name =
            feat.properties?.ST_NM ||
            feat.properties?.NAME_1 ||
            feat.properties?.name ||
            `State ${i}`;
          const isHover = hoverState === name;
          const hasSite = sites.some((s) => s.state === name);
          return (
            <path
              key={`${name}-${i}`}
              d={coordsToPath(feat.geometry.coordinates, w, h)}
              fill={
                isHover
                  ? "rgba(13,184,240,0.28)"
                  : hasSite
                    ? "rgba(13,184,240,0.1)"
                    : "rgba(30,45,70,0.35)"
              }
              stroke={
                isHover ? "rgba(13,184,240,0.65)" : "rgba(100,140,200,0.22)"
              }
              strokeWidth={isHover ? 1.2 : 0.6}
              onMouseEnter={() => onStateHover?.(name)}
              onMouseLeave={() => onStateHover?.(null)}
            />
          );
        })}

        {sites.map((site) => {
          const [cx, cy] = project(site.coordinates.lat, site.coordinates.lng, w, h);
          const isCloud = site.isCloud;
          const isHover = hoverSite === site.id;
          const f1 = facilityStates[site.id]?.localF1;
          return (
            <g
              key={site.id}
              className="india-map-site"
              onMouseEnter={() => setHoverSite(site.id)}
              onMouseLeave={() => setHoverSite(null)}
              onClick={() => onSiteClick?.(site)}
              style={{ cursor: "pointer" }}
            >
              {isCloud ? (
                <>
                  <ellipse
                    cx={cx}
                    cy={cy - 14}
                    rx={isHover ? 22 : 18}
                    ry={isHover ? 10 : 8}
                    fill="rgba(240,165,0,0.15)"
                    stroke="rgba(240,165,0,0.5)"
                    strokeWidth={1}
                  />
                  <text x={cx} y={cy - 12} textAnchor="middle" fontSize="8" fill="#F0A500">
                    ☁
                  </text>
                </>
              ) : (
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHover ? 7 : site.isFlClient ? 6 : 5}
                  fill={site.colour}
                  stroke="rgba(255,255,255,0.5)"
                  strokeWidth={1}
                  opacity={0.95}
                />
              )}
              <text
                x={cx}
                y={cy + (isCloud ? 6 : 16)}
                textAnchor="middle"
                fontSize="7"
                fontWeight="600"
                fill="rgba(255,255,255,0.75)"
              >
                {site.city}
              </text>
              {isHover && (
                <foreignObject x={cx + 8} y={cy - 40} width="160" height="80">
                  <div className="india-map-tooltip">
                    <div className="india-map-tooltip-name" style={{ color: site.colour }}>
                      {site.name}
                    </div>
                    <div className="india-map-tooltip-loc">
                      {site.city}, {site.state}
                    </div>
                    {site.isPrototype && <div className="india-map-tooltip-tag">PROTOTYPE HQ</div>}
                    {site.isFlClient && <div className="india-map-tooltip-tag">FL CLIENT</div>}
                    {site.isCloud && <div className="india-map-tooltip-tag">CLOUD SERVER</div>}
                    {f1 && (
                      <div className="india-map-tooltip-f1">
                        Local F1: {(f1 * 100).toFixed(1)}%
                      </div>
                    )}
                  </div>
                </foreignObject>
              )}
            </g>
          );
        })}
      </svg>

      <div className="india-map-legend">
        {sites.map((s) => (
          <div key={s.id} className="india-map-legend-item">
            <span className="india-map-legend-dot" style={{ background: s.colour }} />
            {s.city}
            {s.isPrototype && " (proto)"}
            {s.isCloud && " (cloud)"}
          </div>
        ))}
      </div>
    </div>
  );
}
