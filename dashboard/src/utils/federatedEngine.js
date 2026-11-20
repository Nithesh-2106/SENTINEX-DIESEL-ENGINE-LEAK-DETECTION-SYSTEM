/**
 * federatedEngine.js
 * Lightweight Federated Averaging + attention-weighted aggregation.
 *
 *   - Each client k owns n_k local samples and a local optimum θ_k* (non-IID).
 *   - Local training = gradient descent toward θ_k* from the broadcast global model.
 *   - Attention α_k = softmax(log n_k + (localF1_k − 0.5) / τ)  — updates every round.
 *   - Aggregation   = θ_global = Σ α_k · θ_k
 */

import { attentionWeightsFromResults } from "./federatedWeights.js";

const DIM = 12;

function randn() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function vec(fill) {
  return Array.from({ length: DIM }, fill);
}

function addScaled(a, b, s) {
  return a.map((x, i) => x + b[i] * s);
}

function meanSquare(a, b) {
  let sum = 0;
  for (let i = 0; i < DIM; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum / DIM;
}

function lossToF1(loss) {
  const f1 = 0.5 + 0.49 * Math.exp(-1.6 * loss);
  return Math.max(0.5, Math.min(0.992, f1));
}

/**
 * @param {Array<{id:string,trainRows:number,heterogeneity?:number}>} clients
 */
export function createFederatedEngine(clients) {
  const totalRows = clients.reduce((s, c) => s + (c.trainRows || 1), 0);

  const thetaStar = vec(() => randn());
  const thetaInit = addScaled(thetaStar, vec(() => randn()), 3.0);

  const clientState = clients.map((c) => {
    const hetero = c.heterogeneity ?? 0.35;
    const nSamples = c.trainRows || 1;
    return {
      id: c.id,
      nSamples,
      trainRows: nSamples,
      contribution: nSamples / totalRows,
      localOpt: addScaled(thetaStar, vec(() => randn()), hetero),
      theta: thetaInit.slice(),
    };
  });

  let thetaGlobal = thetaInit.slice();
  let round = 0;
  let lastGlobalLoss = meanSquare(thetaGlobal, thetaStar);
  let lastLocalResults = [];
  let lastAttentionWeights = [];

  function applyAttention(localResults) {
    const weights = attentionWeightsFromResults(localResults, clientState);
    lastAttentionWeights = weights;
    for (const w of weights) {
      const c = clientState.find((x) => x.id === w.id);
      if (c) c.contribution = w.contribution;
    }
    return weights;
  }

  return {
    get round() {
      return round;
    },
    get dim() {
      return DIM;
    },
    get clientMeta() {
      return clientState.map((c) => ({
        id: c.id,
        trainRows: c.nSamples,
        nSamples: c.nSamples,
      }));
    },
    contributions() {
      return clientState.map((c) => ({
        id: c.id,
        contribution: c.contribution,
        weightPct: c.contribution * 100,
      }));
    },
    lastAttentionWeights() {
      return lastAttentionWeights;
    },

    localTrain({ epochs = 4, lr = 0.45 } = {}) {
      const results = clientState.map((c) => {
        c.theta = thetaGlobal.slice();
        for (let e = 0; e < epochs; e += 1) {
          for (let i = 0; i < DIM; i += 1) {
            c.theta[i] += lr * (c.localOpt[i] - c.theta[i]) + randn() * 0.01;
          }
        }
        const trainLoss = meanSquare(c.theta, c.localOpt);
        const valLoss = meanSquare(c.theta, thetaStar);
        return {
          id: c.id,
          trainLoss,
          valLoss,
          localF1: lossToF1(valLoss),
        };
      });

      lastLocalResults = results;
      const weights = applyAttention(results);

      return results.map((r) => {
        const w = weights.find((x) => x.id === r.id);
        return {
          ...r,
          contribution: w?.contribution ?? 0,
          weightPct: w?.weightPct ?? 0,
        };
      });
    },

    /** θ_global = Σ α_k · θ_k using the latest attention weights. */
    aggregate() {
      round += 1;

      if (lastLocalResults.length) {
        applyAttention(lastLocalResults);
      }

      const next = vec(() => 0);
      for (const c of clientState) {
        for (let i = 0; i < DIM; i += 1) next[i] += c.contribution * c.theta[i];
      }
      thetaGlobal = next;

      const globalLoss = meanSquare(thetaGlobal, thetaStar);
      const improvement = lastGlobalLoss - globalLoss;
      lastGlobalLoss = globalLoss;

      const drift =
        clientState.reduce((s, c) => s + Math.sqrt(meanSquare(c.theta, thetaGlobal)), 0) /
        clientState.length;

      return {
        globalF1: lossToF1(globalLoss),
        globalLoss,
        improvement,
        drift,
        distToOptimum: Math.sqrt(globalLoss),
        attentionWeights: lastAttentionWeights.map((w) => ({ ...w })),
      };
    },
  };
}
