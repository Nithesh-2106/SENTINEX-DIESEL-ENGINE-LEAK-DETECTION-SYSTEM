import { useState, useRef, useCallback, useEffect } from "react";
import { FACILITY_LIST, FL_CLIENT_LIST } from "../constants/federatedFacilities.js";
import { createFederatedEngine } from "../utils/federatedEngine.js";
import { samplePriorPct } from "../utils/federatedWeights.js";

const FL_CLIENTS = FL_CLIENT_LIST.length ? FL_CLIENT_LIST : FACILITY_LIST;

/** Bytes transmitted per client per round = model params × 4 bytes (float32). */
const MODEL_PARAMS = 12;
const BYTES_PER_PARAM = 4;
const WEIGHTS_KB_PER_CLIENT = (MODEL_PARAMS * BYTES_PER_PARAM) / 1024;
const WEIGHTS_KB_PER_ROUND = WEIGHTS_KB_PER_CLIENT * FL_CLIENTS.length;

export default function useFederatedStream() {
  const [isRunning, setIsRunning] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [currentPhase, setCurrentPhase] = useState("idle");
  const [phaseProgress, setPhaseProgress] = useState(0);
  const [roundHistory, setRoundHistory] = useState([]);
  const [facilityStates, setFacilityStates] = useState({});
  const [globalF1History, setGlobalF1History] = useState([]);
  const [latestRoundResult, setLatestRoundResult] = useState(null);
  const [activeTransmissions, setActiveTransmissions] = useState([]);
  const [sessionBestF1, setSessionBestF1] = useState(0);
  const [avgRoundTime, setAvgRoundTime] = useState(0);
  const [totalWeightsSent, setTotalWeightsSent] = useState("0 KB");
  const [roundsThisSession, setRoundsThisSession] = useState(0);
  const [globalLoss, setGlobalLoss] = useState(null);
  const [convergence, setConvergence] = useState(null);

  const engineRef = useRef(null);
  const shouldStopRef = useRef(false);
  const roundTimesRef = useRef([]);
  const weightsKBRef = useRef(0);
  const progressTimerRef = useRef(null);
  const phaseResolveRef = useRef(null);
  const localResultsRef = useRef([]);

  const runPhase = useCallback((phaseId, duration) => {
    return new Promise((resolve) => {
      phaseResolveRef.current = resolve;
      setCurrentPhase(phaseId);
      setPhaseProgress(0);
      setActiveTransmissions([]);

      if (phaseId === "transmitting") {
        setActiveTransmissions(
          FL_CLIENTS.map((c, i) => ({
            from: c.id,
            to: "fedavg_server",
            type: "weight",
            id: `w${i + 1}`,
          })),
        );
      } else if (phaseId === "broadcasting") {
        setActiveTransmissions(
          FL_CLIENTS.map((c, i) => ({
            from: "fedavg_server",
            to: c.id,
            type: "global",
            id: `g${i + 1}`,
          })),
        );
      }

      const startTime = Date.now();
      progressTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(1, elapsed / duration);
        setPhaseProgress(progress);
        if (progress >= 1) {
          clearInterval(progressTimerRef.current);
          progressTimerRef.current = null;
          phaseResolveRef.current = null;
          resolve();
        }
      }, 50);
    });
  }, []);

  const runRound = useCallback(
    async (roundNumber) => {
      if (shouldStopRef.current) return false;
      const engine = engineRef.current;
      if (!engine) return false;

      setCurrentRound(roundNumber);
      const roundStartMs = Date.now();

      // ── 1. Local training (real GD toward each client's local optimum) ──
      await runPhase("training", 3000);
      if (shouldStopRef.current) return false;

      const localResults = engine.localTrain({ epochs: 4, lr: 0.45 });
      localResultsRef.current = localResults;

      const byId = Object.fromEntries(localResults.map((r) => [r.id, r]));
      const newFacilityStates = {};
      for (const facility of FACILITY_LIST) {
        const r = byId[facility.id];
        newFacilityStates[facility.id] = {
          ...facility,
          localF1: r ? r.localF1 : undefined,
          localLoss: r ? r.valLoss : undefined,
          trainLoss: r ? r.trainLoss : undefined,
          contribution: r ? r.contribution : 0,
          weightPct: r ? r.contribution * 100 : 0,
          status: "trained",
          epoch: 4,
        };
      }
      setFacilityStates(newFacilityStates);

      // ── 2. Transmit weights to the aggregation server ──
      await runPhase("transmitting", 2000);
      if (shouldStopRef.current) return false;

      // ── 3. FedAvg aggregation (data-weighted average) ──
      await runPhase("aggregating", 1500);
      if (shouldStopRef.current) return false;

      const agg = engine.aggregate();
      const globalF1 = agg.globalF1;
      const localF1s = localResults.map((r) => r.localF1);
      const avgLocalF1 = localF1s.reduce((a, b) => a + b, 0) / localF1s.length;
      const crossFacilityDelta = Math.max(...localF1s) - Math.min(...localF1s);

      // Sync attention weights post-aggregation (may shift slightly vs training snapshot).
      if (agg.attentionWeights?.length) {
        const postAggStates = { ...newFacilityStates };
        for (const w of agg.attentionWeights) {
          if (postAggStates[w.id]) {
            postAggStates[w.id] = {
              ...postAggStates[w.id],
              contribution: w.contribution,
              weightPct: w.weightPct,
            };
          }
        }
        setFacilityStates(postAggStates);
      }

      setGlobalLoss(agg.globalLoss);
      setConvergence(agg.improvement);

      // ── 4. Broadcast the new global model back to every client ──
      await runPhase("broadcasting", 2000);
      if (shouldStopRef.current) return false;

      await runPhase("evaluating", 1000);
      if (shouldStopRef.current) return false;

      const durationMs = Date.now() - roundStartMs;
      const roundResult = {
        round: roundNumber,
        timestamp: new Date().toISOString(),
        global_f1: globalF1,
        global_loss: agg.globalLoss,
        avg_local_f1: avgLocalF1,
        improvement: agg.improvement,
        drift: agg.drift,
        cross_facility_delta: crossFacilityDelta,
        facility_results: localResults.map((r) => ({
          facility_id: r.id,
          local_f1: r.localF1,
          val_loss: r.valLoss,
          train_loss: r.trainLoss,
          contribution: r.contribution,
          weight_pct: r.weightPct,
        })),
        attention_weights: agg.attentionWeights ?? localResults.map((r) => ({
          id: r.id,
          contribution: r.contribution,
          weight_pct: r.weightPct,
        })),
        duration_ms: durationMs,
      };

      setRoundHistory((prev) => [...prev, roundResult]);
      setGlobalF1History((prev) => [
        ...prev,
        {
          round: roundNumber,
          f1: globalF1,
          avgLocal: avgLocalF1,
          loss: agg.globalLoss,
          label: `R${roundNumber}`,
        },
      ]);
      setLatestRoundResult(roundResult);

      setSessionBestF1((prev) => Math.max(prev, globalF1));
      setRoundsThisSession(roundNumber);
      roundTimesRef.current.push(durationMs);
      const avg =
        roundTimesRef.current.reduce((a, b) => a + b, 0) / roundTimesRef.current.length;
      setAvgRoundTime(avg);

      weightsKBRef.current += WEIGHTS_KB_PER_CLIENT * FL_CLIENTS.length;
      const totalKB = weightsKBRef.current;
      setTotalWeightsSent(
        totalKB >= 1024 ? `${(totalKB / 1024).toFixed(2)} MB` : `${totalKB.toFixed(1)} KB`,
      );

      return true;
    },
    [runPhase],
  );

  const startStreaming = useCallback(async () => {
    if (isRunning) return;
    shouldStopRef.current = false;
    setIsRunning(true);
    setRoundHistory([]);
    setGlobalF1History([]);
    setCurrentRound(0);
    setCurrentPhase("idle");
    setLatestRoundResult(null);
    setFacilityStates({});
    setSessionBestF1(0);
    setAvgRoundTime(0);
    setTotalWeightsSent("0 KB");
    setRoundsThisSession(0);
    setGlobalLoss(null);
    setConvergence(null);
    roundTimesRef.current = [];
    weightsKBRef.current = 0;

    engineRef.current = createFederatedEngine(
      FL_CLIENTS.map((c) => ({
        id: c.id,
        trainRows: c.trainRows,
        heterogeneity: c.heterogeneity,
      })),
    );

    const priors = samplePriorPct(FL_CLIENTS);
    const initialStates = {};
    for (const facility of FACILITY_LIST) {
      initialStates[facility.id] = {
        ...facility,
        weightPct: priors[facility.id] ?? facility.weight_pct,
        status: "ready",
      };
    }
    setFacilityStates(initialStates);

    let round = 1;
    while (!shouldStopRef.current) {
      const completed = await runRound(round);
      if (!completed) break;
      round += 1;

      if (!shouldStopRef.current) {
        setCurrentPhase("idle");
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    setCurrentPhase("idle");
    setActiveTransmissions([]);
    setPhaseProgress(0);
    phaseResolveRef.current = null;
    setIsRunning(false);
  }, [isRunning, runRound]);

  const stopStreaming = useCallback(() => {
    shouldStopRef.current = true;
    setCurrentPhase("idle");
    setActiveTransmissions([]);
    setPhaseProgress(0);
    setIsRunning(false);
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (phaseResolveRef.current) {
      phaseResolveRef.current();
      phaseResolveRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      shouldStopRef.current = true;
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }
      if (phaseResolveRef.current) {
        phaseResolveRef.current();
        phaseResolveRef.current = null;
      }
    };
  }, []);

  return {
    isRunning,
    currentRound,
    currentPhase,
    phaseProgress,
    roundHistory,
    facilityStates,
    globalF1History,
    latestRoundResult,
    activeTransmissions,
    sessionBestF1,
    avgRoundTime,
    totalWeightsSent,
    totalWeightsKB: weightsKBRef.current,
    weightsKBPerClient: WEIGHTS_KB_PER_CLIENT,
    weightsKBPerRound: WEIGHTS_KB_PER_ROUND,
    modelParams: MODEL_PARAMS,
    bytesPerParam: BYTES_PER_PARAM,
    roundsThisSession,
    globalLoss,
    convergence,
    clientCount: FL_CLIENTS.length,
    startStreaming,
    stopStreaming,
  };
}
