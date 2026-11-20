/**
 * ChatPanel.jsx — ARIA · SENTINEX AI Diagnostics
 * SENTINEX detects. ARIA explains.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  GeminiMessageShell,
  GeminiThinking,
  GeminiAmbientBg,
  GeminiContextCards,
  GeminiWaveHeader,
  GeminiWaveFooter,
  GeminiInputShell,
} from "./GeminiVisuals.jsx";
import AriaRobot, {
  buildPostAnswerInsight,
  AriaThinkingBar,
  AriaPostInsightBar,
  AriaWelcomeStatus,
} from "./AriaRobot.jsx";
import { AriaCapabilityCard } from "./AriaCapabilityLogo.jsx";
import DiagnosticsSidePanel from "./DiagnosticsSidePanel.jsx";
import DiagnosticsMetricsBar from "./DiagnosticsMetricsBar.jsx";
import DiagnosticsContextPills from "./DiagnosticsContextPills.jsx";
import NeuralNetworkArt from "./spline/NeuralNetworkArt.jsx";
import AriaVoiceControls from "./AriaVoiceControls.jsx";
import { useAriaVoice } from "../hooks/useAriaVoice.js";
import { getCachedPreference, saveUserPreferencesPatch } from "../lib/supabasePreferences.js";
import { truncateForSpeech } from "../utils/speechText.js";
import {
  isMultiLeakPrediction,
  stabilizeActiveLeaks,
  formatMultiLeakSummary,
} from "../utils/multiLeak.js";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  fontFamily: "Inter, system-ui, sans-serif",
  flowchart: { curve: "basis", useMaxWidth: true },
  themeVariables: {
    background: "#0a1120",
    primaryColor: "#1e3a5f",
    primaryTextColor: "#e2e8f0",
    primaryBorderColor: "#3b82f6",
    lineColor: "#64748b",
    secondaryColor: "#0f2040",
    tertiaryColor: "#0a1120",
    edgeLabelBackground: "#1e293b",
    clusterBkg: "#1e293b",
    clusterBorder: "#334155",
    nodeBorder: "#3b82f6",
    mainBkg: "#1e3a5f",
    nodeTextColor: "#e2e8f0",
    titleColor: "#94a3b8",
  }
});

// Counter for unique IDs
let mermaidCounter = 0;

function MermaidChart({ chart }) {
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!chart || !containerRef.current) return;
    setError(null);
    setReady(false);

    const id = `mc${++mermaidCounter}`;

    const doRender = async () => {
      try {
        // Validate syntax first — mermaid.parse throws on bad syntax
        await mermaid.parse(chart);
        const { svg } = await mermaid.render(id, chart);
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          // Make SVG responsive but prevent squishing horizontal graphs
          const svgEl = containerRef.current.querySelector("svg");
          if (svgEl) {
            svgEl.style.maxWidth = "none";
            svgEl.style.minWidth = "600px";
            svgEl.style.height = "auto";
          }
          setReady(true);
        }
      } catch (err) {
        // Show clean code fallback — not the mermaid bomb
        setError(chart);
      }
    };

    doRender();
  }, [chart]);

  if (error) {
    return (
      <div className="my-3 rounded-xl border border-sky-500/20 bg-[#0a1120] p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-sky-500">Process Flow</span>
        </div>
        <pre className="overflow-x-auto rounded-lg bg-black/30 p-3 text-[11px] leading-relaxed text-slate-300 font-mono whitespace-pre-wrap">
          {error}
        </pre>
      </div>
    );
  }

  return (
    <div className="my-3 rounded-xl border border-white/5 bg-[#0a1120] p-4 overflow-x-auto">
      <div className="mb-2 flex items-center gap-2">
        <div className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-sky-500">Process Flow Diagram</span>
      </div>
      <div ref={containerRef} className="flex justify-center" />
    </div>
  );
}

const SECTION_STYLES = {
  verdict: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  "key points": "border-sky-500/30 bg-sky-500/5 text-sky-300",
  "recommended action": "border-amber-500/30 bg-amber-500/5 text-amber-300",
  action: "border-amber-500/30 bg-amber-500/5 text-amber-300",
  default: "border-white/10 bg-white/[0.03] text-slate-400",
};

function sectionStyle(title) {
  const key = String(title).toLowerCase().replace(/[^a-z ]/g, "").trim();
  return SECTION_STYLES[key] || SECTION_STYLES.default;
}

function isCriticalText(text) {
  return /stop|immediately|critical|do not run|never run|shut down|pause test/i.test(text);
}

const ChatMarkdownComponents = {
  h2({ children }) {
    const label = String(children).replace(/\s+/g, " ").trim();
    const style = sectionStyle(label);
    return (
      <div className={`gemini-section-reveal mb-2 mt-4 flex items-center gap-2 rounded-lg border px-3 py-1.5 first:mt-0 ${style}`}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400 animate-pulse" />
        <span className="text-[10px] font-black uppercase tracking-[0.15em]">{label}</span>
      </div>
    );
  },
  h3({ children }) {
    return <h3 className="mb-2 mt-3 text-sm font-bold text-white">{children}</h3>;
  },
  p({ children }) {
    const text = String(children);
    if (isCriticalText(text)) {
      return (
        <div className="my-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-[13px] font-semibold leading-relaxed text-red-200">
          {children}
        </div>
      );
    }
    return <p className="mb-2.5 last:mb-0 text-[13px] leading-[1.65] text-slate-300">{children}</p>;
  },
  ul({ children }) {
    return <ul className="mb-3 space-y-2">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="mb-3 list-decimal space-y-2 pl-5 marker:text-sky-400">{children}</ol>;
  },
  li({ children }) {
    const text = String(children);
    const critical = isCriticalText(text);
    return (
      <li className={`flex gap-2.5 text-[13px] leading-[1.6] ${critical ? "text-red-200" : "text-slate-300"}`}>
        <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${critical ? "bg-red-400" : "bg-sky-400"}`} />
        <span className="min-w-0 flex-1">{children}</span>
      </li>
    );
  },
  strong({ children }) {
    const text = String(children);
    return (
      <strong className={`font-bold ${isCriticalText(text) ? "text-red-300" : "text-white"}`}>
        {children}
      </strong>
    );
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-3 rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-[13px] leading-relaxed text-amber-100">
        {children}
      </blockquote>
    );
  },
  hr() {
    return <hr className="my-3 border-white/8" />;
  },
  table({ children }) {
    return (
      <div className="my-3 overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-left text-[12px]">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="border-b border-white/10 bg-white/5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{children}</thead>;
  },
  th({ children }) {
    return <th className="px-3 py-2">{children}</th>;
  },
  td({ children }) {
    return <td className="border-t border-white/5 px-3 py-2 text-slate-300">{children}</td>;
  },
  code({ node, inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const lang = match ? match[1] : "";
    if (!inline && lang === "mermaid") {
      return <MermaidChart chart={String(children).trim()} />;
    }
    return !inline ? (
      <div className="my-2 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11px] text-sky-200">
        <code className={className} {...props}>{children}</code>
      </div>
    ) : (
      <code className="mx-0.5 rounded border border-sky-500/20 bg-sky-500/10 px-1.5 py-0.5 font-mono text-[12px] font-semibold text-sky-300" {...props}>
        {children}
      </code>
    );
  },
};

const MarkdownComponents = ChatMarkdownComponents;

/**
 * Replaces any incomplete (unclosed) ```mermaid blocks with a loading
 * placeholder so ReactMarkdown never tries to render a partial diagram.
 * Only applied while the message is still streaming.
 */
function sanitizeStreamingContent(content, isStreaming) {
  if (!isStreaming || !content) return content;
  // Split on triple-backtick boundaries
  const fence = "```";
  const parts = content.split(fence);
  // If even number of splits → odd number of ``` → last block is OPEN (unclosed)
  if (parts.length % 2 === 0) {
    const openBlock = parts[parts.length - 1];
    if (openBlock.trimStart().startsWith("mermaid")) {
      // Replace the open mermaid block with a spinner placeholder
      const closed = parts.slice(0, -1).join(fence);
      return closed + "\n\n*⟳ Generating diagram…*";
    }
  }
  return content;
}

// ─── Sensor short-name map ───────────────────────────────────────────────────
const SENSOR_SHORT = {
  Pre_Compressor_Pressure_kPa:   "Pre-Comp P",
  Post_Compressor_Pressure_kPa:  "Post-Comp P",
  CAC_Pressure_Drop_kPa:         "CAC ΔP",
  Exhaust_Manifold_Pressure_kPa: "Exh Manifold P",
  Exhaust_Manifold_Temp_C:       "Exh Temp",
  EGR_Flow_Rate_kgph:            "EGR Flow",
  Turbocharger_Speed_RPM:        "Turbo RPM",
  Boost_Pressure_kPa:            "Boost P",
  Post_CAC_Pressure_kPa:         "Post-CAC P",
  Intake_Manifold_Pressure_kPa:  "Intake P",
  MAF_Sensor_Reading_kgph:       "MAF",
};
const shortName = (s) => SENSOR_SHORT[s] ?? s.slice(0, 11);

// ─── Derive system state ─────────────────────────────────────────────────────
function getState(pred, activeScenario = null) {
  if (!pred) return "NOT_STREAMING";
  if (pred.Suppressed) return "TRANSITIONING";
  if (pred.Sensor_Fault_Isolation?.is_sensor_fault) return "SENSOR_FAULT";
  if (pred.Leak_Present === 1) {
    const activeLeaks = stabilizeActiveLeaks(pred, activeScenario);
    if (isMultiLeakPrediction(pred) && activeLeaks.length >= 2) return "MULTI_LEAK_DETECTED";
    return "LEAK_DETECTED";
  }
  if ((pred.Data_Quality?.score ?? 100) < 90) return "DATA_CLEANED";
  return "NORMAL";
}

// ─── Quick question chips ────────────────────────────────────────────────────
const CHIPS = {
  MULTI_LEAK_DETECTED: [
    "Explain both leaks — what failed?",
    "What do I inspect first for each leak?",
    "Are these independent failure modes?",
    "Compare SHAP drivers for primary vs secondary",
    "Can I keep running the engine?",
  ],
  LEAK_DETECTED:  ["Why did this leak happen?", "What do I inspect first?", "How serious is this?", "Explain the SHAP scores", "Can I keep running the engine?"],
  SENSOR_FAULT:   ["Is this a real leak or sensor fault?", "Which sensor is suspected?", "Why did SFI flag this?"],
  TRANSITIONING:  ["Why is detection suppressed?", "What is the Steady State Guard?"],
  NORMAL:         ["How does this system work?", "Explain the 7-stage pipeline", "What would a CAC leak look like?", "What is SHAP explainability?", "How does root cause analysis work?"],
  NOT_STREAMING:  ["How does this system work?", "Explain the 7-stage pipeline", "What would a CAC leak look like?", "What is SHAP explainability?", "How does root cause analysis work?"],
  DATA_CLEANED:   ["How does this system work?", "Explain the 7-stage pipeline", "What would a CAC leak look like?", "What is SHAP explainability?", "How does root cause analysis work?"],
};

// ─── State config ────────────────────────────────────────────────────────────
const STATE_CFG = {
  NORMAL:        { label: "NORMAL",          ring: "ring-emerald-500/30", dot: "bg-emerald-400",  bg: "bg-emerald-900/20",  text: "text-emerald-300" },
  MULTI_LEAK_DETECTED: { label: "MULTI-LEAK", ring: "ring-purple-500/50", dot: "bg-purple-400", bg: "bg-purple-900/25", text: "text-purple-300" },
  LEAK_DETECTED: { label: "LEAK DETECTED",   ring: "ring-red-500/50",     dot: "bg-red-400",      bg: "bg-red-900/25",      text: "text-red-300"     },
  SENSOR_FAULT:  { label: "SENSOR FAULT",    ring: "ring-amber-500/40",   dot: "bg-amber-400",    bg: "bg-amber-900/20",    text: "text-amber-300"  },
  TRANSITIONING: { label: "TRANSITIONING",   ring: "ring-slate-500/30",   dot: "bg-slate-400",    bg: "bg-slate-800/40",    text: "text-slate-300"  },
  DATA_CLEANED:  { label: "DATA CLEANED",    ring: "ring-sky-500/30",     dot: "bg-sky-400",      bg: "bg-sky-900/20",      text: "text-sky-300"    },
  NOT_STREAMING: { label: "NOT STREAMING",   ring: "ring-slate-700/30",   dot: "bg-slate-600",    bg: "bg-slate-900/30",    text: "text-slate-400"  },
};

// ─── Typing indicator (Gemini-style) ───────────────────────────────────────
const PROVIDER_LABELS = { claude: "Claude", gemini: "Gemini", groq: "Groq" };

function TypingDots({ onStop, provider }) {
  return (
    <GeminiThinking
      label={`ARIA · ${PROVIDER_LABELS[provider] || "AI"}`}
      onStop={onStop}
    />
  );
}

// ─── Welcome hero (empty chat state) ─────────────────────────────────────────
function formatEngineLabel(id) {
  return (id || "CAT_C13").replace(/_/g, " ");
}

const WELCOME_CAPABILITIES = [
  { id: "system", title: "System State", desc: "Live engine status & leak detection", prompt: "What is the current system state?" },
  { id: "sensors", title: "Sensor Readings", desc: "Deviations, baselines & SHAP scores", prompt: "Show me the key sensor deviations" },
  { id: "rca", title: "Root Cause Analysis", desc: "Ranked causes & inspection steps", prompt: "What are the ranked root causes?" },
  { id: "pipeline", title: "7-Stage Pipeline", desc: "DQ → SSG → ML → SFI → RCA flow", prompt: "Explain the 7-stage pipeline" },
];

function WelcomeHero({
  engineId,
  state,
  latestPrediction,
  liveReadings,
  rcaResult,
  multiRcaResults = [],
  activeScenario = null,
  chips,
  onChipClick,
  isStreaming,
  readingCount,
  responding,
  modelProvider,
}) {
  const isMulti = state === "MULTI_LEAK_DETECTED";
  const multiSummary = isMulti ? formatMultiLeakSummary(latestPrediction, activeScenario) : null;
  const leakLoc = latestPrediction?.Leak_Location?.replace(/_/g, " ");

  return (
    <div className="chat-welcome-content relative flex min-h-0 w-full flex-1 flex-col items-stretch justify-start">
      <div className="relative w-full">
        <GeminiMessageShell className="w-full max-w-none" welcome>
          <div className="p-4 md:p-5">
          {responding ? (
            <div className="aria-welcome-thinking mb-3">
              <AriaThinkingBar provider={modelProvider} compact />
            </div>
          ) : (
            <AriaWelcomeStatus
              latestPrediction={latestPrediction}
              rcaResult={rcaResult}
              isStreaming={isStreaming}
              readingCount={readingCount}
              state={state}
            />
          )}

          <div className="chat-welcome-aria-row mb-3">
            <div className="chat-assistant-orb shrink-0">
              <AriaRobot
                docked={false}
                avatarOnly
                responding={responding}
                state={state}
                latestPrediction={latestPrediction}
                rcaResult={rcaResult}
                isStreaming={isStreaming}
                readingCount={readingCount}
                className="aria-robot--inline aria-robot--welcome"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-400/80">SENTINEX</p>
              <h2 className="text-base font-bold tracking-tight text-white md:text-lg">
                ARIA
              </h2>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-400 md:text-sm">
                SENTINEX detects. ARIA explains.
                {state === "MULTI_LEAK_DETECTED" && multiSummary
                  ? <> Multi-leak context loaded: <span className="text-purple-300">{multiSummary}</span>.</>
                  : state === "LEAK_DETECTED" && leakLoc && leakLoc !== "None"
                  ? <> Active leak context loaded for <span className="text-orange-300">{leakLoc}</span>.</>
                  : <> Ask about sensors, SHAP, RCA, or the 7-stage pipeline.</>
                }
              </p>
            </div>
          </div>

          <DiagnosticsContextPills
            engineId={engineId}
            latestPrediction={latestPrediction}
            activeScenario={activeScenario}
          />

          <GeminiContextCards
            prediction={latestPrediction}
            liveReadings={liveReadings}
            rcaResult={rcaResult}
            multiRcaResults={multiRcaResults}
            activeScenario={activeScenario}
          />

          {/* Capability grid — holographic premium logos */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {WELCOME_CAPABILITIES.map((cap) => (
              <AriaCapabilityCard
                key={cap.id}
                cap={cap}
                onClick={onChipClick}
                systemState={state}
              />
            ))}
          </div>

          {/* Quick-start prompts */}
          <div>
            <p className="mb-2.5 text-[9px] font-bold uppercase tracking-widest text-slate-500">
              Try asking
            </p>
            <div className="flex flex-wrap gap-2">
              {chips.slice(0, 4).map((q, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onChipClick(q)}
                  className="rounded-full border border-sky-500/20 bg-sky-500/8 px-3.5 py-1.5 text-[11px] font-medium text-sky-200/90 transition-all hover:border-sky-400/40 hover:bg-sky-500/15 hover:text-sky-100"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
          </div>
        </GeminiMessageShell>

        <p className="mt-3 text-center text-[10px] text-slate-600">
          SENTINEX detects · ARIA explains · Live ML · SHAP · RCA
        </p>
      </div>
    </div>
  );
}
function ShapPill({ sensor, dev }) {
  const pos = dev > 0;
  const abs = Math.abs(dev);
  const color = abs > 15 ? (pos ? "bg-sky-900/30 border-sky-500/30 text-sky-300" : "bg-red-900/30 border-red-500/30 text-red-300")
               : abs > 5  ? "bg-amber-900/25 border-amber-500/25 text-amber-300"
               : "bg-white/[0.03] border-white/5 text-slate-400";
  return (
    <span className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${color}`}>
      <span>{shortName(sensor)}</span>
      <span>{pos ? "+" : ""}{dev.toFixed(1)}%</span>
    </span>
  );
}

export default function ChatPanel({
  onClose,
  role = null,
  latestPrediction,
  liveReadings,
  rcaResult,
  multiRcaResults = [],
  activeScenario = null,
  engineId,
  sessionEvents,
  isStreaming,
  dqpScore = 100,
  activeModelMetric = "—",
  opRpm,
  opLoad,
  readingCount = 0,
  boardTesters = [],
  ariaFocusTester = null,
  onAriaFocusTesterChange,
  cellTesterSummaries = [],
}) {
  const sessionsKey = role ? `cat_chat_sessions_${role}` : "cat_chat_sessions";

  const [chatSessions, setChatSessions] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(sessionsKey)) || [];
    } catch { return []; }
  });
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  const state = getState(latestPrediction, activeScenario);
  const cfg   = STATE_CFG[state];
  const chips = CHIPS[state] ?? CHIPS.NORMAL;

  const welcome = {
    id: "welcome",
    role: "assistant",
    isWelcome: true,
    content: `ARIA online. SENTINEX monitoring ${formatEngineLabel(engineId)}.`,
  };

  const [messages, setMessages]   = useState([welcome]);
  const [input, setInput]         = useState("");
  const [modelProvider, setModelProvider] = useState("claude");
  const [responding, setResponding] = useState(false);
  const [abortController, setAbortController] = useState(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [postInsight, setPostInsight] = useState(null);
  const [voiceReplyEnabled, setVoiceReplyEnabled] = useState(() => {
    try {
      const cached = getCachedPreference("ariaVoiceReplyEnabled", null);
      if (typeof cached === "boolean") return cached;
      return localStorage.getItem("cat_aria_voice_reply") !== "false";
    } catch {
      return true;
    }
  });
  const prevRespondingRef = useRef(false);
  const prevRespondingForSpeechRef = useRef(false);
  const sendRef = useRef(null);
  const endRef = useRef(null);
  const messagesRef = useRef(null);
  const inputRef = useRef(null);

  const handleVoiceTranscript = useCallback((text) => {
    const t = text.trim();
    if (!t) return;
    setInput(t);
    sendRef.current?.(t);
  }, []);

  const {
    supported: voiceSupported,
    listening: voiceListening,
    speaking: voiceSpeaking,
    liveTranscript: voiceLiveTranscript,
    toggleListening,
    speak: speakAria,
    stopSpeaking,
  } = useAriaVoice({ onFinalTranscript: handleVoiceTranscript });

  useEffect(() => {
    try {
      localStorage.setItem("cat_aria_voice_reply", voiceReplyEnabled ? "true" : "false");
    } catch {
      // ignore
    }
    void saveUserPreferencesPatch({ ariaVoiceReplyEnabled: voiceReplyEnabled });
  }, [voiceReplyEnabled]);

  useEffect(() => {
    if (voiceListening) {
      setInput(voiceLiveTranscript);
    }
  }, [voiceListening, voiceLiveTranscript]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(sessionsKey)) || [];
      setChatSessions(stored);
      setActiveSessionId(null);
      setMessages([welcome]);
    } catch {
      setChatSessions([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionsKey]);

  useEffect(() => {
    if (activeSessionId) {
      const session = chatSessions.find(s => s.id === activeSessionId);
      if (session) setMessages(session.messages);
    } else {
      setMessages([welcome]);
    }
  }, [activeSessionId]);

  useEffect(() => {
    if (messages.length <= 1 && !activeSessionId) return;
    setChatSessions(prev => {
      const sessionId = activeSessionId || `session-${Date.now()}`;
      if (!activeSessionId) setActiveSessionId(sessionId);
      
      const existingIdx = prev.findIndex(s => s.id === sessionId);
      const updatedSession = {
        id: sessionId,
        timestamp: existingIdx >= 0 ? prev[existingIdx].timestamp : Date.now(),
        messages: messages,
        preview: messages.length > 1 ? messages[1].content.slice(0, 40) + "..." : "New Chat"
      };

      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = updatedSession;
        return copy;
      }
      return [updatedSession, ...prev];
    });
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(sessionsKey, JSON.stringify(chatSessions));
  }, [chatSessions, sessionsKey]);

  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([welcome]);
    setShowHistory(false);
  };

  const handleDeleteSession = (id, e) => {
    e.stopPropagation();
    setChatSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) handleNewChat();
  };

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, responding]);

  useEffect(() => {
    if (responding) {
      setPostInsight(null);
    } else if (prevRespondingRef.current) {
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.id !== "welcome");
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      if (lastAssistant?.content?.trim()) {
        setPostInsight(buildPostAnswerInsight({
          latestPrediction,
          rcaResult,
          lastUserMessage: lastUser?.content || "",
          lastAssistantMessage: lastAssistant.content,
          state,
          isStreaming,
        }));
      }
    }
    prevRespondingRef.current = responding;
  }, [responding, messages, latestPrediction, rcaResult, state, isStreaming]);

  useEffect(() => {
    if (responding) {
      stopSpeaking();
    } else if (prevRespondingForSpeechRef.current && voiceReplyEnabled && voiceSupported.tts) {
      const lastAssistant = [...messages]
        .reverse()
        .find((m) => m.role === "assistant" && m.id !== "welcome" && m.content?.trim());
      if (lastAssistant && !lastAssistant.content.startsWith("⚠️")) {
        const speech = truncateForSpeech(lastAssistant.content);
        if (speech) speakAria(speech);
      }
    }
    prevRespondingForSpeechRef.current = responding;
  }, [responding, messages, voiceReplyEnabled, voiceSupported.tts, speakAria, stopSpeaking]);

  const send = useCallback(async (text) => {
    const t = text.trim();
    if (!t || responding) return;

    const userMsg = { id: `u-${Date.now()}`, role: "user", content: t };
    setMessages(p => [...p, userMsg]);
    setInput("");
    setResponding(true);

    const controller = new AbortController();
    setAbortController(controller);

    const history = [...messages, userMsg]
      .filter((m) => m.id !== "welcome")
      .map((m) => ({ role: m.role, content: m.content }));
    const recentEvents = (sessionEvents || []).slice(-5).map(e =>
      typeof e === "string" ? e : `[${e.type}] ${e.message}`
    );

    const payload = {
      messages: history,
      current_prediction: latestPrediction ?? null,
      live_readings: liveReadings ?? null,
      rca_result: rcaResult ?? null,
      multi_rca_results: multiRcaResults?.length ? multiRcaResults : null,
      demo_scenario: activeScenario ?? null,
      engine_id: engineId || "CAT_C13",
      session_events: recentEvents,
      model_provider: modelProvider,
      viewer_role: role,
      aria_focus_tester: ariaFocusTester,
      cell_tester_summaries: cellTesterSummaries?.length ? cellTesterSummaries : null,
    };

    let aiId = `a-${Date.now()}`;
    setMessages(p => [...p, { id: aiId, role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   aiText  = "";
      let   buffer  = "";

      let finished = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); 

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const d = line.slice(6);
          if (d === "[DONE]") { finished = true; break; }
          if (d.startsWith("[ERROR]")) { aiText += `\n⚠️ ${d}`; }
          else { aiText += d.replace(/\\n/g, "\n"); }
          
          setMessages(p => {
            const u = [...p];
            const l = u[u.length - 1];
            if (l?.id === aiId) u[u.length - 1] = { ...l, content: aiText };
            return u;
          });
        }
        if (finished) break;
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setMessages(p => {
          const u = [...p];
          const l = u[u.length - 1];
          if (l?.id === aiId) {
            u[u.length - 1] = { ...l, content: l.content + "\n\n*(Stopped by user)*" };
          }
          return u;
        });
      } else {
        setMessages(p => [...p, {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `⚠️ **Error:** ${err.message}`,
        }]);
      }
    } finally {
      setResponding(false);
      setAbortController(null);
      inputRef.current?.focus();
    }
  }, [messages, responding, latestPrediction, liveReadings, rcaResult, multiRcaResults, activeScenario, engineId, sessionEvents, modelProvider, role, ariaFocusTester, cellTesterSummaries]);

  sendRef.current = send;

  const handleSubmit = e => { e.preventDefault(); send(input); };

  const showWelcomeHero = messages.length === 1 && messages[0]?.id === "welcome";
  const visibleMessages = messages.filter((m) => m.id !== "welcome");

  return (
    <div className="diagnostics-layout">
      <DiagnosticsSidePanel
        role={role}
        boardTesters={boardTesters}
        ariaFocusTester={ariaFocusTester}
        onAriaFocusTesterChange={onAriaFocusTesterChange}
        latestPrediction={latestPrediction}
        rcaResult={rcaResult}
        multiRcaResults={multiRcaResults}
        activeScenario={activeScenario}
        isStreaming={isStreaming}
        readingCount={readingCount}
      />

    <div className="chat-panel-shell flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#060913] shadow-inner">

      {/* Toolbar with neural animation as inline background */}
      <div className="chat-toolbar shrink-0 relative overflow-hidden border-b border-white/[0.06] bg-[#080d1a]">
        <div className="ai-header-art ai-header-art-inline">
          <NeuralNetworkArt active compact />
        </div>
        <div className="relative z-10 flex items-center justify-between px-4 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            title="Back to dashboard"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>

          <button 
            onClick={() => setShowHistory(!showHistory)}
            className={`p-1.5 rounded hover:bg-white/10 transition-colors ${showHistory ? 'bg-white/10 text-sky-400' : 'text-slate-400'}`}
            title="Chat History"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </button>

          <div className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 ${cfg.ring} ${cfg.bg}`}>
            <span className={`h-2 w-2 rounded-full ${cfg.dot} ${state === "LEAK_DETECTED" || state === "MULTI_LEAK_DETECTED" ? "animate-pulse" : ""}`} />
            <span className={`text-[11px] font-black uppercase tracking-widest ${cfg.text}`}>
              {cfg.label}
              {(state === "LEAK_DETECTED" || state === "MULTI_LEAK_DETECTED") && latestPrediction?.Confidence_Score != null &&
                ` — ${(latestPrediction.Confidence_Score * 100).toFixed(1)}%`}
            </span>
          </div>
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-[10px] font-bold tracking-[0.14em] text-cyan-400/90">ARIA</span>
            <span className="text-[9px] text-slate-500">SENTINEX detects. ARIA explains.</span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {voiceSupported.tts && (
            <button
              type="button"
              className={`aria-voice-toolbar-toggle ${voiceReplyEnabled ? "active" : ""}`}
              onClick={() => setVoiceReplyEnabled((v) => !v)}
              title={voiceReplyEnabled ? "ARIA speaks answers in a warm feminine voice" : "Voice replies off"}
              aria-pressed={voiceReplyEnabled}
            >
              {voiceReplyEnabled ? "Voice on" : "Voice off"}
            </button>
          )}
          <select
            value={modelProvider}
            onChange={e => setModelProvider(e.target.value)}
            className="rounded border border-white/10 bg-[#0f172a] px-2 py-1 text-[11px] text-slate-300 outline-none hover:bg-white/10 transition-colors"
          >
            <option value="claude">Claude Sonnet 4.6</option>
            <option value="gemini">Gemini 2.5 Flash</option>
            <option value="groq">Groq Llama 3</option>
          </select>
        </div>
        </div>
      </div>

      <DiagnosticsMetricsBar
        latestPrediction={latestPrediction}
        liveReadings={liveReadings}
        isStreaming={isStreaming}
        dqpScore={dqpScore}
        activeModelMetric={activeModelMetric}
        opRpm={opRpm}
        opLoad={opLoad}
        readingCount={readingCount}
      />

      {/* Body: chat — history overlay + messages */}
      <div className="flex min-h-0 flex-1 overflow-hidden relative">

        {showHistory && (
          <div className="absolute inset-y-0 left-0 z-20 flex w-[280px] flex-col border-r border-white/5 bg-[#0a0f1d] shadow-2xl">
            <div className="shrink-0 border-b border-white/5 p-4">
              <button 
                onClick={handleNewChat}
                className="w-full py-2.5 rounded border border-white/10 bg-white/5 hover:bg-white/10 text-sm font-semibold text-slate-200 flex items-center justify-center gap-2 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                New Chat
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-1">
              {chatSessions.map(session => {
                const date = new Date(session.timestamp);
                const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                const dateStr = date.toLocaleDateString();
                const isActive = activeSessionId === session.id;
                
                return (
                  <div 
                    key={session.id}
                    onClick={() => { setActiveSessionId(session.id); setShowHistory(false); }}
                    className={`group relative p-3 rounded-lg cursor-pointer border transition-colors ${isActive ? 'bg-sky-900/20 border-sky-500/30' : 'bg-transparent border-transparent hover:bg-white/5'}`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className={`text-xs font-semibold ${isActive ? 'text-sky-300' : 'text-slate-300'}`}>
                        {dateStr}
                      </span>
                      <span className="text-[10px] text-slate-500">{timeStr}</span>
                    </div>
                    <p className={`text-[11px] truncate ${isActive ? 'text-sky-200/70' : 'text-slate-500'}`}>
                      {session.preview}
                    </p>
                    <button 
                      onClick={(e) => handleDeleteSession(session.id, e)}
                      className="absolute right-2 bottom-2 p-1 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                  </div>
                );
              })}
              {chatSessions.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-500">No previous chats.</div>
              )}
            </div>
          </div>
        )}

        {/* Chat column: fixed footer, scrollable messages only */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent">
          <GeminiWaveHeader active={responding} state={state} compact={showWelcomeHero} />

          <div
            ref={messagesRef}
            className={`relative z-[2] min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth ${showWelcomeHero ? "chat-messages-welcome" : "px-4 py-6 md:px-6"}`}
          >
            <GeminiAmbientBg state={state} active={responding} />

            {responding && !showWelcomeHero && (
              <div className="aria-thinking-sticky sticky top-0 z-30 -mx-1 mb-3">
                <AriaThinkingBar provider={modelProvider} compact />
              </div>
            )}

            {showWelcomeHero ? (
              <WelcomeHero
                engineId={engineId}
                state={state}
                latestPrediction={latestPrediction}
                liveReadings={liveReadings}
                rcaResult={rcaResult}
                multiRcaResults={multiRcaResults}
                activeScenario={activeScenario}
                chips={chips}
                onChipClick={send}
                isStreaming={isStreaming}
                readingCount={readingCount}
                responding={responding}
                modelProvider={modelProvider}
              />
            ) : (
              <>
              <div className="relative z-10 mb-4">
                <DiagnosticsContextPills
                  engineId={engineId}
                  latestPrediction={latestPrediction}
                  activeScenario={activeScenario}
                />
              </div>
              <div className="relative z-10 mb-6">
                  <GeminiContextCards
                    prediction={latestPrediction}
                    liveReadings={liveReadings}
                    rcaResult={rcaResult}
                    multiRcaResults={multiRcaResults}
                    activeScenario={activeScenario}
                  />
                </div>
              {visibleMessages.map((msg, idx) => {
              const isStreamingThis = responding && idx === visibleMessages.length - 1 && msg.role === "assistant";
              return (
                <div key={msg.id || idx} className={`relative z-10 mb-6 flex ${msg.role === "user" ? "justify-end" : "justify-start"} items-start gap-3`}>
                  {msg.role === "assistant" && (
                    <div className="mt-1 shrink-0">
                      <AriaRobot
                        docked={false}
                        avatarOnly
                        responding={isStreamingThis}
                        state={state}
                        latestPrediction={latestPrediction}
                        className="aria-robot--message"
                      />
                    </div>
                  )}
                  {msg.role === "user" ? (
                    <div className="gemini-user-bubble max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed text-white whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  ) : (
                    <GeminiMessageShell streaming={isStreamingThis}>
                      {isStreamingThis && !msg.content?.trim() ? (
                        <TypingDots onStop={() => abortController?.abort()} provider={modelProvider} />
                      ) : (
                        <div className="chat-answer">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                            {sanitizeStreamingContent(msg.content, isStreamingThis)}
                          </ReactMarkdown>
                        </div>
                      )}
                    </GeminiMessageShell>
                  )}
                </div>
              );
            })}
              </>
            )}
            <div ref={endRef} className="h-px shrink-0" />
          </div>

          {/* Fixed bottom: suggestion chips + input */}
          <div className="relative z-[3] shrink-0 border-t border-white/[0.05] bg-[#060913]">
            <GeminiWaveFooter active={responding} />
            {!responding && postInsight && visibleMessages.length > 0 && (
              <AriaPostInsightBar
                insight={postInsight}
                onDismiss={() => setPostInsight(null)}
                onAskFollowUp={() => {
                  const followUp = postInsight.type === "alert"
                    ? "What should we inspect first for this leak?"
                    : "Tell me more about this in the context of our engine";
                  send(followUp);
                }}
              />
            )}
            <div className="relative z-10 overflow-x-auto whitespace-nowrap px-4 py-2.5 scrollbar-hide">
            <div className="flex gap-1.5">
              {chips.map((q, i) => (
                <button key={i} type="button" onClick={() => send(q)} disabled={responding}
                  className="shrink-0 rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-[11px] text-slate-400 transition-all hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-sky-300 disabled:opacity-40"
                >
                  {q}
                </button>
              ))}
            </div>
            </div>

          <div className="relative z-10 border-t border-white/[0.06] bg-[#080c19] px-4 py-3">
            <AriaVoiceControls
              supported={voiceSupported}
              listening={voiceListening}
              speaking={voiceSpeaking}
              voiceReplyEnabled={voiceReplyEnabled}
              onToggleListen={toggleListening}
              onToggleVoiceReply={() => setVoiceReplyEnabled((v) => !v)}
              onStopSpeaking={stopSpeaking}
              disabled={responding}
              liveTranscript={voiceLiveTranscript}
            />
            <GeminiInputShell active={responding || voiceListening} focused={inputFocused}>
            <form onSubmit={handleSubmit} className="mt-2 flex gap-2">
              <button
                type="button"
                className={`aria-voice-input-mic shrink-0 ${voiceListening ? "active" : ""}`}
                onClick={toggleListening}
                disabled={responding || !voiceSupported.stt}
                title={voiceListening ? "Stop listening" : "Speak to ARIA"}
                aria-label={voiceListening ? "Stop voice input" : "Start voice input"}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14a3 3 0 003-3V7a3 3 0 10-6 0v4a3 3 0 003 3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0M12 19v3" />
                </svg>
              </button>
              <input
                ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)} disabled={responding}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder={voiceListening ? "Listening… speak your question" : "Ask ARIA about engine state, leaks, SHAP, RCA…"}
                className="w-full rounded-xl border border-white/8 bg-white/[0.05] px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-sky-500/40 focus:bg-white/[0.07] focus:ring-1 focus:ring-sky-500/20 disabled:opacity-50"
              />
              <button
                type="submit"
                id="chat-send-btn"
                disabled={responding || !input.trim()}
                className="shrink-0 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:from-blue-500 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-40 flex items-center gap-2"
              >
                {responding
                  ? <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  : <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                }
                Send
              </button>
            </form>
            </GeminiInputShell>
          </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
