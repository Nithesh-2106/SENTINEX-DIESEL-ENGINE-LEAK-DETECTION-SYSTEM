/**
 * FedAvg sample priors + attention weights derived from live local metrics.
 * Used by the FL stream and all dashboard visualisations for consistent α values.
 */

/** Static sample-size prior α_k = n_k / Σ n (percent). */
export function samplePriorPct(clients) {
  const total = clients.reduce((s, c) => s + (c.trainRows || c.nSamples || 1), 0) || 1;
  const map = {};
  for (const c of clients) {
    const n = c.trainRows || c.nSamples || 1;
    map[c.id] = (n / total) * 100;
  }
  return map;
}

/**
 * Attention-weighted FedAvg coefficients for one round.
 * Combines dataset-size prior with local validation quality (local F1).
 *
 *   logit_k = log(n_k + 1) + (localF1_k − 0.5) / temperature
 *   α_k     = softmax(logit)_k
 */
export function attentionWeightsFromResults(localResults, clients, { temperature = 0.1 } = {}) {
  const byId = Object.fromEntries(clients.map((c) => [c.id, c]));
  const logits = localResults.map((r) => {
    const n = byId[r.id]?.trainRows || byId[r.id]?.nSamples || 1;
    const quality = Math.max(0.01, Math.min(0.999, r.localF1 ?? 0.5));
    return Math.log(n + 1) + (quality - 0.5) / temperature;
  });
  const maxLogit = Math.max(...logits);
  const expScores = logits.map((l) => Math.exp(l - maxLogit));
  const sum = expScores.reduce((a, b) => a + b, 0) || 1;

  return localResults.map((r, i) => ({
    id: r.id,
    contribution: expScores[i] / sum,
    weightPct: (expScores[i] / sum) * 100,
  }));
}

/** Resolve display weight for a client — live stream first, else sample prior. */
export function resolveWeightPct(clientId, facilityStates, priors) {
  const live = facilityStates?.[clientId]?.weightPct;
  if (live != null && live > 0) return live;
  return priors?.[clientId] ?? 0;
}
