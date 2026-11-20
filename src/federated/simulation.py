"""
src/federated/simulation.py — Federated Learning Orchestrator
=============================================================
run_federated_simulation() is the single entry point that:
  1. Generates facility datasets (if needed)
  2. Initialises three FederatedClient instances
  3. Runs local training on each client
  4. Executes N federated rounds via FederatedAggregator
  5. Persists results via fl_metrics_store

This file is called by the API background thread:
    threading.Thread(target=run_federated_simulation, args=(3,)).start()
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

from src.federated.aggregator import FederatedAggregator
from src.federated.client import FederatedClient
from src.federated.data_generator import generate_all_facility_datasets
from src.federated.facility_config import FACILITY_CONFIGS, LABEL_COLUMNS, METADATA_COLUMNS
from src.federated.fl_metrics_store import save_fl_results

logger = logging.getLogger(__name__)


def _build_shared_validation_set(clients: list):
    """
    Build a shared validation set by sampling from all three clients' test data.

    This set is used by the aggregator to evaluate cross-facility performance.
    It is never used for training — only for evaluation.

    Returns:
        (shared_X, shared_y, encoders)
    """
    x_parts = []
    y_parts = []

    for client in clients:
        # Take up to 500 rows from each client's test set
        n_take = min(500, len(client.X_test))
        if n_take > 0:
            idx = np.random.choice(len(client.X_test), n_take, replace=False)
            x_parts.append(client.X_test[idx])
            y_parts.append(client.y_test[idx])

    shared_X = np.vstack(x_parts)
    shared_y = np.vstack(y_parts)

    # Use client_a's encoders — all clients share the same label space
    encoders = clients[0].encoders

    logger.info(
        "Shared validation set built: %d rows from %d clients",
        len(shared_X), len(clients),
    )
    return shared_X, shared_y, encoders


def _build_cross_facility_before(round_history: list) -> Dict[str, Any] | None:
    """
    Snapshot of per-facility performance on the shared cross-facility set
    before federation improves the global model (round 0 per_client_before).
    """
    if not round_history:
        return None
    per_client = round_history[0].get("per_client_before", {})
    if not per_client:
        return None
    scores = {
        cid: float(m["leak_location_f1"])
        for cid, m in per_client.items()
    }
    best_client_id = max(scores, key=scores.get)
    return {
        "per_client": per_client,
        "best_individual": scores[best_client_id],
        "best_client_id": best_client_id,
        "best_facility_name": per_client[best_client_id].get("facility_name"),
    }


def _build_cross_facility_after(round_history: list) -> Dict[str, Any] | None:
    """Global model performance on the shared cross-facility set after FL."""
    if not round_history:
        return None
    global_after = round_history[-1].get("global_after", {})
    return {
        "leak_location_f1": float(global_after.get("leak_location_f1", 0.0)),
        "leak_present_f1": float(global_after.get("leak_present_f1", 0.0)),
        "leak_severity_f1": float(global_after.get("leak_severity_f1", 0.0)),
        "per_scenario_f1": global_after.get("per_scenario_f1", {}),
        "model_used": global_after.get("model_used", "xgboost_fedavg"),
        "round": round_history[-1].get("round"),
    }


def _build_fl_benefit(
    round_history: list,
    local_metrics: list,
) -> Dict[str, Any] | None:
    """
    Correct FL benefit metrics: cross-facility comparison (primary) and
    local-own-data delta (secondary, may be negative).
    """
    cf_before = _build_cross_facility_before(round_history)
    if not cf_before or not local_metrics:
        return None
    global_cf = float(
        round_history[-1]["global_after"]["leak_location_f1"]
    )
    best_local_own = max(float(m["leak_location_f1"]) for m in local_metrics)
    best_individual_cf = float(cf_before["best_individual"])
    return {
        "best_individual_cross_facility_f1": best_individual_cf,
        "global_fl_cross_facility_f1": global_cf,
        "cross_facility_improvement": global_cf - best_individual_cf,
        "best_local_own_data_f1": best_local_own,
        "global_local_delta": global_cf - best_local_own,
    }


def _build_facility_contributions(
    clients: list,
    round_history: list,
) -> Dict[str, Any]:
    """Weight % each facility contributes to FedAvg (latest round)."""
    if not round_history:
        return {}
    weights = round_history[-1].get("sample_weights", {})
    out: Dict[str, Any] = {}
    for client in clients:
        cid = client.client_id
        out[cid] = {
            "facility": client.facility_name,
            "city": client.city,
            "client_id": cid,
            "weight_pct": round(float(weights.get(cid, 0.0)) * 100, 2),
            "local_test_f1": float(
                client.metrics.get("leak_location_f1", 0.0)
            ),
        }
    return out


def run_federated_simulation(num_rounds: int = 3) -> Dict[str, Any]:
    """
    Execute the full federated learning simulation.

    Parameters:
        num_rounds: int — number of FL aggregation rounds (default 3)

    Returns:
        dict containing full simulation results (also persisted to JSON)
    """
    sim_start = datetime.now()
    logger.info("=" * 60)
    logger.info("FEDERATED LEARNING SIMULATION STARTED")
    logger.info("Facilities: Hosur Cell 1, Hosur Cell 2, Pune Cell")
    logger.info("Rounds: %d", num_rounds)
    logger.info("=" * 60)

    # ── PHASE 1: Generate facility datasets ───────────────────────────
    logger.info("[Phase 1] Generating facility-specific C13 datasets...")
    generate_all_facility_datasets(force_regenerate=False)
    logger.info("[Phase 1] Dataset generation complete.\n")

    # ── PHASE 2: Initialise & train all clients ───────────────────────
    logger.info("[Phase 2] Initialising federated clients...")
    facility_keys = list(FACILITY_CONFIGS.keys())
    clients = [FederatedClient(key) for key in facility_keys]

    logger.info("[Phase 2] Loading and preprocessing data per client...")
    for client in clients:
        client.load_and_preprocess()

    # (Phase 3 local evaluation removed — merged into Phase 5 round loop)

    # ── PHASE 4: Build shared validation set ──────────────────────────
    logger.info("\n[Phase 4] Building cross-facility shared validation set...")
    np.random.seed(42)
    shared_X, shared_y, encoders = _build_shared_validation_set(clients)

    # ── PHASE 5: Federated rounds ─────────────────────────────────────
    logger.info("\n[Phase 5] Running %d federated aggregation rounds...", num_rounds)
    aggregator = FederatedAggregator()
    round_history = []
    local_metrics = [] # To store the final round's local metrics

    # Progressive data fractions to simulate a learning curve for SKLearn trees
    fractions = [0.1, 0.4, 1.0]

    def _persist_progress(*, complete: bool = False) -> None:
        """Write results after each round so the dashboard metrics update live."""
        sim_now = datetime.now()
        duration = (sim_now - sim_start).total_seconds()
        best_local = 0.0
        if local_metrics:
            best_local = max(m["leak_location_f1"] for m in local_metrics)
        elif round_history:
            before = round_history[-1].get("per_client_before", {})
            if before:
                best_local = max(m["leak_location_f1"] for m in before.values())

        final_global = (
            round_history[-1]["global_after"]["leak_location_f1"] if round_history else 0.0
        )
        cf_before = _build_cross_facility_before(round_history)
        cf_after = _build_cross_facility_after(round_history)
        fl_benefit = _build_fl_benefit(round_history, local_metrics) if complete else None
        facility_contributions = _build_facility_contributions(clients, round_history)

        partial: Dict[str, Any] = {
            "simulation_timestamp": sim_now.isoformat(),
            "simulation_duration_seconds": round(duration, 1),
            "num_rounds": len(round_history) if not complete else num_rounds,
            "num_rounds_planned": num_rounds,
            "simulation_in_progress": not complete,
            "num_clients": len(clients),
            "clients": [c.get_client_summary() for c in clients],
            "round_history": round_history,
            "cross_facility_before": cf_before,
            "cross_facility_after": cf_after,
            "facility_contributions": facility_contributions,
            "fl_benefit": fl_benefit,
            "privacy_stats": aggregator.get_privacy_stats(clients) if complete else None,
            "global_improvement_summary": {
                "best_local_f1": best_local,
                "final_global_f1": final_global,
                "improvement": final_global - best_local if round_history else 0.0,
            },
        }
        if complete:
            partial["local_metrics_before_fl"] = local_metrics
            partial["final_metrics_after_fl"] = final_metrics
        save_fl_results(partial)

    for round_num in range(num_rounds):
        frac = fractions[round_num] if round_num < len(fractions) else 1.0
        logger.info("  --- Round %d / %d (Training on %d%% of local data) ---", round_num + 1, num_rounds, int(frac * 100))
        
        # 1. Train local models
        for client in clients:
            client.train_all_models(subset_fraction=frac)
            
        # 2. Local evaluation to track best local model performance
        if round_num == num_rounds - 1:
            local_metrics = [c.evaluate(label="test") for c in clients]
            
        # 3. Aggregate
        round_metrics = aggregator.run_round(clients, shared_X, shared_y, encoders)
        round_history.append(round_metrics)
        logger.info(
            "  Global F1 after round %d: %.4f",
            round_num + 1, round_metrics["global_after"]["leak_location_f1"],
        )
        _persist_progress(complete=False)

    # ── PHASE 6: Final evaluation ──────────────────────────────────────
    logger.info("\n[Phase 6] Final evaluation per client after federation...")
    final_metrics: list = []
    for client in clients:
        result = client.evaluate(label="test_post_fl")
        final_metrics.append(result)
        logger.info(
            "  [%s] Post-FL Leak_Location F1: %.4f",
            client.facility_name, result["leak_location_f1"],
        )

    # ── PHASE 7: Privacy stats & results packaging ────────────────────
    privacy_stats = aggregator.get_privacy_stats(clients)
    sim_end = datetime.now()
    duration_seconds = (sim_end - sim_start).total_seconds()

    cf_before = _build_cross_facility_before(round_history)
    cf_after = _build_cross_facility_after(round_history)
    fl_benefit = _build_fl_benefit(round_history, local_metrics)
    facility_contributions = _build_facility_contributions(clients, round_history)

    results: Dict[str, Any] = {
        "simulation_timestamp": sim_end.isoformat(),
        "simulation_duration_seconds": round(duration_seconds, 1),
        "num_rounds": num_rounds,
        "num_rounds_planned": num_rounds,
        "simulation_in_progress": False,
        "num_clients": len(clients),
        "clients": [c.get_client_summary() for c in clients],
        "local_metrics_before_fl": local_metrics,
        "final_metrics_after_fl": final_metrics,
        "round_history": round_history,
        "cross_facility_before": cf_before,
        "cross_facility_after": cf_after,
        "facility_contributions": facility_contributions,
        "fl_benefit": fl_benefit,
        "privacy_stats": privacy_stats,
        "global_improvement_summary": {
            "best_local_f1": max(m["leak_location_f1"] for m in local_metrics),
            "final_global_f1": round_history[-1]["global_after"]["leak_location_f1"] if round_history else 0,
            "improvement": (
                round_history[-1]["global_after"]["leak_location_f1"] -
                max(m["leak_location_f1"] for m in local_metrics)
            ) if round_history else 0,
        },
    }

    # ── PHASE 8: Persist final results ─────────────────────────────────
    save_fl_results(results)

    logger.info("=" * 60)
    logger.info("FEDERATED SIMULATION COMPLETE in %.1f seconds", duration_seconds)
    if fl_benefit:
        logger.info(
            "Cross-facility best individual: %.4f",
            fl_benefit["best_individual_cross_facility_f1"],
        )
        logger.info(
            "Cross-facility global FL:       %.4f (Δ %+0.4f)",
            fl_benefit["global_fl_cross_facility_f1"],
            fl_benefit["cross_facility_improvement"],
        )
        logger.info(
            "Best local own-data F1:         %.4f (local Δ %+0.4f)",
            fl_benefit["best_local_own_data_f1"],
            fl_benefit["global_local_delta"],
        )
    logger.info("=" * 60)

    return results


if __name__ == "__main__":
    import logging as _logging
    _logging.basicConfig(level=_logging.INFO,
                         format="%(asctime)s | %(levelname)s | %(message)s")
    run_federated_simulation(num_rounds=3)
