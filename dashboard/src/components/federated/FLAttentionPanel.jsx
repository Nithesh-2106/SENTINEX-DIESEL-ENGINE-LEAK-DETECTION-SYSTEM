import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { getFlClientPins } from "../../data/indiaStates.js";
import { samplePriorPct } from "../../utils/federatedWeights.js";

const FL_CLIENTS = getFlClientPins();
const FED_INTERVAL = 50;

function IconFullscreen({ exit }) {
  if (exit) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M9 3H5a2 2 0 00-2 2v4M15 3h4a2 2 0 012 2v4M9 21H5a2 2 0 01-2-2v-4M15 21h4a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function cityLabel(f) {
  const city = (f.city || f.name || "Node").trim();
  const state = (f.state || "").trim();
  if (!state) return `${city} Test Cell`;
  return `${city} Test Cell (${state})`;
}

function AttentionBar({ label, value, pct, color, rgb }) {
  const widthPct = Math.max(6, Math.min(100, pct * 100));

  return (
    <div className="fl-attn-bar">
      <div className="fl-attn-bar__head">
        <span className="fl-attn-bar__label">{label}</span>
        <span className="fl-attn-bar__vals mono" style={{ color }}>
          {value.toFixed(4)}
          <span className="fl-attn-bar__pct"> ({(pct * 100).toFixed(1)}%)</span>
        </span>
      </div>
      <div className="fl-attn-bar__track">
        <div
          className="fl-attn-bar__fill"
          style={{
            width: `${widthPct}%`,
            background: `linear-gradient(90deg, rgba(${rgb},0.35), ${color})`,
            boxShadow: `0 0 6px rgba(${rgb},0.45)`,
          }}
        />
      </div>
    </div>
  );
}

function SessionMetric({ label, value, tone = "cyan" }) {
  return (
    <div className={`fl-attn-kpi fl-attn-kpi--${tone}`}>
      <span className="k">{label}</span>
      <span className="v mono">{value}</span>
    </div>
  );
}

/** FedAvg attention weight bars + live session metrics. */
export default function FLAttentionPanel({
  currentRound = 0,
  currentPhase = "idle",
  phaseProgress = 0,
  facilityStates = {},
  isRunning = false,
  globalF1 = null,
  globalLoss = null,
  localSpread = null,
  totalWeightsSent = "0 KB",
  compressionRatio = 0,
  avgRoundTime = 0,
  convergence = null,
  sessionBestF1 = 0,
  clientCount = 4,
}) {
  const clients = useMemo(
    () =>
      FL_CLIENTS.map((f) => ({
        id: f.id,
        label: cityLabel(f),
        color: f.colour,
        rgb: f.colourRGB,
      })),
    [],
  );

  const samplePriors = useMemo(() => samplePriorPct(clients), [clients]);

  const weights = useMemo(() => {
    const raw = clients.map((c) => {
      const live = facilityStates[c.id]?.weightPct;
      if (live != null && live > 0) return live;
      return samplePriors[c.id] ?? 0;
    });
    const total = raw.reduce((a, b) => a + b, 0) || 1;
    return clients
      .map((c, i) => ({
        ...c,
        raw: raw[i],
        normalized: raw[i] / total,
      }))
      .sort((a, b) => b.normalized - a.normalized);
  }, [clients, facilityStates, samplePriors]);

  const ttiCounter = useMemo(() => {
    const base = currentRound * FED_INTERVAL;
    const tick = isRunning ? Math.floor(phaseProgress * FED_INTERVAL) : 0;
    return base + tick;
  }, [currentRound, phaseProgress, isRunning]);

  const avgLocalF1 = useMemo(() => {
    const f1s = clients
      .map((c) => facilityStates[c.id]?.localF1)
      .filter((v) => v != null);
    if (!f1s.length) return null;
    return f1s.reduce((a, b) => a + b, 0) / f1s.length;
  }, [clients, facilityStates]);

  const convText =
    convergence != null
      ? `${convergence >= 0 ? "↓" : "↑"} ${Math.abs(convergence).toFixed(4)}`
      : "—";

  const panelRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(document.fullscreenElement === panelRef.current);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = panelRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      /* unsupported */
    }
  }, []);

  return (
    <aside
      ref={panelRef}
      className={`fl-attention-panel fl-attention-panel--bars${isFullscreen ? " fl-attention-panel--fullscreen" : ""}`}
      aria-label="Attention weights"
    >
      <div className="fl-attention-panel__head">
        <div className="fl-attention-panel__head-text">
          <div className="fl-attention-panel__title">ATTENTION WEIGHTS</div>
          <p className="fl-attention-panel__hint">FedAvg contribution per client · softmax over sample size + local F1</p>
        </div>
        <button
          type="button"
          className="fl-attention-panel__fs-btn"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen attention panel"}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          <IconFullscreen exit={isFullscreen} />
        </button>
      </div>

      <div className="fl-attention-panel__meta-chips">
        <div className="fl-attn-chip">
          <span className="fl-attn-chip__k">Round</span>
          <span className="fl-attn-chip__v mono">{currentRound}</span>
        </div>
        <div className="fl-attn-chip">
          <span className="fl-attn-chip__k">TTI</span>
          <span className="fl-attn-chip__v mono">{ttiCounter.toLocaleString()}</span>
        </div>
        <div className="fl-attn-chip">
          <span className="fl-attn-chip__k">Phase</span>
          <span className="fl-attn-chip__v mono">{currentPhase.toUpperCase()}</span>
        </div>
        <div className="fl-attn-chip">
          <span className="fl-attn-chip__k">Clients</span>
          <span className="fl-attn-chip__v mono">{clientCount}</span>
        </div>
      </div>

      <div className="fl-attention-panel__bars-title">AGENT ATTENTION MODEL WEIGHTS</div>
      <div className="fl-attention-panel__bars">
        {weights.map((node) => (
          <AttentionBar
            key={node.id}
            label={node.label}
            value={node.normalized}
            pct={node.normalized}
            color={node.color}
            rgb={node.rgb}
          />
        ))}
      </div>

      <div className="fl-attention-panel__bars-title fl-attention-panel__bars-title--session">
        SESSION SIMULATION METRICS
      </div>
      <div className="fl-attention-panel__kpis">
        <SessionMetric
          label="GLOBAL F1"
          value={globalF1 != null ? `${(globalF1 * 100).toFixed(2)}%` : "—"}
          tone="ok"
        />
        <SessionMetric
          label="BEST F1"
          value={sessionBestF1 ? `${(sessionBestF1 * 100).toFixed(2)}%` : "—"}
          tone="ok"
        />
        <SessionMetric
          label="AVG LOCAL F1"
          value={avgLocalF1 != null ? `${(avgLocalF1 * 100).toFixed(2)}%` : "—"}
          tone="cyan"
        />
        <SessionMetric
          label="GLOBAL LOSS"
          value={globalLoss != null ? globalLoss.toFixed(4) : "—"}
          tone="amber"
        />
        <SessionMetric
          label="LOCAL SPREAD"
          value={localSpread != null ? `${(localSpread * 100).toFixed(2)}%` : "—"}
          tone="violet"
        />
        <SessionMetric label="Δ LOSS / RD" value={convText} tone="cyan" />
        <SessionMetric label="WEIGHTS SENT" value={totalWeightsSent} tone="cyan" />
        <SessionMetric
          label="PRIVACY"
          value={compressionRatio > 0 ? `${compressionRatio.toFixed(0)}×` : "—"}
          tone="violet"
        />
        <SessionMetric
          label="AVG ROUND"
          value={avgRoundTime ? `${(avgRoundTime / 1000).toFixed(1)}s` : "—"}
          tone="amber"
        />
      </div>

      {isRunning && (
        <div className="fl-attention-panel__live">
          <span className="fl-attention-panel__live-dot" />
          LIVE
        </div>
      )}
    </aside>
  );
}
