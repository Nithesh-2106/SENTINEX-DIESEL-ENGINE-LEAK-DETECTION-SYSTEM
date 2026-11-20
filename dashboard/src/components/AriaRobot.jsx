import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  stabilizeActiveLeaks,
  formatLeakLocation,
  formatMultiLeakSummary,
  isMultiLeakPrediction,
} from "../utils/multiLeak.js";

const IDLE_TIPS = [
  "SENTINEX detects. ARIA explains.",
  "Ask me about SHAP drivers or RCA ranked causes.",
  "I can walk you through the 7-stage pipeline.",
  "Try: \"What should we inspect first?\"",
];

function buildLiveTips({ latestPrediction, rcaResult, multiRcaResults = [], activeScenario = null, isStreaming, readingCount }) {
  const tips = [];
  const leak = latestPrediction?.Leak_Present === 1 && !latestPrediction?.Suppressed;
  const activeLeaks = stabilizeActiveLeaks(latestPrediction, activeScenario);
  const isMulti = isMultiLeakPrediction(latestPrediction) && activeLeaks.length >= 2;
  const conf = latestPrediction?.Confidence_Score != null
    ? `${(latestPrediction.Confidence_Score * 100).toFixed(1)}%`
    : "—";
  const dqp = latestPrediction?.Data_Quality?.score;

  if (leak && isMulti) {
    const summary = formatMultiLeakSummary(latestPrediction, activeScenario);
    tips.push({ type: "alert", text: `Multi-leak: ${summary} · confidence ${conf}` });
    activeLeaks.slice(0, 2).forEach((leakDetail, idx) => {
      const leakRca = multiRcaResults[idx] || (idx === 0 ? rcaResult : null);
      if (leakRca?.rankedCauses?.[0]) {
        tips.push({
          type: idx === 0 ? "insight" : "warn",
          text: `${idx === 0 ? "Primary" : "Secondary"} RCA (${formatLeakLocation(leakDetail.location)}): ${leakRca.rankedCauses[0].label} (${leakRca.rankedCauses[0].probabilityPct})`,
        });
      }
    });
  } else if (leak) {
    const loc = latestPrediction?.Leak_Location?.replace(/_/g, " ") || "Normal";
    tips.push({ type: "alert", text: `Leak flagged at ${loc} · confidence ${conf}` });
    if (rcaResult?.rankedCauses?.[0]) {
      tips.push({
        type: "insight",
        text: `Top RCA: ${rcaResult.rankedCauses[0].label} (${rcaResult.rankedCauses[0].probabilityPct})`,
      });
    }
  } else {
    tips.push({ type: "ok", text: "Engine steady — no active leak signature." });
  }

  if (dqp != null && dqp < 85) {
    tips.push({ type: "warn", text: `Data quality ${dqp}/100 — check flagged sensors before trusting ML.` });
  }

  const topShap = latestPrediction?.top_5_sensors_driving_prediction?.[0];
  if (topShap?.sensor) {
    tips.push({
      type: "insight",
      text: `SHAP lead: ${topShap.sensor.replace(/_/g, " ")} (${topShap.shap_impact})`,
    });
  }

  tips.push({
    type: "news",
    text: isStreaming
      ? `Live stream active · ${readingCount} readings processed.`
      : "Stream paused — predictions use last steady reading.",
  });

  tips.push({
    type: "news",
    text: "Federated learning sync improves cross-cell leak recall without sharing raw data.",
  });

  return tips;
}

export function buildPostAnswerInsight({
  latestPrediction,
  rcaResult,
  lastUserMessage = "",
  lastAssistantMessage = "",
  state = "NORMAL",
  isStreaming = false,
}) {
  const userQ = lastUserMessage.toLowerCase();
  const answer = lastAssistantMessage.toLowerCase();
  const leak = latestPrediction?.Leak_Present === 1 && !latestPrediction?.Suppressed;
  const loc = latestPrediction?.Leak_Location?.replace(/_/g, " ");
  const conf = latestPrediction?.Confidence_Score != null
    ? `${(latestPrediction.Confidence_Score * 100).toFixed(1)}%`
    : null;

  if (/federated|cross.?cell|hosur|pune|bengaluru|\bfl\b/i.test(userQ) || /federated/i.test(answer)) {
    return {
      type: "insight",
      text: "FL insight: Cells train locally; only model weights sync — raw sensor traces never leave each facility.",
    };
  }

  if (/shap|explain|sensor.*driv|which sensor/i.test(userQ) || /shap/i.test(answer)) {
    const top = latestPrediction?.top_5_sensors_driving_prediction?.[0];
    if (top?.sensor) {
      return {
        type: "insight",
        text: `SHAP watch: ${top.sensor.replace(/_/g, " ")} is the strongest driver (${top.shap_impact}) — cross-check in Digital Twin.`,
      };
    }
  }

  if (/rca|root cause|inspect|hypothes|failure/i.test(userQ) || /root cause|rca/i.test(answer)) {
    const cause = rcaResult?.rankedCauses?.[0];
    if (cause) {
      return {
        type: "insight",
        text: `RCA action: ${cause.label} (${cause.probabilityPct}) — verify inspection steps in the twin view.`,
      };
    }
  }

  if (/pipeline|stage|steady guard|\bdq\b|data quality/i.test(userQ)) {
    return {
      type: "news",
      text: "Pipeline tip: DQ → Steady Guard → ML → SFI → RCA — ask me to walk through any stage.",
    };
  }

  if (/leak|severity|location|detect/i.test(userQ) && leak && loc && loc !== "None") {
    const cause = rcaResult?.rankedCauses?.[0];
    if (cause) {
      return {
        type: "alert",
        text: `Leak at ${loc} (${conf}) · top RCA: ${cause.label}. Review SHAP drivers before the next run.`,
      };
    }
  }

  if (state === "LEAK_DETECTED" && leak && loc && loc !== "None") {
    const cause = rcaResult?.rankedCauses?.[0];
    if (cause) {
      return {
        type: "alert",
        text: `Active leak at ${loc} · ${conf} confidence. Top RCA: ${cause.label} — prioritize physical inspection.`,
      };
    }
    return {
      type: "alert",
      text: `Leak flagged at ${loc} · ${conf} confidence. Check sensor deviations in Digital Twin before resuming.`,
    };
  }

  const dqp = latestPrediction?.Data_Quality?.score;
  if (dqp != null && dqp < 85) {
    return {
      type: "warn",
      text: `Data quality ${dqp}/100 — validate flagged channels before trusting ML outputs.`,
    };
  }

  if (!isStreaming) {
    return {
      type: "ok",
      text: "Stream paused — context reflects last steady reading. Resume simulator for live updates.",
    };
  }

  return {
    type: "ok",
    text: "Engine steady. Ask about specific sensors, SHAP rankings, or inspection priorities.",
  };
}

export function AriaWelcomeStatus({ latestPrediction, rcaResult, isStreaming, readingCount, state }) {
  const tips = buildLiveTips({ latestPrediction, rcaResult, isStreaming, readingCount });
  const primary = tips[0];
  if (!primary) return null;

  return (
    <div className={`aria-welcome-status aria-welcome-status--${primary.type}`} role="status">
      <span className="aria-welcome-status-dot" aria-hidden />
      <div className="aria-welcome-status-copy">
        <span className="aria-welcome-status-label">ARIA · Live context</span>
        <p className="aria-welcome-status-text">{primary.text}</p>
      </div>
    </div>
  );
}

export function AriaThinkingBar({ provider = "claude", compact = false }) {
  const labels = { claude: "Claude", gemini: "Gemini", groq: "Groq" };
  return (
    <div className={`aria-thinking-bar ${compact ? "aria-thinking-bar--compact" : ""}`} role="status" aria-live="polite">
      <div className="aria-thinking-bar-robot" aria-hidden>
        <span className="aria-thinking-bar-eye" />
        <span className="aria-thinking-bar-eye" />
      </div>
      <div className="aria-thinking-bar-copy">
        <span className="aria-thinking-bar-label">ARIA · {labels[provider] || "AI"}</span>
        <span className="aria-thinking-bar-text">Composing response from live engine context</span>
      </div>
      <div className="aria-thinking-bar-dots" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="aria-thinking-bar-dot" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}

export function AriaPostInsightBar({ insight, onDismiss, onAskFollowUp }) {
  if (!insight?.text) return null;

  return (
    <div className={`aria-post-insight aria-post-insight--${insight.type || "ok"}`}>
      <div className="aria-post-insight-robot" aria-hidden>
        <div className="aria-post-insight-head">
          <span className="aria-post-insight-eye" />
          <span className="aria-post-insight-eye" />
        </div>
        <span className="aria-post-insight-core">S</span>
      </div>
      <div className="aria-post-insight-body">
        <span className="aria-post-insight-label">ARIA · Context insight</span>
        <p className="aria-post-insight-text">{insight.text}</p>
      </div>
      <div className="aria-post-insight-actions">
        {onAskFollowUp && (
          <button type="button" className="aria-post-insight-btn" onClick={onAskFollowUp}>
            Ask more
          </button>
        )}
        {onDismiss && (
          <button type="button" className="aria-post-insight-dismiss" onClick={onDismiss} aria-label="Dismiss insight">
            ×
          </button>
        )}
      </div>
    </div>
  );
}

export default function AriaRobot({
  responding = false,
  state = "NORMAL",
  latestPrediction,
  rcaResult,
  isStreaming,
  readingCount = 0,
  onTipClick,
  className = "",
  docked = true,
  showBubble = true,
  avatarOnly = false,
}) {
  const wrapRef = useRef(null);
  const [tipIdx, setTipIdx] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [blink, setBlink] = useState(false);
  const [mood, setMood] = useState("idle");

  const liveTips = useMemo(
    () => buildLiveTips({ latestPrediction, rcaResult, isStreaming, readingCount }),
    [latestPrediction, rcaResult, isStreaming, readingCount]
  );

  const allTips = useMemo(() => [...liveTips, ...IDLE_TIPS.map((t) => ({ type: "idle", text: t }))], [liveTips]);
  const currentTip = allTips[tipIdx % allTips.length];

  const isMessageAvatar = className.includes("aria-robot--message");

  useEffect(() => {
    if (avatarOnly || isMessageAvatar) {
      setMood(responding ? "thinking" : "idle");
      return;
    }
    setMood(responding ? "thinking" : state === "LEAK_DETECTED" ? "alert" : hovered ? "engage" : "idle");
  }, [responding, state, hovered, avatarOnly, isMessageAvatar]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!hovered && !responding) setTipIdx((i) => i + 1);
    }, 7000);
    return () => clearInterval(id);
  }, [hovered, responding]);

  useEffect(() => {
    const id = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 120);
    }, 3200 + Math.random() * 2000);
    return () => clearInterval(id);
  }, []);

  const onPointerMove = useCallback((e) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - rect.left - rect.width / 2) / rect.width;
    const dy = (e.clientY - rect.top - rect.height / 2) / rect.height;
    el.style.setProperty("--aria-look-x", `${dx * 8}px`);
    el.style.setProperty("--aria-look-y", `${dy * 4}px`);
  }, []);

  const cycleTip = () => {
    if (avatarOnly || isMessageAvatar || responding) return;
    setTipIdx((i) => i + 1);
    onTipClick?.(allTips[(tipIdx + 1) % allTips.length]?.text);
  };

  const bubbleVisible =
    showBubble &&
    !responding &&
    !avatarOnly &&
    !isMessageAvatar &&
    (hovered || mood === "alert");

  return (
    <div
      ref={wrapRef}
      className={`aria-robot ${docked ? "aria-robot--docked" : ""} aria-robot--${mood} ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerMove={onPointerMove}
      onClick={cycleTip}
      role="img"
      aria-label="ARIA assistant robot"
      title={avatarOnly || isMessageAvatar ? undefined : "ARIA — click for next insight"}
    >
      {bubbleVisible && (
        <div className={`aria-robot-bubble aria-robot-bubble--${currentTip?.type || "idle"}`}>
          <span className="aria-robot-bubble-label">ARIA</span>
          <p>{currentTip?.text}</p>
        </div>
      )}

      <div className="aria-robot-body">
        <div className="aria-robot-antenna" />
        <div className="aria-robot-head" style={{ transform: `translate(var(--aria-look-x, 0), var(--aria-look-y, 0))` }}>
          <div className="aria-robot-face">
            <span className={`aria-robot-eye aria-robot-eye--l ${blink ? "blink" : ""}`} />
            <span className={`aria-robot-eye aria-robot-eye--r ${blink ? "blink" : ""}`} />
            <span className="aria-robot-mouth" />
          </div>
        </div>
        <div className="aria-robot-torso">
          <span className="aria-robot-core">S</span>
        </div>
        <div className="aria-robot-arm aria-robot-arm--l" />
        <div className={`aria-robot-arm aria-robot-arm--r ${responding ? "wave" : ""}`} />
        <div className="aria-robot-base" />
        {responding && !avatarOnly && !isMessageAvatar && <div className="aria-robot-think-ring" aria-hidden />}
      </div>
    </div>
  );
}

export function AriaInsightRail({
  latestPrediction,
  rcaResult,
  multiRcaResults = [],
  activeScenario = null,
  isStreaming,
  readingCount,
}) {
  const tips = buildLiveTips({
    latestPrediction,
    rcaResult,
    multiRcaResults,
    activeScenario,
    isStreaming,
    readingCount,
  });

  return (
    <section className="aria-insight-rail">
      <div className="aria-insight-header">
        <div>
          <p className="aria-insight-eyebrow">SENTINEX · LIVE</p>
          <h3 className="aria-insight-title">ARIA Briefing</h3>
          <p className="aria-insight-tagline">SENTINEX detects. ARIA explains.</p>
        </div>
        <div className="aria-insight-badge">AI</div>
      </div>
      <ul className="aria-insight-list">
        {tips.map((tip, i) => (
          <li key={i} className={`aria-insight-item aria-insight-item--${tip.type}`}>
            <span className="aria-insight-dot" />
            <span>{tip.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
