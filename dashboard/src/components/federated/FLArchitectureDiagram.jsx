import {
  useMemo,
  useRef,
  useLayoutEffect,
  useState,
  useCallback,
  useEffect,
  forwardRef,
} from "react";
import { getFlClientPins } from "../../data/indiaStates.js";
import { samplePriorPct } from "../../utils/federatedWeights.js";
import { CATERPILLAR_FACILITIES } from "../../constants/federatedFacilities.js";

const FL_CLIENTS = getFlClientPins();
const FED_INTERVAL = 50;
const WEIGHTS_KB_PER_ROUND = 93.5;

const STAGES = [
  { id: 1, title: "LOCAL TRAIN", sub: "RF + XGB + NN on private data", key: "training" },
  { id: 2, title: "TRANSMIT", sub: "Weights only", key: "transmitting" },
  { id: 3, title: "FEDAVG", sub: "Weighted aggregation", key: "aggregating" },
  { id: 4, title: "BROADCAST", sub: "Global model → cells", key: "broadcasting" },
  { id: 5, title: "EVALUATE", sub: "Cross-facility F1", key: "evaluating" },
];

const MODEL_TAGS = ["RF", "XGB", "NN"];
const PHASE_ORDER = ["training", "transmitting", "aggregating", "broadcasting", "evaluating"];

function stageState(stageKey, currentPhase) {
  if (currentPhase === stageKey) return "active";
  const cur = PHASE_ORDER.indexOf(currentPhase);
  const idx = PHASE_ORDER.indexOf(stageKey);
  if (cur === -1 || idx === -1) return "idle";
  return idx < cur ? "done" : "idle";
}

function shortState(state = "") {
  const map = {
    "Tamil Nadu": "Tamil Nadu",
    Karnataka: "Karnataka",
    Maharashtra: "Maharashtra",
  };
  return map[state] || state;
}

function shortCity(city = "") {
  const c = city.toUpperCase();
  if (c.startsWith("BENGALURU")) return "BENGALURU";
  if (c.startsWith("HOSUR")) return "HOSUR";
  if (c.startsWith("CHENNAI")) return "CHENNAI";
  if (c.startsWith("PUNE")) return "PUNE";
  return c;
}

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

function MiniSparkline({ color, active }) {
  const heights = [40, 68, 52, 82, 58];
  return (
    <svg className="fl-process-eval__spark" viewBox="0 0 40 16" aria-hidden>
      {heights.map((h, i) => (
        <rect
          key={i}
          x={2 + i * 8}
          y={16 - (h / 100) * 14}
          width="5"
          height={(h / 100) * 14}
          rx="1"
          fill={active ? color : "rgba(255,255,255,0.22)"}
          opacity={active ? 0.9 : 0.45}
        />
      ))}
    </svg>
  );
}

function hubSurfacePoint(cx, cy, rx, ry, tx, ty) {
  const dx = tx - cx;
  const dy = ty - cy;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x: cx - rx, y: cy };
  }
  const scale = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function buildWeightExplanation(client, facilityState, samplePrior, allClients) {
  const trainRows = facilityState?.trainRows ?? client.trainRows ?? 0;
  const localF1 = facilityState?.localF1;
  const weightPct = facilityState?.weightPct ?? client.weightPct ?? samplePrior;
  const prior = samplePrior ?? 0;

  const maxRows = Math.max(...allClients.map((c) => c.trainRows || 0), 1);
  const maxWeight = Math.max(...allClients.map((c) => c.weightPct ?? 0), 1);
  const isLeader = weightPct >= maxWeight - 0.5;

  const reasons = [];
  if (trainRows >= maxRows * 0.9) {
    reasons.push(`Largest private dataset (${trainRows.toLocaleString()} training rows) — sample-size prior ≈ ${prior.toFixed(1)}%.`);
  } else {
    reasons.push(`${trainRows.toLocaleString()} local rows · sample prior ≈ ${prior.toFixed(1)}%.`);
  }
  if (localF1 != null) {
    reasons.push(`Local validation F1 = ${(localF1 * 100).toFixed(2)}% boosts attention in softmax(log n + (F1−0.5)/τ).`);
  }
  if (isLeader) {
    reasons.push("Highest combined score this round → FedAvg assigns the largest aggregation weight α.");
  } else {
    reasons.push("Lower α because this cell has fewer rows and/or lower local F1 this round.");
  }

  return {
    title: `${client.city} Test Cell`,
    weightPct,
    trainRows,
    localF1,
    prior,
    reasons,
    formula: "α_k = softmax( log(n_k+1) + (localF1_k − 0.5) / 0.1 )",
  };
}

function WeightInfoPane({ info, onClose }) {
  if (!info) return null;
  return (
    <div className="fl-weight-info-pane liquid-glass-card" role="dialog" aria-label="Attention weight details">
      <div className="fl-weight-info-pane__head">
        <strong>{info.title}</strong>
        <button type="button" className="fl-weight-info-pane__close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="fl-weight-info-pane__alpha mono" style={{ color: info.colour }}>
        α = {info.weightPct.toFixed(2)}%
      </div>
      <div className="fl-weight-info-pane__grid">
        <span><em>Training rows</em><b className="mono">{info.trainRows.toLocaleString()}</b></span>
        <span><em>Sample prior</em><b className="mono">{info.prior.toFixed(1)}%</b></span>
        <span><em>Local F1</em><b className="mono">{info.localF1 != null ? `${(info.localF1 * 100).toFixed(2)}%` : "—"}</b></span>
        <span><em>Payload</em><b className="mono">{info.kbPerClient} KB</b></span>
      </div>
      <p className="fl-weight-info-pane__formula mono">{info.formula}</p>
      <ul className="fl-weight-info-pane__reasons">
        {info.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <p className="fl-weight-info-pane__note">
        KB = kilobytes of encrypted model weights uploaded per round (not raw sensor data).
        θ<sub>global</sub> is the aggregated global model broadcast back to every cell.
      </p>
    </div>
  );
}

function useHubSpokePaths(gridRef, trainRefs, evalRefs, hubRef, clients, transmitKbPerClient, deps = []) {
  const [paths, setPaths] = useState([]);
  const rowCount = clients.length;

  const measure = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const gridRect = grid.getBoundingClientRect();
    if (gridRect.width < 10 || gridRect.height < 10) return;

    const hubRect = hubRef.current?.getBoundingClientRect();
    const hubCx = hubRect
      ? ((hubRect.left + hubRect.width / 2 - gridRect.left) / gridRect.width) * 100
      : 56;
    const hubCy = hubRect
      ? ((hubRect.top + hubRect.height / 2 - gridRect.top) / gridRect.height) * 100
      : 50;
    const hubRx = hubRect
      ? (hubRect.width / 2 / gridRect.width) * 100
      : 5.5;
    const hubRy = hubRect
      ? (hubRect.height / 2 / gridRect.height) * 100
      : 8;

    const next = [];
    for (let i = 0; i < rowCount; i += 1) {
      const trainEl = trainRefs.current[i];
      const evalEl = evalRefs.current[i];
      const client = clients[i];
      if (!trainEl || !evalEl || !client) continue;

      const tr = trainEl.getBoundingClientRect();
      const er = evalEl.getBoundingClientRect();

      const yStart = ((tr.top + tr.height / 2 - gridRect.top) / gridRect.height) * 100;
      const yEnd = ((er.top + er.height / 2 - gridRect.top) / gridRect.height) * 100;
      const xStart = ((tr.right - gridRect.left) / gridRect.width) * 100;
      const xEnd = ((er.left - gridRect.left) / gridRect.width) * 100;

      const hubIn = hubSurfacePoint(hubCx, hubCy, hubRx, hubRy, xStart, yStart);
      const hubOut = hubSurfacePoint(hubCx, hubCy, hubRx, hubRy, xEnd, yEnd);

      const weightPct = client.weightPct ?? 0;

      next.push({
        id: client.id,
        colour: client.colour,
        colourRGB: client.colourRGB,
        weightPct,
        flowLabel: `${transmitKbPerClient}`,
        flowUnit: "KB",
        weightLabel: `α ${weightPct.toFixed(1)}%`,
        xStart,
        yStart,
        xEnd,
        yEnd,
        hubInX: hubIn.x,
        hubInY: hubIn.y,
        hubOutX: hubOut.x,
        hubOutY: hubOut.y,
        inD: `M ${xStart} ${yStart} L ${hubIn.x} ${hubIn.y}`,
        outD: `M ${hubOut.x} ${hubOut.y} L ${xEnd} ${yEnd}`,
        strokeW: 1.4 + (weightPct / 100) * 2.8,
      });
    }
    setPaths(next);
  }, [gridRef, trainRefs, evalRefs, hubRef, clients, rowCount, transmitKbPerClient]);

  useLayoutEffect(() => {
    measure();
    const grid = gridRef.current;
    if (!grid) return undefined;

    const ro = new ResizeObserver(() => measure());
    ro.observe(grid);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, ...deps]);

  return paths;
}

function ProcessEdges({ paths, transmitting, broadcasting, training, evaluating }) {
  return (
    <svg className="fl-process__edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <defs>
        {paths.map((p) => (
          <filter key={`glow-${p.id}`} id={`fl-glow-${p.id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.65" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        ))}
        {paths.map((p) => (
          <linearGradient
            key={`in-grad-${p.id}`}
            id={`fl-edge-in-${p.id}`}
            gradientUnits="userSpaceOnUse"
            x1={String(p.xStart)}
            y1={String(p.yStart)}
            x2={String(p.hubInX)}
            y2={String(p.hubInY)}
          >
            <stop offset="0%" stopColor={`rgba(${p.colourRGB},0.85)`} />
            <stop offset="100%" stopColor="rgba(240, 165, 0, 0.7)" />
          </linearGradient>
        ))}
        {paths.map((p) => (
          <linearGradient
            key={`out-grad-${p.id}`}
            id={`fl-edge-out-${p.id}`}
            gradientUnits="userSpaceOnUse"
            x1={String(p.hubOutX)}
            y1={String(p.hubOutY)}
            x2={String(p.xEnd)}
            y2={String(p.yEnd)}
          >
            <stop offset="0%" stopColor="rgba(240, 165, 0, 0.7)" />
            <stop offset="100%" stopColor={`rgba(${p.colourRGB},0.75)`} />
          </linearGradient>
        ))}
      </defs>

      {paths.map((p, i) => (
        <g key={p.id} className="fl-process-edge-group">
          <path
            id={`fl-path-in-${p.id}`}
            d={p.inD}
            fill="none"
            stroke="none"
          />
          <path
            id={`fl-path-out-${p.id}`}
            d={p.outD}
            fill="none"
            stroke="none"
          />
          <path
            d={p.inD}
            className={`fl-process-edge fl-process-edge--in${transmitting ? " fl-process-edge--live fl-process-edge--flow-in" : ""}`}
            stroke={`url(#fl-edge-in-${p.id})`}
            strokeWidth={p.strokeW}
            vectorEffect="non-scaling-stroke"
            style={{ "--fl-edge-delay": `${i * 0.18}s` }}
          />
          <path
            d={p.outD}
            className={`fl-process-edge fl-process-edge--out${broadcasting ? " fl-process-edge--live fl-process-edge--flow-out" : ""}`}
            stroke={`url(#fl-edge-out-${p.id})`}
            strokeWidth={p.strokeW}
            vectorEffect="non-scaling-stroke"
            style={{ "--fl-edge-delay": `${i * 0.18}s` }}
          />
          {transmitting && (
            <>
              <circle
                r="1.05"
                fill={p.colour}
                className="fl-flow-packet fl-flow-packet--core"
                filter={`url(#fl-glow-${p.id})`}
              >
                <animateMotion
                  dur="1.55s"
                  repeatCount="indefinite"
                  begin={`${i * 0.22}s`}
                  calcMode="spline"
                  keySplines="0.42 0 0.58 1"
                  keyTimes="0;1"
                >
                  <mpath href={`#fl-path-in-${p.id}`} />
                </animateMotion>
              </circle>
              <circle
                r="2.2"
                fill={`rgba(${p.colourRGB},0.22)`}
                className="fl-flow-packet fl-flow-packet--halo"
              >
                <animateMotion
                  dur="1.55s"
                  repeatCount="indefinite"
                  begin={`${i * 0.22}s`}
                  calcMode="spline"
                  keySplines="0.42 0 0.58 1"
                  keyTimes="0;1"
                >
                  <mpath href={`#fl-path-in-${p.id}`} />
                </animateMotion>
              </circle>
            </>
          )}
          {broadcasting && (
            <>
              <circle
                r="1.05"
                fill="#10FFAA"
                className="fl-flow-packet fl-flow-packet--core fl-flow-packet--broadcast"
                filter={`url(#fl-glow-${p.id})`}
              >
                <animateMotion
                  dur="1.45s"
                  repeatCount="indefinite"
                  begin={`${i * 0.2}s`}
                  calcMode="spline"
                  keySplines="0.42 0 0.58 1"
                  keyTimes="0;1"
                >
                  <mpath href={`#fl-path-out-${p.id}`} />
                </animateMotion>
              </circle>
              <circle
                r="2.2"
                fill="rgba(16, 255, 170, 0.2)"
                className="fl-flow-packet fl-flow-packet--halo"
              >
                <animateMotion
                  dur="1.45s"
                  repeatCount="indefinite"
                  begin={`${i * 0.2}s`}
                  calcMode="spline"
                  keySplines="0.42 0 0.58 1"
                  keyTimes="0;1"
                >
                  <mpath href={`#fl-path-out-${p.id}`} />
                </animateMotion>
              </circle>
            </>
          )}
          {training && (
            <path d={p.inD} className="fl-process-edge fl-process-edge--pulse" stroke={p.colour} vectorEffect="non-scaling-stroke" />
          )}
          {evaluating && (
            <path d={p.outD} className="fl-process-edge fl-process-edge--pulse" stroke={p.colour} vectorEffect="non-scaling-stroke" />
          )}
        </g>
      ))}
    </svg>
  );
}

function edgeLerp(start, end, t) {
  return start + (end - start) * t;
}

function EdgeWeightNumerals({ paths, transmitting, broadcasting }) {
  if (!transmitting && !broadcasting) return null;

  return (
    <div className="fl-process__edge-nums" aria-hidden>
      {paths.map((p) => {
        if (transmitting) {
          const kbX = edgeLerp(p.xStart, p.hubInX, 0.12);
          const kbY = edgeLerp(p.yStart, p.hubInY, 0.12);
          const alphaX = edgeLerp(p.xStart, p.hubInX, 0.82);
          const alphaY = edgeLerp(p.yStart, p.hubInY, 0.82);
          return (
            <span key={`in-${p.id}`} className="fl-edge-weight-nums fl-edge-weight-nums--in">
              <span
                className="fl-edge-weight-num fl-edge-weight-num--kb mono"
                style={{
                  left: `${kbX}%`,
                  top: `${kbY}%`,
                  color: p.colour,
                  "--edge-rgb": p.colourRGB,
                }}
              >
                {p.flowLabel}
                <small>KB</small>
              </span>
              <span
                className="fl-edge-weight-num fl-edge-weight-num--alpha mono"
                style={{
                  left: `${alphaX}%`,
                  top: `${alphaY}%`,
                  color: p.colour,
                  "--edge-rgb": p.colourRGB,
                }}
              >
                α{p.weightPct.toFixed(1)}%
              </span>
            </span>
          );
        }
        if (broadcasting) {
          const thetaX = edgeLerp(p.hubOutX, p.xEnd, 0.18);
          const thetaY = edgeLerp(p.hubOutY, p.yEnd, 0.18);
          return (
            <span
              key={`out-${p.id}`}
              className="fl-edge-weight-num fl-edge-weight-num--broadcast mono"
              style={{ left: `${thetaX}%`, top: `${thetaY}%` }}
            >
              θ<sub>g</sub>
            </span>
          );
        }
        return null;
      })}
    </div>
  );
}

function FacilityLabel({ client }) {
  return (
    <div className="fl-process-label">
      <span className="fl-process-label__dot" style={{ background: client.colour }} />
      <div className="fl-process-label__text">
        <strong>{shortCity(client.city)}</strong>
        <span>({shortState(client.state)})</span>
      </div>
    </div>
  );
}

const LocalTrainCard = forwardRef(function LocalTrainCard(
  { client, weightPct, training, onInfoClick },
  ref,
) {
  return (
    <div className={`fl-process-train${training ? " fl-process-train--live" : ""}`}>
      <div
        ref={ref}
        data-node-id={client.id}
        data-colour={client.colour}
        data-colour-rgb={client.colourRGB}
        className="fl-process-train__card fl-process-node"
        style={{
          borderColor: client.colour,
          boxShadow: training ? `0 0 18px rgba(${client.colourRGB},0.22)` : undefined,
        }}
      >
        <span className="fl-process-train__tag">LOCAL</span>
        <div className="fl-process-train__models">
          {MODEL_TAGS.map((tag) => (
            <span
              key={tag}
              className="fl-process-train__pill"
              style={{ borderColor: `${client.colour}55`, color: client.colour }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="fl-process-train__weight-row">
        <span className="fl-process-train__weight mono" style={{ color: client.colour }}>
          α {weightPct != null ? `${weightPct.toFixed(1)}%` : "—"}
        </span>
        <button
          type="button"
          className="fl-process-train__info"
          onClick={onInfoClick}
          title="Why this attention weight?"
          aria-label={`Attention weight details for ${client.city}`}
        >
          i
        </button>
      </div>
    </div>
  );
});

function TransmitLane() {
  return <div className="fl-process-lane fl-process-lane--transmit" aria-hidden />;
}

function BroadcastLane() {
  return <div className="fl-process-lane fl-process-lane--broadcast" aria-hidden />;
}

const EvaluateCard = forwardRef(function EvaluateCard({ client, f1, active }, ref) {
  const f1Text = f1 != null ? `${(f1 * 100).toFixed(1)}%` : "—%";
  return (
    <div className={`fl-process-eval${active ? " fl-process-eval--active" : ""}`}>
      <div
        ref={ref}
        data-node-id={client.id}
        className="fl-process-eval__card fl-process-node"
        style={{ borderColor: `${client.colour}88` }}
      >
        <span className="fl-process-eval__label">LOCAL F1</span>
        <span className="fl-process-eval__value mono" style={{ color: client.colour }}>
          {f1Text}
        </span>
        <MiniSparkline color={client.colour} active={active && f1 != null} />
      </div>
    </div>
  );
});

function FedAvgHub({ hubRef, active, transmitting, globalF1, currentRound }) {
  return (
    <div className={`fl-process-hub${active ? " fl-process-hub--active" : ""}`}>
      <div className={`fl-process-hub__cloud${transmitting ? " fl-process-hub__cloud--live" : ""}`} aria-hidden>
        <svg viewBox="0 0 64 32" className="fl-process-hub__cloud-svg">
          <path d="M18 25h27a9 9 0 0 0 .4-18A12 12 0 0 0 22.5 8 8 8 0 0 0 18 25Z" />
        </svg>
        <span className="fl-process-hub__cloud-glow" />
      </div>
      <div ref={hubRef} className="fl-process-hub__core fl-process-node fl-process-node--hub">
        <span className="fl-process-hub__title">FedAvg</span>
        <span className="fl-process-hub__sub">Cloud Aggregator</span>
        <span className="fl-process-hub__city">Global Secure Cloud</span>
        {globalF1 != null && (
          <span className="fl-process-hub__f1 mono">{(globalF1 * 100).toFixed(2)}%</span>
        )}
        {currentRound > 0 && (
          <span className="fl-process-hub__round mono">R{currentRound}</span>
        )}
      </div>
    </div>
  );
}

export default function FLArchitectureDiagram({
  currentPhase = "idle",
  currentRound = 0,
  phaseProgress = 0,
  facilityStates = {},
  globalF1 = null,
  variant = "default",
  compressionRatio = 6,
  clientCount = 4,
  isRunning = false,
}) {
  const diagramRef = useRef(null);
  const gridRef = useRef(null);
  const hubRef = useRef(null);
  const trainRefs = useRef([]);
  const evalRefs = useRef([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [weightInfo, setWeightInfo] = useState(null);

  const samplePriors = useMemo(() => samplePriorPct(FL_CLIENTS), []);

  const clients = useMemo(
    () =>
      FL_CLIENTS.map((f) => {
        const facility = CATERPILLAR_FACILITIES[f.id] || {};
        const st = facilityStates[f.id] || {};
        return {
          id: f.id,
          city: f.city,
          state: f.state,
          colour: f.colour,
          colourRGB: f.colourRGB,
          trainRows: facility.trainRows ?? f.trainRows,
          weightPct: st.weightPct ?? samplePriors[f.id],
        };
      }),
    [samplePriors, facilityStates],
  );

  const training = currentPhase === "training";
  const transmitting = currentPhase === "transmitting";
  const broadcasting = currentPhase === "broadcasting";
  const evaluating = currentPhase === "evaluating";
  const active = currentPhase !== "idle";

  const transmitKbPerClient = useMemo(
    () => (WEIGHTS_KB_PER_ROUND / Math.max(clients.length, 1)).toFixed(1),
    [clients.length],
  );

  const paths = useHubSpokePaths(
    gridRef,
    trainRefs,
    evalRefs,
    hubRef,
    clients,
    transmitKbPerClient,
    [currentPhase, facilityStates, currentRound, transmitKbPerClient],
  );

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(document.fullscreenElement === diagramRef.current);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = diagramRef.current;
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

  const openWeightInfo = useCallback(
    (clientId) => {
      const client = clients.find((c) => c.id === clientId);
      if (!client) return;
      const st = facilityStates[clientId] || {};
      const base = buildWeightExplanation(
        client,
        { ...st, trainRows: client.trainRows },
        samplePriors[clientId],
        clients,
      );
      setWeightInfo({ ...base, colour: client.colour, kbPerClient: transmitKbPerClient });
    },
    [clients, facilityStates, samplePriors, transmitKbPerClient],
  );

  const ttiCounter = currentRound * FED_INTERVAL + (isRunning ? Math.floor(phaseProgress * FED_INTERVAL) : 0);
  const rowCount = clients.length;
  const hubRowStart = 2;
  const hubRowEnd = hubRowStart + rowCount;

  return (
    <div
      ref={diagramRef}
      className={`fl-process-diagram fl-arch-graph fl-arch-graph--process${active ? " fl-arch-graph--active" : ""}${variant === "hero" ? " fl-arch-graph--hero" : ""}${isFullscreen ? " fl-process-diagram--fullscreen" : ""} fl-process-diagram--phase-${currentPhase}`}
    >
      <div className="fl-process-diagram__toolbar">
        <div className="fl-process-diagram__meta-bar liquid-glass-card">
          <div className="fl-process-diagram__meta-legend">
            <span><strong>KB</strong> = encrypted model weights / client / round</span>
            <span><strong>α</strong> = FedAvg attention weight</span>
            <span><strong>θ<sub>global</sub></strong> = global model broadcast</span>
          </div>
          <div className="fl-process-diagram__meta-channel">
            <span className="fl-process-diagram__channel-label">Encrypted channel</span>
            <span className="fl-process-diagram__channel-detail mono">
              {transmitKbPerClient} KB/client · {WEIGHTS_KB_PER_ROUND} KB/round · TLS
            </span>
          </div>
        </div>
        <button
          type="button"
          className="fl-process-diagram__fs-btn"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen architecture"}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          <IconFullscreen exit={isFullscreen} />
        </button>
      </div>

      <div ref={gridRef} className="fl-process__grid" style={{ "--fl-process-rows": rowCount }}>
        <ProcessEdges
          paths={paths}
          transmitting={transmitting}
          broadcasting={broadcasting}
          training={training}
          evaluating={evaluating}
        />
        <EdgeWeightNumerals
          paths={paths}
          transmitting={transmitting}
          broadcasting={broadcasting}
        />

        <div className="fl-process__corner" aria-hidden />
        {STAGES.map((stage) => {
          const state = stageState(stage.key, currentPhase);
          return (
            <div
              key={stage.id}
              className={`fl-process-stage fl-process-stage--col-${stage.id} fl-process-stage--${state}`}
            >
              <div className="fl-process-stage__head">
                <span className="fl-process-stage__num">{stage.id}</span>
                <span className="fl-process-stage__title">{stage.title}</span>
              </div>
              <span className="fl-process-stage__sub">
                {stage.key === "transmitting"
                  ? `${transmitKbPerClient} KB/client · ${WEIGHTS_KB_PER_ROUND} KB round`
                  : stage.key === "broadcasting"
                    ? "θ_global → all cells"
                    : stage.sub}
              </span>
            </div>
          );
        })}

        <div
          className="fl-process__hub-slot"
          style={{ gridRow: `${hubRowStart} / ${hubRowEnd}` }}
        >
          <FedAvgHub
            hubRef={hubRef}
            active={active}
            transmitting={transmitting}
            globalF1={globalF1}
            currentRound={currentRound}
          />
        </div>

        {clients.map((client, i) => {
          const st = facilityStates[client.id] || {};
          const weightPct = st.weightPct ?? client.weightPct;
          const f1 = st.localF1;
          const row = hubRowStart + i;

          return (
            <div key={client.id} className="fl-process__row-cells" style={{ gridRow: row }}>
              <FacilityLabel client={client} />
              <LocalTrainCard
                ref={(el) => { trainRefs.current[i] = el; }}
                client={client}
                weightPct={weightPct}
                training={training}
                onInfoClick={() => openWeightInfo(client.id)}
              />
              <TransmitLane />
              <div className="fl-process__fedavg-slot" aria-hidden />
              <BroadcastLane />
              <EvaluateCard
                ref={(el) => { evalRefs.current[i] = el; }}
                client={client}
                f1={f1}
                active={evaluating}
              />
            </div>
          );
        })}
      </div>

      <WeightInfoPane info={weightInfo} onClose={() => setWeightInfo(null)} />

      <div className={`fl-arch-graph__footer${variant === "hero" ? " fl-arch-graph__footer--hero" : ""}`}>
        {variant === "hero" ? (
          <div className="fl-arch-footer-meta fl-arch-footer-meta--solo">
            <span>Fed interval · {FED_INTERVAL} TTI · TTI {ttiCounter.toLocaleString()}</span>
            <span className={`fl-arch-graph__phase${isRunning ? " live" : ""}`}>
              {isRunning ? "● LIVE STREAM" : `● ${currentPhase.toUpperCase()}`}
            </span>
          </div>
        ) : (
          <>
            <span>Round {currentRound}</span>
            <span className="fl-arch-graph__phase">{currentPhase.toUpperCase()}</span>
            <span>{clients.length} FL clients · {compressionRatio}× compression</span>
          </>
        )}
      </div>
    </div>
  );
}
