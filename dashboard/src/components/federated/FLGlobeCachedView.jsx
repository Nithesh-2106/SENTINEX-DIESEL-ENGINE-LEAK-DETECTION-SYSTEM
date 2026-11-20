import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COUNTRY_LABELS } from "../../data/indiaStates.js";
import {
  getGlobeMapPins,
  equirectPinPercent,
  lngToTrackOffsetPercent,
  INDIA_GLOBE_LNG,
} from "../../utils/flGlobePinLayout.js";

const EARTH_TEXTURE = "/fl-globe/earth-night.jpg";

function FederatedTip({ pin }) {
  return (
    <>
      <span className="fl-globe-cached__pin-tip-eyebrow">
        {pin.isFlClient ? `${pin.flRole || "FL CLIENT"} · ` : ""}
        {pin.country}
      </span>
      <strong className="fl-globe-cached__pin-tip-title">{pin.name}</strong>
      <span className="fl-globe-cached__pin-tip-loc">
        {pin.city}
        {pin.state ? `, ${pin.state}` : ""}
      </span>
      {pin.isFlClient && (
        <div className="fl-globe-cached__pin-tip-specs">
          {pin.cellType && <span>{pin.cellType}</span>}
          {pin.description && <span>{pin.description}</span>}
          {pin.environment && <span>{pin.environment}</span>}
          {pin.altitude && <span>{pin.altitude}</span>}
          {pin.trainRows != null && (
            <span className="mono">{pin.trainRows.toLocaleString()} training rows</span>
          )}
        </div>
      )}
      {!pin.isFlClient && pin.cellType && (
        <span className="fl-globe-cached__pin-tip-type">{pin.cellType}</span>
      )}
    </>
  );
}

function GlobePin({ pin, onFacilityClick, onHover, onLeave, interactive = true }) {
  const { x, y } = equirectPinPercent(pin.lat, pin.lng);

  return (
    <span
      className={`fl-globe-cached__pin${pin.isFlClient ? " fl-globe-cached__pin--fl" : ""}`}
      style={{ left: `${x}%`, top: `${y}%`, "--pin-color": pin.colour }}
      onMouseEnter={(e) => interactive && onHover(pin, e.currentTarget)}
      onMouseLeave={() => interactive && onLeave()}
      onFocus={(e) => interactive && onHover(pin, e.currentTarget)}
      onBlur={() => interactive && onLeave()}
      onClick={() => pin.isFlClient && onFacilityClick?.(pin.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && pin.isFlClient) onFacilityClick?.(pin.id);
      }}
      role={pin.isFlClient ? "button" : "presentation"}
      tabIndex={pin.isFlClient && interactive ? 0 : -1}
    >
      <span className="fl-globe-cached__pin-core" />
    </span>
  );
}

function GlobeLabelLayer({ labels }) {
  return (
    <div className="fl-globe-cached__label-layer" aria-hidden>
      {labels.map((label) => {
        const { x, y } = equirectPinPercent(label.lat, label.lng);
        return (
          <span
            key={label.text}
            className="fl-globe-cached__country"
            style={{ left: `${x}%`, top: `${y}%`, fontSize: `${9 + (label.size ?? 1) * 2.8}px` }}
          >
            {label.text}
          </span>
        );
      })}
    </div>
  );
}

function wrapTrackOffset(offset) {
  let o = offset;
  while (o < -50) o += 50;
  while (o > 0) o -= 50;
  return o;
}

export default function FLGlobeCachedView({
  onFacilityClick,
  onZoomToIndia,
  paused = false,
}) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const trackRef = useRef(null);
  const offsetRef = useRef(0);
  const scaleRef = useRef(1);
  const spinRef = useRef(true);
  const dragRef = useRef(null);
  const pinchRef = useRef(null);
  const pointersRef = useRef(new Map());
  const rafRef = useRef(null);
  const speedRef = useRef(38);
  const resumeSpinRef = useRef(true);

  const [rotating, setRotating] = useState(true);
  const [speedSec, setSpeedSec] = useState(38);
  const [hoveredPin, setHoveredPin] = useState(null);
  const [tipPos, setTipPos] = useState(null);

  const pins = useMemo(() => getGlobeMapPins(), []);
  const countryLabels = useMemo(() => COUNTRY_LABELS, []);
  const flCount = pins.filter((p) => p.isFlClient).length;
  const globalCount = pins.filter((p) => !p.isFlClient).length;

  const applyStage = useCallback(() => {
    if (stageRef.current) {
      stageRef.current.style.transform = `scale(${scaleRef.current})`;
    }
  }, []);

  const applyTrack = useCallback((offset) => {
    const wrapped = wrapTrackOffset(offset);
    offsetRef.current = wrapped;
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(${wrapped}%, 0, 0)`;
    }
  }, []);

  const pauseSpin = useCallback(() => {
    spinRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    speedRef.current = speedSec;
  }, [speedSec]);

  useEffect(() => {
    spinRef.current = rotating && !paused;
  }, [rotating, paused]);

  useEffect(() => {
    if (paused || !rotating) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return undefined;
    }
    let last = performance.now();
    const tick = (now) => {
      if (!spinRef.current) return;
      const dt = (now - last) / 1000;
      last = now;
      applyTrack(offsetRef.current - (dt / speedRef.current) * 50);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [rotating, paused, applyTrack]);

  const snapToIndia = useCallback(() => {
    applyTrack(lngToTrackOffsetPercent(INDIA_GLOBE_LNG));
  }, [applyTrack]);

  const toggleRotation = useCallback(() => {
    if (rotating) {
      setRotating(false);
      resumeSpinRef.current = false;
      snapToIndia();
    } else {
      resumeSpinRef.current = true;
      setRotating(true);
    }
  }, [rotating, snapToIndia]);

  const resetZoom = useCallback(() => {
    scaleRef.current = 1;
    applyStage();
  }, [applyStage]);

  const handleHover = useCallback(
    (pin, el) => {
      pauseSpin();
      setHoveredPin(pin);
      const root = rootRef.current?.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      if (root) {
        setTipPos({
          x: rect.left + rect.width / 2 - root.left,
          y: rect.top - root.top,
        });
      }
    },
    [pauseSpin],
  );

  const handleLeave = useCallback(() => {
    setHoveredPin(null);
    setTipPos(null);
    if (resumeSpinRef.current && !paused) {
      spinRef.current = true;
      setRotating(true);
    }
  }, [paused]);

  const onWheel = useCallback(
    (e) => {
      e.preventDefault();
      pauseSpin();
      resumeSpinRef.current = false;
      const factor = e.deltaY < 0 ? 1.07 : 0.93;
      scaleRef.current = Math.min(2.6, Math.max(1, scaleRef.current * factor));
      applyStage();
    },
    [applyStage, pauseSpin],
  );

  const onPointerDown = useCallback(
    (e) => {
      if (e.target.closest(".fl-globe-controls") || e.target.closest(".fl-globe-cached__pin")) return;
      pauseSpin();
      resumeSpinRef.current = false;
      stageRef.current?.setPointerCapture(e.pointerId);
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointersRef.current.size === 1) {
        dragRef.current = { x: e.clientX, offset: offsetRef.current };
      } else if (pointersRef.current.size === 2) {
        const pts = [...pointersRef.current.values()];
        pinchRef.current = {
          dist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
          k: scaleRef.current,
        };
        dragRef.current = null;
      }
    },
    [pauseSpin],
  );

  const onPointerMove = useCallback(
    (e) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointersRef.current.size === 2 && pinchRef.current) {
        const pts = [...pointersRef.current.values()];
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const ratio = dist / pinchRef.current.dist;
        scaleRef.current = Math.min(2.6, Math.max(1, pinchRef.current.k * ratio));
        applyStage();
      } else if (pointersRef.current.size === 1 && dragRef.current) {
        const w = stageRef.current?.getBoundingClientRect().width || 1;
        const dx = e.clientX - dragRef.current.x;
        applyTrack(dragRef.current.offset + (dx / w) * 50);
      }
    },
    [applyStage, applyTrack],
  );

  const onPointerEnd = useCallback((e) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) {
      dragRef.current = null;
      pinchRef.current = null;
    } else if (pointersRef.current.size === 1) {
      pinchRef.current = null;
      const [pt] = pointersRef.current.values();
      dragRef.current = { x: pt.x, offset: offsetRef.current };
    }
    try {
      stageRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const renderHemisphere = (suffix = "", interactive = true) => (
    <div className="fl-globe-cached__hemisphere" aria-hidden={!interactive}>
      <img src={EARTH_TEXTURE} alt="" className="fl-globe-cached__map" draggable={false} loading="eager" decoding="async" />
      <GlobeLabelLayer labels={countryLabels} />
      <div className="fl-globe-cached__pin-layer">
        {pins.map((pin) => (
          <GlobePin
            key={`${suffix}${pin.id}`}
            pin={pin}
            onFacilityClick={onFacilityClick}
            onHover={handleHover}
            onLeave={handleLeave}
            interactive={interactive}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className={`fl-globe-cached${paused ? " is-paused" : ""}`}>
      <div className="fl-globe-cached__atmosphere" aria-hidden />

      <div
        ref={stageRef}
        className="fl-globe-cached__zoom-stage"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div className="fl-globe-cached__viewport">
          <div
            ref={trackRef}
            className={`fl-globe-cached__track${rotating && !paused ? " is-spinning" : " is-snapped"}`}
          >
            {renderHemisphere("", true)}
            {renderHemisphere("dup-", false)}
          </div>
          <div className="fl-globe-cached__shade" aria-hidden />
        </div>
      </div>

      {hoveredPin && tipPos && (
        <div
          className="fl-globe-cached__tooltip liquid-glass-card"
          style={{ left: tipPos.x, top: tipPos.y }}
          role="tooltip"
        >
          <FederatedTip pin={hoveredPin} />
        </div>
      )}

      <div className="fl-globe-controls fl-globe-controls--cached">
        <button
          type="button"
          className={`fl-globe-ctrl-btn ${rotating && !paused ? "is-active" : ""}`}
          title={rotating ? "Stop and face India" : "Resume globe rotation"}
          onClick={toggleRotation}
        >
          {rotating && !paused ? (
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

        <button type="button" className="fl-globe-ctrl-btn" title="Zoom into India map" onClick={() => onZoomToIndia?.()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.75" />
            <path d="M15.5 15.5L21 21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>

        <button type="button" className="fl-globe-ctrl-btn" title="Reset zoom" onClick={resetZoom}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 12a8 8 0 0 1 13.3-5.9M20 4v5h-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <label className="fl-globe-speed" title="Rotation speed">
          <span className="fl-globe-speed__label">SPEED</span>
          <input
            type="range"
            className="fl-globe-speed__slider"
            min={12}
            max={72}
            step={2}
            value={speedSec}
            onChange={(e) => setSpeedSec(Number(e.target.value))}
            aria-label="Globe rotation speed"
          />
        </label>
      </div>

      <div className="fl-globe-site-count">
        {`DRAG TO ROTATE · PINCH TO ZOOM · ${globalCount} GLOBAL · ${flCount} FEDERATED`}
      </div>
    </div>
  );
}
