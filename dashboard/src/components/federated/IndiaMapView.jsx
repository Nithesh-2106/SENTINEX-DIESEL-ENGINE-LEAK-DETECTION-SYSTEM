import { useEffect, useRef, useState, useCallback } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { select } from "d3-selection";
import { INDIA_MAP_PINS, CAT_STATES } from "../../data/indiaStates.js";
import { prefetchIndiaGeo } from "../../utils/indiaGeoCache.js";
import { useContainedGestures } from "../../hooks/useContainedGestures.js";

function stateNameFromFeature(d) {
  return d.properties.ST_NM || d.properties.NAME_1 || d.properties.st_nm || "";
}

function IndiaHoverTip({ pin, x, y }) {
  const isCloud = pin.type === "cloud_server";
  return (
    <div
      className="fl-india-hover-tip liquid-glass-card"
      style={{ left: x, top: y }}
      role="tooltip"
    >
      <span className="fl-india-hover-tip__role">{pin.flRole}</span>
      <strong className="fl-india-hover-tip__name">{pin.name}</strong>
      <span className="fl-india-hover-tip__loc">
        {pin.city}, {pin.state}
      </span>
      {pin.isFlClient && (
        <div className="fl-india-hover-tip__specs">
          {pin.description && <span>{pin.description}</span>}
          {pin.environment && <span>{pin.environment}</span>}
          {pin.altitude && <span>{pin.altitude}</span>}
          {pin.trainRows != null && (
            <span className="mono">{pin.trainRows.toLocaleString()} training rows</span>
          )}
        </div>
      )}
      {isCloud && (
        <span className="fl-india-hover-tip__cloud">{pin.description}</span>
      )}
    </div>
  );
}

function PinGlassLabel({ pin, active, phaseActive, onEnter, onLeave, onClick }) {
  const ox = pin.labelOffset?.x ?? 0;
  const oy = pin.labelOffset?.y ?? 0;
  const isCloud = pin.type === "cloud_server";
  const title = isCloud ? "CLOUD" : (pin.city || pin.name || "").toUpperCase();
  const sub = isCloud ? "FedAvg Aggregator" : pin.state;

  return (
    <button
      type="button"
      className={`fl-india-glass-label liquid-glass-card${active ? " is-hovered" : ""}${pin.isFlClient ? " is-fl" : ""}${isCloud ? " is-cloud" : ""}${phaseActive ? " is-phase-live" : ""}`}
      style={{
        left: pin.px + ox,
        top: pin.py + oy - 16,
        "--pin-color": pin.colour,
        "--pin-rgb": pin.colourRGB,
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onClick}
      aria-label={`${pin.name}, ${pin.city}`}
    >
      <span className="fl-india-glass-label__dot" aria-hidden />
      <span className="fl-india-glass-label__text">
        <strong>{title}</strong>
        <em>{sub}</em>
      </span>
    </button>
  );
}

export default function IndiaMapView({
  active = false,
  currentPhase = "idle",
  currentRound = 0,
  onBack,
  onFacilityClick,
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const zoomLayerRef = useRef(null);
  const onFacilityClickRef = useRef(onFacilityClick);
  const hoveredStateRef = useRef(null);
  const [indiaGeo, setIndiaGeo] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [dimensions, setDimensions] = useState({ w: 600, h: 500 });
  const [pinLayout, setPinLayout] = useState([]);
  const [hoveredPin, setHoveredPin] = useState(null);
  const [tipPos, setTipPos] = useState(null);
  const [mapTransform, setMapTransform] = useState({ x: 0, y: 0, k: 1 });

  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const pointersRef = useRef(new Map());
  const panRef = useRef(null);
  const pinchRef = useRef(null);
  const dragPendingRef = useRef(null);

  useContainedGestures(containerRef, active);
  onFacilityClickRef.current = onFacilityClick;

  const highlightState = useCallback((stateName) => {
    hoveredStateRef.current = stateName;
    const svg = svgRef.current;
    if (!svg) return;
    select(svg)
      .selectAll(".states path")
      .attr("fill-opacity", (d) => {
        const name = stateNameFromFeature(d);
        if (!stateName) return CAT_STATES[name] ? 0.82 : 0.62;
        return name === stateName ? 1 : CAT_STATES[name] ? 0.45 : 0.35;
      })
      .attr("stroke-opacity", (d) => {
        const name = stateNameFromFeature(d);
        if (!stateName) return 1;
        return name === stateName ? 1 : 0.45;
      });
  }, []);

  const setHoverFromPin = useCallback((pin, el) => {
    const root = containerRef.current?.getBoundingClientRect();
    const box = el?.getBoundingClientRect?.();
    if (root && box) {
      setTipPos({
        x: box.left + box.width / 2 - root.left,
        y: box.top - root.top,
      });
    } else if (root) {
      const { x, y, k } = transformRef.current;
      setTipPos({
        x: x + pin.px * k,
        y: y + (pin.py - 20) * k,
      });
    }
    setHoveredPin(pin);
    highlightState(pin.state);
  }, [highlightState]);

  const clearHover = useCallback(() => {
    setHoveredPin(null);
    setTipPos(null);
    highlightState(null);
  }, [highlightState]);

  useEffect(() => {
    let cancelled = false;
    prefetchIndiaGeo()
      .then((geo) => {
        if (!cancelled) {
          setIndiaGeo(geo);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ w: Math.floor(width), h: Math.floor(height) });
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const applyTransform = useCallback(() => {
    const el = zoomLayerRef.current;
    if (!el) return;
    const { x, y, k } = transformRef.current;
    el.setAttribute("transform", `translate(${x},${y}) scale(${k})`);
    setMapTransform({ x, y, k });
  }, []);

  const resetZoom = useCallback(() => {
    transformRef.current = { x: 0, y: 0, k: 1 };
    applyTransform();
  }, [applyTransform]);

  useEffect(() => {
    if (!loaded || !svgRef.current || !dimensions.w) return;

    const { w, h } = dimensions;
    const svg = select(svgRef.current);
    svg.selectAll("*").remove();

    const defs = svg.append("defs");

    const glow = defs.append("filter").attr("id", "fl-india-pin-glow");
    glow.append("feGaussianBlur").attr("stdDeviation", "2.5").attr("result", "blur");
    const merge = glow.append("feMerge");
    merge.append("feMergeNode").attr("in", "blur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    svg
      .insert("rect", ":first-child")
      .attr("width", w)
      .attr("height", h)
      .attr("fill", "transparent")
      .attr("pointer-events", "none");

    const projection = geoMercator();
    const path = geoPath().projection(projection);

    if (indiaGeo) {
      projection.fitExtent(
        [
          [32, 32],
          [w - 32, h - 32],
        ],
        indiaGeo,
      );
    } else {
      projection.center([82.9629, 22.5937]).scale(Math.min(w, h) * 2.2).translate([w / 2, h / 2]);
    }

    const zoomG = svg.append("g").attr("class", "fl-india-zoom-layer");
    zoomLayerRef.current = zoomG.node();

    if (indiaGeo) {
      zoomG
        .append("g")
        .attr("class", "states")
        .selectAll("path")
        .data(indiaGeo.features)
        .enter()
        .append("path")
        .attr("d", path)
        .attr("class", "fl-india-state")
        .attr("fill", (d) => {
          const stateName = stateNameFromFeature(d);
          return CAT_STATES[stateName] ? "rgba(55, 68, 88, 0.72)" : "rgba(38, 48, 62, 0.55)";
        })
        .attr("stroke", (d) => {
          const stateName = stateNameFromFeature(d);
          return CAT_STATES[stateName] ? "rgba(120, 140, 168, 0.45)" : "rgba(80, 96, 120, 0.28)";
        })
        .attr("stroke-width", 0.65)
        .attr("fill-opacity", (d) => (CAT_STATES[stateNameFromFeature(d)] ? 0.82 : 0.62));
    }

    const projected = INDIA_MAP_PINS.map((pin) => {
      const [px, py] = projection([pin.lng, pin.lat]);
      return { ...pin, px, py };
    });
    setPinLayout(projected);

    const pinGroup = zoomG.append("g").attr("class", "pins");
    const phaseLive = ["transmitting", "broadcasting", "aggregating"].includes(currentPhase);

    const markers = pinGroup
      .selectAll("g.pin-marker")
      .data(projected)
      .enter()
      .append("g")
      .attr("class", (d) => {
        let cls = "pin-marker";
        if (d.isFlClient) cls += " pin-marker--fl";
        if (d.type === "cloud_server") cls += " pin-marker--cloud";
        if (phaseLive && d.isFlClient) cls += " pin-marker--live";
        return cls;
      })
      .attr("transform", (d) => `translate(${d.px},${d.py})`)
      .style("cursor", "pointer");

    markers.each(function renderPin() {
      const pin = select(this).datum();
      const g = select(this);
      const isCloud = pin.type === "cloud_server";
      const r = isCloud ? 6 : 5;

      g.append("circle")
        .attr("class", "fl-india-pulse-ring")
        .attr("r", r + 7)
        .attr("fill", "none")
        .attr("stroke", pin.colour)
        .attr("stroke-width", 1)
        .attr("opacity", pin.isFlClient || isCloud ? 0.45 : 0);

      g.append("circle")
        .attr("class", "pin-hit")
        .attr("r", 22)
        .attr("fill", "transparent")
        .attr("pointer-events", "all");

      g.append("circle")
        .attr("class", "pin-core")
        .attr("r", r)
        .attr("fill", isCloud ? "rgba(240, 165, 0, 0.9)" : pin.colour)
        .attr("stroke", "rgba(255,255,255,0.85)")
        .attr("stroke-width", 1.4)
        .attr("filter", "url(#fl-india-pin-glow)")
        .attr("pointer-events", "none");
    });

    markers
      .on("mouseenter", function onEnter(_event, d) {
        select(this).classed("is-hovered", true);
        setHoverFromPin(d, this);
      })
      .on("mouseleave", function onLeave() {
        select(this).classed("is-hovered", false);
        clearHover();
      })
      .on("click", (_event, d) => {
        onFacilityClickRef.current?.(d.id);
      });

    applyTransform();
  }, [loaded, indiaGeo, dimensions, applyTransform, setHoverFromPin, clearHover, currentPhase]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !active) return undefined;

    const onWheel = (e) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const t = transformRef.current;
      const nextK = Math.min(4, Math.max(1, t.k * factor));
      const ratio = nextK / t.k;
      transformRef.current = {
        k: nextK,
        x: cx - (cx - t.x) * ratio,
        y: cy - (cy - t.y) * ratio,
      };
      applyTransform();
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [active, applyTransform]);

  const onPointerDown = useCallback(
    (e) => {
      if (!active || e.target.closest("button") || e.target.closest(".fl-india-glass-label")) return;
      if (e.target.closest(".pin-marker") || e.target.closest(".pin-hit")) return;
      dragPendingRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    },
    [active],
  );

  const onPointerMove = useCallback(
    (e) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (dragPendingRef.current?.id === e.pointerId && !panRef.current && !pinchRef.current) {
        const dx = e.clientX - dragPendingRef.current.x;
        const dy = e.clientY - dragPendingRef.current.y;
        if (Math.hypot(dx, dy) < 5) return;
        panRef.current = { ...transformRef.current, px: e.clientX, py: e.clientY };
        dragPendingRef.current = null;
        containerRef.current?.setPointerCapture(e.pointerId);
      }

      if (pointersRef.current.size === 2) {
        if (!pinchRef.current) {
          const pts = [...pointersRef.current.values()];
          pinchRef.current = {
            dist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
            ...transformRef.current,
          };
          panRef.current = null;
        }
        const pts = [...pointersRef.current.values()];
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const ratio = dist / pinchRef.current.dist;
        const nextK = Math.min(4, Math.max(1, pinchRef.current.k * ratio));
        transformRef.current = { ...transformRef.current, k: nextK };
        applyTransform();
      } else if (pointersRef.current.size === 1 && panRef.current) {
        const dx = e.clientX - panRef.current.px;
        const dy = e.clientY - panRef.current.py;
        transformRef.current = {
          k: panRef.current.k,
          x: panRef.current.x + dx,
          y: panRef.current.y + dy,
        };
        panRef.current = { ...transformRef.current, px: e.clientX, py: e.clientY };
        applyTransform();
      }
    },
    [applyTransform],
  );

  const onPointerEnd = useCallback((e) => {
    pointersRef.current.delete(e.pointerId);
    if (dragPendingRef.current?.id === e.pointerId) dragPendingRef.current = null;
    if (pointersRef.current.size === 0) {
      panRef.current = null;
      pinchRef.current = null;
    } else if (pointersRef.current.size === 1) {
      pinchRef.current = null;
      const [pt] = pointersRef.current.values();
      panRef.current = { ...transformRef.current, px: pt.x, py: pt.y };
    }
    try {
      containerRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const phaseLive = ["transmitting", "broadcasting", "aggregating"].includes(currentPhase);

  return (
    <div
      ref={containerRef}
      className={`fl-india-static-map fl-map-surface${active ? " fl-india-static-map--active" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      role="presentation"
    >
      <svg
        ref={svgRef}
        className="fl-india-static-map__svg"
        width={dimensions.w}
        height={dimensions.h}
        style={{ pointerEvents: active ? "auto" : "none", touchAction: "none" }}
      />

      {active && pinLayout.length > 0 && (
        <div
          className="fl-india-labels-layer"
          style={{
            transform: `translate(${mapTransform.x}px, ${mapTransform.y}px) scale(${mapTransform.k})`,
          }}
        >
          {pinLayout.map((pin) => (
            <PinGlassLabel
              key={pin.id}
              pin={pin}
              active={hoveredPin?.id === pin.id}
              phaseActive={phaseLive && (pin.isFlClient || pin.type === "cloud_server")}
              onEnter={(e) => setHoverFromPin(pin, e.currentTarget)}
              onLeave={clearHover}
              onClick={() => onFacilityClickRef.current?.(pin.id)}
            />
          ))}
        </div>
      )}

      {active && (
        <>
          <button type="button" className="fl-india-back-btn" onClick={onBack}>
            ← Globe
          </button>
          <button type="button" className="fl-india-reset-btn" onClick={resetZoom} title="Reset zoom">
            ⟲
          </button>
          <div className="fl-india-map-header liquid-glass-card">
            <div className="fl-india-map-header__eyebrow">CATERPILLAR INDIA</div>
            <div className="fl-india-map-header__title">TEST CELL LOCATIONS</div>
            <div className="fl-india-map-header__sub">Hover labels for detail · pinch or scroll to zoom</div>
          </div>
        </>
      )}

      {active && hoveredPin && tipPos && (
        <IndiaHoverTip pin={hoveredPin} x={tipPos.x} y={tipPos.y} />
      )}

      {active && currentPhase !== "idle" && (
        <div className="fl-india-static-map__phase">
          <span className="fl-india-globe3d__phase-dot" />
          ROUND {currentRound} — {currentPhase.toUpperCase()}
        </div>
      )}
    </div>
  );
}
