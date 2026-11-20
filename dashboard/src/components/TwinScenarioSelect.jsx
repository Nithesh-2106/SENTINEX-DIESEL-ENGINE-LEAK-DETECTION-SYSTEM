import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SCENARIO_LABELS, MULTI_LEAK_SCENARIOS } from "../simulator.js";

const SINGLE_SCENARIOS = [
  "normal",
  "intake_preturbo",
  "intake_cac",
  "exhaust_preturbine",
  "exhaust_postturbine",
  "egr_leak",
  "cac_direct_leak",
  "minor_intake_leak",
  "sensor_fault_demo",
  "sensor_fault_exhaust",
  "sensor_fault_egr",
  "sensor_fault_cac",
];

/**
 * Custom scenario picker for Digital Twin top bar — avoids native select white popup on Windows.
 */
export default function TwinScenarioSelect({
  value,
  onChange,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const listId = useId();

  const label = SCENARIO_LABELS[value] || value || "Select scenario";

  const close = useCallback(() => setOpen(false), []);

  const pick = useCallback((id) => {
    onChange(id);
    setOpen(false);
  }, [onChange]);

  const updateMenuPosition = useCallback(() => {
    if (!rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    setMenuRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 280),
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
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const menu = open && menuRect && createPortal(
    <div
      ref={menuRef}
      className="twin-scenario-select__menu liquid-glass-panel"
      role="listbox"
      id={listId}
      aria-label="Select test scenario"
      style={{
        position: "fixed",
        top: menuRect.top,
        left: menuRect.left,
        width: menuRect.width,
        zIndex: 10050,
      }}
    >
      <div className="twin-scenario-select__section">
        <div className="twin-scenario-select__section-label">Single-leak scenarios</div>
        {SINGLE_SCENARIOS.map((id) => (
          <button
            key={id}
            type="button"
            role="option"
            aria-selected={value === id}
            className={`twin-scenario-select__option ${value === id ? "active" : ""}`}
            onClick={() => pick(id)}
          >
            <span className="twin-scenario-select__option-label">{SCENARIO_LABELS[id] || id}</span>
            {value === id && <span className="twin-scenario-select__check" aria-hidden>✓</span>}
          </button>
        ))}
      </div>
      <div className="twin-scenario-select__section">
        <div className="twin-scenario-select__section-label twin-scenario-select__section-label--multi">
          Multi-leak scenarios
        </div>
        {MULTI_LEAK_SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="option"
            aria-selected={value === s.id}
            className={`twin-scenario-select__option twin-scenario-select__option--multi ${value === s.id ? "active" : ""}`}
            onClick={() => pick(s.id)}
          >
            <span className="twin-scenario-select__option-label">{SCENARIO_LABELS[s.id] || s.id}</span>
            {value === s.id && <span className="twin-scenario-select__check" aria-hidden>✓</span>}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );

  return (
    <>
      <div ref={rootRef} className={`twin-scenario-select ${open ? "twin-scenario-select--open" : ""}`}>
        <button
          type="button"
          className="twin-scenario-select__trigger twin-top-select"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (disabled) return;
            setOpen((v) => !v);
          }}
        >
          <span className="twin-scenario-select__trigger-label">{label}</span>
          <span className={`twin-scenario-select__chevron ${open ? "open" : ""}`} aria-hidden>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      </div>
      {menu}
    </>
  );
}
