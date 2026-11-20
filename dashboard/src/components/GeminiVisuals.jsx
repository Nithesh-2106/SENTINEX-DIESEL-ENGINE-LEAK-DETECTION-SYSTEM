import React from "react";
import { AriaInsightIcon } from "./AriaInsightIcons.jsx";
import {
  stabilizeActiveLeaks,
  formatLeakLocation,
  isMultiLeakPrediction,
} from "../utils/multiLeak.js";

/** Rotating multicolor gradient orb — Gemini-style AI avatar */
export function GeminiOrb({ size = 28, className = "" }) {
  const s = size;
  return (
    <div
      className={`gemini-orb-wrap shrink-0 ${className}`}
      style={{ width: s, height: s }}
      aria-hidden
    >
      <div className="gemini-orb-inner" />
      <div className="gemini-orb-shine" />
    </div>
  );
}

/** Animated gradient border card for assistant messages */
export function GeminiMessageShell({ children, streaming = false, className = "", welcome = false }) {
  return (
    <div className={`gemini-msg-shell ${streaming ? "gemini-msg-streaming" : ""} ${welcome ? "gemini-msg-shell--welcome" : ""} ${className}`}>
      {streaming && (
        <div className="gemini-msg-wave-aura" aria-hidden>
          <div className="gemini-msg-wave gemini-msg-wave-1" />
          <div className="gemini-msg-wave gemini-msg-wave-2" />
        </div>
      )}
      <div className="gemini-msg-border" />
      <div className={`gemini-msg-body ${welcome ? "gemini-msg-body--welcome" : ""}`}>
        {streaming && <div className="gemini-msg-shimmer" aria-hidden />}
        {children}
      </div>
    </div>
  );
}

/** Gemini-style thinking indicator with gradient dots + wave glow */
export function GeminiThinking({ label = "Thinking", onStop }) {
  return (
    <div className="gemini-thinking-wrap flex items-center gap-3 px-1 py-2">
      <div className="gemini-thinking-aurora" aria-hidden>
        <div className="gemini-thinking-wave gemini-thinking-wave-1" />
        <div className="gemini-thinking-wave gemini-thinking-wave-2" />
      </div>
      <div className="relative z-10 flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="gemini-think-dot"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <span className="gemini-think-label relative z-10 text-[11px]">{label}…</span>
      {onStop && (
        <button
          type="button"
          onClick={onStop}
          className="relative z-10 ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/5 text-slate-400 transition-colors hover:bg-white/10 hover:text-red-400"
          title="Stop generating"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** Ambient animated mesh behind chat area */
export function GeminiAmbientBg({ state = "NORMAL", active = false }) {
  const leak = state === "LEAK_DETECTED";
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className={`gemini-wave-aurora ${active ? "gemini-wave-aurora-active" : ""} ${leak ? "gemini-wave-aurora-alert" : ""}`}>
        <div className="gemini-wave-silk gemini-wave-silk-1" />
        <div className="gemini-wave-silk gemini-wave-silk-2" />
        <div className="gemini-wave-silk gemini-wave-silk-3" />
        <div className="gemini-wave-silk gemini-wave-silk-4" />
      </div>
      <div className={`gemini-ambient-blob gemini-blob-1 ${leak ? "gemini-blob-alert" : ""}`} />
      <div className={`gemini-ambient-blob gemini-blob-2 ${leak ? "gemini-blob-alert" : ""}`} />
      <div className="gemini-ambient-blob gemini-blob-3" />
      <div className="gemini-ambient-grid" />
    </div>
  );
}

/** Top aurora wave — Gemini mobile signature glow */
export function GeminiWaveHeader({ active = false, state = "NORMAL", compact = false }) {
  const leak = state === "LEAK_DETECTED";
  return (
    <div
      className={`gemini-wave-header pointer-events-none absolute inset-x-0 top-0 z-[1] ${compact ? "gemini-wave-header-compact" : ""} ${active ? "gemini-wave-header-active" : ""} ${leak ? "gemini-wave-header-alert" : ""}`}
      aria-hidden
    >
      <div className="gemini-wave-header-silk gemini-wave-header-silk-1" />
      <div className="gemini-wave-header-silk gemini-wave-header-silk-2" />
      <div className="gemini-wave-header-silk gemini-wave-header-silk-3" />
      <div className="gemini-wave-header-fade" />
    </div>
  );
}

/** Bottom flowing ribbon above input — intensifies while AI thinks */
export function GeminiWaveFooter({ active = false }) {
  return (
    <div
      className={`gemini-wave-footer pointer-events-none absolute inset-x-0 bottom-0 z-[1] ${active ? "gemini-wave-footer-active" : ""}`}
      aria-hidden
    >
      <div className="gemini-wave-footer-ribbon" />
      <div className="gemini-wave-footer-glow" />
    </div>
  );
}

/** Gemini mobile-style input bar with flowing edge */
export function GeminiInputShell({ children, active = false, focused = false }) {
  return (
    <div className={`gemini-input-shell relative ${active ? "gemini-input-active" : ""} ${focused ? "gemini-input-focused" : ""}`}>
      <div className="gemini-input-wave-edge" aria-hidden />
      {children}
    </div>
  );
}

/** Live context cards — Gemini-style dynamic insight tiles */
export function GeminiContextCards({
  prediction,
  liveReadings,
  rcaResult,
  multiRcaResults = [],
  activeScenario = null,
}) {
  if (!prediction) return null;

  const confidence = prediction.Confidence_Score != null
    ? Math.round(prediction.Confidence_Score * 100)
    : null;
  const isLeak = prediction.Leak_Present === 1 && !prediction.Suppressed;
  const activeLeaks = stabilizeActiveLeaks(prediction, activeScenario);
  const isMulti = isMultiLeakPrediction(prediction) && activeLeaks.length >= 2;
  const topShap = prediction.top_5_sensors_driving_prediction?.[0];

  const cards = [];

  if (isLeak && isMulti) {
    activeLeaks.slice(0, 2).forEach((leak, idx) => {
      const leakConf = leak.confidence != null
        ? Math.round(leak.confidence * 100)
        : confidence;
      const leakRca = multiRcaResults[idx] || (idx === 0 ? rcaResult : null);
      const topCause = leakRca?.rankedCauses?.[0];
      cards.push({
        key: `leak-${idx}`,
        gradient: idx === 0 ? "gemini-card-leak" : "gemini-card-rca",
        iconType: "leak",
        title: idx === 0 ? "Primary Leak" : "Secondary Leak",
        value: formatLeakLocation(leak.location),
        sub: leakConf != null ? `${leakConf}% · ${leak.severity || "—"}` : null,
        pct: leakConf,
      });
      if (topCause) {
        const prob = parseFloat(String(topCause.probabilityPct).replace("%", "")) || 0;
        cards.push({
          key: `rca-${idx}`,
          gradient: idx === 0 ? "gemini-card-rca" : "gemini-card-shap",
          iconType: "rca",
          title: idx === 0 ? "Primary Root Cause" : "Secondary Root Cause",
          value: topCause.label,
          sub: topCause.probabilityPct,
          pct: prob,
        });
      }
    });
  } else if (isLeak) {
    const leakLoc = prediction.Leak_Location?.replace(/_/g, " ");
    const topCause = rcaResult?.rankedCauses?.[0];
    if (leakLoc && leakLoc !== "None") {
      cards.push({
        key: "leak",
        gradient: "gemini-card-leak",
        iconType: "leak",
        title: "Active Leak",
        value: leakLoc,
        sub: confidence != null ? `${confidence}% confidence` : null,
        pct: confidence,
      });
    }
    if (topCause) {
      const prob = parseFloat(String(topCause.probabilityPct).replace("%", "")) || 0;
      cards.push({
        key: "rca",
        gradient: "gemini-card-rca",
        iconType: "rca",
        title: "Top Root Cause",
        value: topCause.label,
        sub: topCause.probabilityPct,
        pct: prob,
      });
    }
  }

  if (topShap) {
    const dev = topShap.deviation_pct ?? 0;
    cards.push({
      key: "shap",
      gradient: "gemini-card-shap",
      iconType: "shap",
      title: "SHAP Driver",
      value: (topShap.sensor || "").replace(/_/g, " ").slice(0, 22),
      sub: `${dev >= 0 ? "+" : ""}${Number(dev).toFixed(1)}% deviation`,
      pct: Math.min(100, Math.abs(dev) * 3),
    });
  }

  const boost = liveReadings?.Boost_Pressure_kPa;
  if (boost != null) {
    const dev = ((boost - 111.7) / 111.7) * 100;
    cards.push({
      key: "boost",
      gradient: "gemini-card-sensor",
      iconType: "boost",
      title: "Boost Pressure",
      value: `${boost.toFixed(1)} kPa`,
      sub: `${dev >= 0 ? "+" : ""}${dev.toFixed(1)}% vs baseline`,
      pct: Math.min(100, Math.abs(dev) * 2),
    });
  }

  if (!cards.length) return null;

  return (
    <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cards.slice(0, 6).map((c) => (
        <div key={c.key} className={`gemini-insight-card ${c.gradient}`}>
          <div className="gemini-insight-glow" />
          <div className="relative z-10">
            <div className="mb-1.5 flex items-center gap-2">
              <AriaInsightIcon type={c.iconType} size={26} />
              <span className="text-[9px] font-bold uppercase tracking-wider text-white/55">{c.title}</span>
            </div>
            <p className="truncate text-[11px] font-semibold text-white">{c.value}</p>
            {c.sub && <p className="mt-0.5 truncate text-[9px] text-white/45">{c.sub}</p>}
            {c.pct != null && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`gemini-insight-bar gemini-insight-bar--${c.key}`}
                  style={{ width: `${Math.min(100, c.pct)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Welcome hero orb — large centerpiece with aurora */
export function GeminiHeroOrb({ compact = false, inline = false }) {
  const wrapClass = inline
    ? "gemini-hero-orb-wrap-inline"
    : compact
      ? "gemini-hero-orb-wrap-compact"
      : "";
  return (
    <div
      className={`gemini-hero-orb-wrap relative flex justify-center ${wrapClass}`}
      aria-hidden
    >
      <div className="gemini-hero-wave-aura">
        <div className="gemini-hero-wave gemini-hero-wave-1" />
        <div className="gemini-hero-wave gemini-hero-wave-2" />
        <div className="gemini-hero-wave gemini-hero-wave-3" />
      </div>
      <div className="gemini-hero-orb relative z-10">
        <div className="gemini-hero-orb-core" />
        <div className="gemini-hero-orb-ring" />
        <div className="gemini-hero-orb-spark gemini-spark-1" />
        <div className="gemini-hero-orb-spark gemini-spark-2" />
        <div className="gemini-hero-orb-spark gemini-spark-3" />
      </div>
    </div>
  );
}
