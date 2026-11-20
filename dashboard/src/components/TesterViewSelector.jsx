import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SCENARIO_LABELS, ENGINE_DISPLAY } from "../simulator.js";
import { getTesterBayId } from "../utils/testerRegistry.js";
import { getTesterBayTone } from "../utils/testerBayTone.js";

const TONE_CLASS = {
  leak: "leak",
  normal: "normal",
  steady: "steady",
  transitioning: "transitioning",
  offline: "offline",
};

function buildTesterMeta(tester) {
  const p = tester.presence;
  const online = tester.online;
  const leak = p?.leakDetected || tester.snap?.leakActive;
  const tone = getTesterBayTone(tester);
  const scenarioLabel = p?.scenarioLabel || SCENARIO_LABELS[p?.scenario] || "Normal";
  const engineShort = (ENGINE_DISPLAY[p?.engine] || p?.engine || "").replace("CAT ", "");
  const bayId = getTesterBayId(tester.id);
  const meta = online
    ? `${engineShort || "—"} · ${leak ? "LEAK" : scenarioLabel.split(" ")[0]}${p?.isStreaming ? " · LIVE" : ""}`
    : "Offline";
  const statusLabel = !online
    ? "OFFLINE"
    : leak
      ? "LEAK"
      : p?.isStreaming
        ? "LIVE"
        : "READY";

  return { online, leak, tone, scenarioLabel, engineShort, bayId, meta, statusLabel };
}

function BayOption({ option, selected, onPick }) {
  const isOverview = option.type === "overview";

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={`bay-dropdown__option ${selected ? "active" : ""} ${isOverview ? "bay-dropdown__option--overview" : ""} ${!isOverview ? `bay-dropdown__option--${TONE_CLASS[option.tone] || "offline"}` : ""} ${option.leak ? "leak" : ""}`}
      onClick={() => onPick(option.id)}
    >
      {isOverview ? (
        <>
          <span className="bay-dropdown__option-icon" aria-hidden>◎</span>
          <span className="bay-dropdown__option-body">
            <span className="bay-dropdown__option-name">Cell Overview</span>
            <span className="bay-dropdown__option-meta">Supervisor summary</span>
          </span>
        </>
      ) : (
        <>
          <span className={`bay-dropdown__option-dot ${option.online ? "on" : ""}`} aria-hidden />
          <span className="bay-dropdown__option-body">
            <span className="bay-dropdown__option-title-row">
              <span className="bay-dropdown__option-name">{option.displayName}</span>
              {option.bayId && <span className="bay-dropdown__option-bay">{option.bayId}</span>}
              <span className={`bay-dropdown__option-status bay-dropdown__option-status--${option.statusLabel.toLowerCase()}`}>
                {option.statusLabel}
              </span>
            </span>
            <span className="bay-dropdown__option-meta">{option.meta}</span>
          </span>
        </>
      )}
      {selected && <span className="bay-dropdown__option-check" aria-hidden>✓</span>}
    </button>
  );
}

export default function TesterViewSelector({
  liveTesters = [],
  selectedId,
  onSelect,
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const listId = useId();

  const options = useMemo(() => {
    const overview = { type: "overview", id: null, label: "Cell Overview", sub: "All bays" };
    const testers = liveTesters.map((t) => {
      const meta = buildTesterMeta(t);
      return {
        type: "tester",
        id: t.id,
        displayName: t.displayName,
        ...meta,
      };
    });
    return [overview, ...testers];
  }, [liveTesters]);

  const selected = useMemo(
    () => options.find((o) => o.id === selectedId) || options[0],
    [options, selectedId],
  );

  const close = useCallback(() => setOpen(false), []);

  const pick = useCallback((id) => {
    onSelect(id);
    setOpen(false);
  }, [onSelect]);

  const updateMenuPosition = useCallback(() => {
    if (!rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    setMenuRect({
      top: rect.bottom + 6,
      left: rect.left,
      width: Math.min(Math.max(rect.width, 260), 320),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updateMenuPosition();
    const onResize = () => updateMenuPosition();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      const t = e.target;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const triggerLabel = selected?.type === "overview"
    ? "Cell Overview"
    : selected?.displayName || "Select bay";
  const triggerMeta = selected?.type === "overview"
    ? `${liveTesters.filter((t) => t.online).length} online · ${liveTesters.length} bays`
    : selected?.meta || "Choose a tester bay";

  const menu = open && menuRect && createPortal(
    <div
      ref={menuRef}
      className="bay-dropdown__menu liquid-glass-panel"
      role="listbox"
      id={listId}
      aria-label="Select tester bay"
      style={{
        position: "fixed",
        top: menuRect.top,
        left: menuRect.left,
        width: menuRect.width,
        zIndex: 10050,
      }}
    >
      <div className="bay-dropdown__menu-head">
        <span>Bay</span>
        <span className="bay-dropdown__menu-count">{liveTesters.length} bays</span>
      </div>
      <div className="bay-dropdown__menu-scroll">
        {options.map((option) => (
          <BayOption
            key={option.id ?? "overview"}
            option={option}
            selected={selectedId === option.id}
            onPick={pick}
          />
        ))}
      </div>
    </div>,
    document.body,
  );

  return (
    <>
      <div
        ref={rootRef}
        className={`bay-dropdown liquid-glass-card ${compact ? "bay-dropdown--compact" : ""} ${open ? "bay-dropdown--open" : ""}`}
      >
        <span className="bay-dropdown__label">VIEW BAY</span>

        <button
          type="button"
          className={`bay-dropdown__trigger ${selected?.type !== "overview" ? `bay-dropdown__trigger--${TONE_CLASS[selected?.tone] || "offline"}` : ""} ${selected?.leak ? "leak" : ""}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          {selected?.type !== "overview" && (
            <span className={`bay-dropdown__trigger-dot ${selected?.online ? "on" : ""}`} aria-hidden />
          )}
          <span className="bay-dropdown__trigger-body">
            <span className="bay-dropdown__trigger-name">{triggerLabel}</span>
            <span className="bay-dropdown__trigger-meta">{triggerMeta}</span>
          </span>
          {selected?.bayId && (
            <span className="bay-dropdown__trigger-bay">{selected.bayId}</span>
          )}
          <span className={`bay-dropdown__chevron ${open ? "open" : ""}`} aria-hidden>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      </div>
      {menu}
    </>
  );
}
