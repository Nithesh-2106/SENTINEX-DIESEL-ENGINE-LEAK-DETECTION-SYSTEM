"""
src/federated/aggregator.py — Federated Model Aggregation
==========================================================
Implements three aggregation strategies:

  XGBoostFedAvg  — prediction probability averaging (soft-vote ensemble)
  RFFedAvg       — identical mechanism applied to Random Forest
  NNFedAvg       — classical FedAvg (McMahan et al. 2017) for PyTorch NNs

FederatedAggregator orchestrates one complete federation round across all
three clients and all three model types.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

import numpy as np
import torch
from sklearn.metrics import f1_score

from src.federated.facility_config import LEAK_SCENARIOS

logger = logging.getLogger(__name__)


# ======================================================================
#  XGBoost Federated Averaging
# ======================================================================
class XGBoostFedAvg:
    """
    Federated averaging for XGBoost via prediction probability aggregation.

    Tree model parameters (split thresholds, leaf values) cannot be
    meaningfully averaged — their structure is discrete and non-linear.
    Instead, each client votes on a shared validation set and votes are
    weighted by dataset size. This is the standard approach for federated
    tree ensembles in the FL literature.
    """

    def aggregate_proba(
        self,
        client_proba_list: List[Dict[str, np.ndarray]],
        sample_counts: List[int],
    ) -> Dict[str, np.ndarray]:
        """
        Weighted average of prediction probabilities across clients.

        Parameters:
            client_proba_list: list of dicts, one per client
            sample_counts: list of ints, training samples per client

        Returns:
            global_proba dict in same format
        """
        total = sum(sample_counts)
        global_proba: Dict[str, np.ndarray] = {}

        for key in ["leak_present", "leak_location", "leak_severity", "recommended_action"]:
            global_proba[key] = sum(
                np.array(cp[key]) * (n / total)
                for cp, n in zip(client_proba_list, sample_counts)
            )

        return global_proba

    def predict_from_proba(
        self, global_proba: Dict[str, np.ndarray]
    ) -> Dict[str, np.ndarray]:
        """Return integer class predictions from global probabilities."""
        return {key: np.argmax(proba, axis=1) for key, proba in global_proba.items()}

    def decode_predictions(
        self,
        global_proba: Dict[str, np.ndarray],
        encoders: Dict,
    ) -> Dict[str, np.ndarray]:
        """Convert probability arrays to decoded string predictions."""
        output_map = {
            "leak_present": "Leak_Present",
            "leak_location": "Leak_Location",
            "leak_severity": "Leak_Severity",
            "recommended_action": "Recommended_Action",
        }
        decoded: Dict[str, np.ndarray] = {}
        for proba_key, label_key in output_map.items():
            if label_key in encoders and proba_key in global_proba:
                indices = np.argmax(global_proba[proba_key], axis=1)
                decoded[label_key] = encoders[label_key].inverse_transform(indices)
        return decoded


# ======================================================================
#  Random Forest Federated Averaging
# ======================================================================
class RFFedAvg(XGBoostFedAvg):
    """
    Federated averaging for Random Forest.
    Identical mechanism to XGBoostFedAvg — prediction probability averaging.
    """
    pass


# ======================================================================
#  Neural Network Federated Averaging — McMahan 2017
# ======================================================================
class NNFedAvg:
    """
    Classical FedAvg (McMahan et al. 2017) for Neural Networks.

    PyTorch state dicts are tensor dictionaries. Averaging tensors in
    parameter space is mathematically valid — the averaged network
    interpolates between the local solutions found by each client.
    This is the original FedAvg algorithm applied exactly.

    Mathematics:
        W_global[key] = sum(W_client[key] * n_client / n_total)
    """

    def aggregate_weights(
        self,
        state_dicts: List[Dict[str, torch.Tensor]],
        sample_counts: List[int],
    ) -> Dict[str, torch.Tensor]:
        """
        Compute weighted average of PyTorch state dicts.

        Parameters:
            state_dicts: list of state_dicts from client.get_nn_state_dict()
            sample_counts: list of ints, training samples per client

        Returns:
            averaged_state_dict: PyTorch state dict
        """
        total = sum(sample_counts)
        averaged: Dict[str, torch.Tensor] = {}

        for key in state_dicts[0].keys():
            averaged[key] = sum(
                sd[key].float() * (n / total)
                for sd, n in zip(state_dicts, sample_counts)
            )

        return averaged


# ======================================================================
#  Master Aggregator — orchestrates one full federation round
# ======================================================================
class FederatedAggregator:
    """
    Orchestrates one complete federation round across all three clients
    and all three model types.
    """

    def __init__(self) -> None:
        self.xgb_fedavg = XGBoostFedAvg()
        self.rf_fedavg = RFFedAvg()
        self.nn_fedavg = NNFedAvg()
        self.round_number = 0
        self.round_history: List[Dict[str, Any]] = []

    def run_round(
        self,
        clients: list,  # List[FederatedClient]
        shared_val_X: np.ndarray,
        shared_val_y: np.ndarray,
        encoders: Dict,
    ) -> Dict[str, Any]:
        """
        Execute one complete federation round.

        Parameters:
            clients: list of FederatedClient instances
            shared_val_X: np.array — shared validation features
            shared_val_y: np.array — shared validation labels
            encoders: dict of LabelEncoders (all clients share same label space)

        Returns:
            round_metrics dict
        """
        label_cols = list(encoders.keys())
        location_idx = label_cols.index("Leak_Location")
        present_idx = label_cols.index("Leak_Present")
        severity_idx = label_cols.index("Leak_Severity")

        # ── STEP 1: Per-client metrics BEFORE this round ──────────────
        # Measures cross-facility performance on the shared validation set.
        per_client_before: Dict[str, Any] = {}
        for client in clients:
            metrics = client.evaluate(
                X=shared_val_X, y=shared_val_y, label="shared_before"
            )
            per_client_before[client.client_id] = metrics

        # ── STEP 2: Collect weights from all clients ──────────────────
        sample_counts = [len(c.X_train) for c in clients]
        total_samples = sum(sample_counts)

        # XGBoost aggregation
        xgb_probas = [c.get_xgb_proba(shared_val_X) for c in clients]
        global_xgb_proba = self.xgb_fedavg.aggregate_proba(xgb_probas, sample_counts)

        # Random Forest aggregation
        rf_probas = [c.get_rf_proba(shared_val_X) for c in clients]
        global_rf_proba = self.rf_fedavg.aggregate_proba(rf_probas, sample_counts)

        # Neural Network aggregation — exact weight averaging (FedAvg)
        nn_state_dicts = [c.get_nn_state_dict() for c in clients]
        global_nn_state = self.nn_fedavg.aggregate_weights(nn_state_dicts, sample_counts)

        # Push global NN weights back to all clients
        for client in clients:
            client.set_nn_state_dict(global_nn_state)

        # ── STEP 3: Evaluate global XGBoost model ────────────────────
        # XGBoost is the production best model — use its aggregated probabilities.
        global_preds = self.xgb_fedavg.predict_from_proba(global_xgb_proba)

        global_location_f1 = float(f1_score(
            shared_val_y[:, location_idx],
            global_preds["leak_location"],
            average="macro", zero_division=0,
        ))
        global_present_f1 = float(f1_score(
            shared_val_y[:, present_idx],
            global_preds["leak_present"],
            average="macro", zero_division=0,
        ))
        global_severity_f1 = float(f1_score(
            shared_val_y[:, severity_idx],
            global_preds["leak_severity"],
            average="macro", zero_division=0,
        ))

        # Per-scenario F1 for global model
        loc_encoder = encoders["Leak_Location"]
        per_scenario_f1: Dict[str, Optional[float]] = {}
        for scenario in LEAK_SCENARIOS:
            try:
                encoded = loc_encoder.transform([scenario])[0]
                mask = shared_val_y[:, location_idx] == encoded
                if mask.sum() > 0:
                    per_scenario_f1[scenario] = float(f1_score(
                        shared_val_y[mask, location_idx],
                        global_preds["leak_location"][mask],
                        average="micro", zero_division=0,
                    ))
                else:
                    per_scenario_f1[scenario] = None
            except ValueError:
                per_scenario_f1[scenario] = None

        # ── STEP 4: Compute improvement ───────────────────────────────
        best_local_f1 = max(
            m["leak_location_f1"] for m in per_client_before.values()
        )
        improvement_over_best = global_location_f1 - best_local_f1
        per_client_improvement = {
            cid: global_location_f1 - metrics["leak_location_f1"]
            for cid, metrics in per_client_before.items()
        }

        # ── STEP 5: Build round metrics ───────────────────────────────
        round_metrics: Dict[str, Any] = {
            "round": self.round_number,
            "timestamp": datetime.now().isoformat(),
            "sample_weights": {
                c.client_id: round(n / total_samples, 4)
                for c, n in zip(clients, sample_counts)
            },
            "per_client_before": per_client_before,
            "global_after": {
                "leak_location_f1": global_location_f1,
                "leak_present_f1": global_present_f1,
                "leak_severity_f1": global_severity_f1,
                "per_scenario_f1": per_scenario_f1,
                "model_used": "xgboost_fedavg",
            },
            "improvement_over_best_local": float(improvement_over_best),
            "per_client_improvement": per_client_improvement,
        }

        self.round_number += 1
        self.round_history.append(round_metrics)
        logger.info(
            "Round %d complete — global F1: %.4f (Δ best local: %+.4f)",
            round_metrics["round"], global_location_f1, improvement_over_best,
        )
        return round_metrics

    def get_privacy_stats(self, clients: list) -> Dict[str, Any]:
        """
        Compute what was transmitted vs what stayed local.
        Demonstrates the privacy benefit of FL quantitatively.
        """
        sample_counts = [len(c.X_train) for c in clients]
        total_samples = sum(sample_counts)

        # Approximate XGBoost weight transmission per round:
        # Each client sends N_shared * 4_outputs * avg_classes * 4_bytes
        # avg classes: leak_present≈2, location≈8, severity≈3, action≈3 → ~4
        n_shared = 1500
        weights_per_round_bytes = n_shared * 4 * 4 * 4
        weights_per_round_kb = weights_per_round_bytes / 1024

        # Approximate raw dataset size per client
        # ~40 numeric features × 4 bytes × num_rows
        raw_per_client_bytes = [
            40 * 4 * n for n in sample_counts
        ]
        raw_total_kb = sum(raw_per_client_bytes) / 1024

        total_weight_kb = weights_per_round_kb * len(clients) * self.round_number
        compression_ratio = raw_total_kb / total_weight_kb if total_weight_kb > 0 else 0

        return {
            "total_training_samples": int(total_samples),
            "weights_transmitted_kb_per_round": round(weights_per_round_kb, 2),
            "total_weights_transmitted_kb": round(total_weight_kb, 2),
            "raw_data_equivalent_kb": round(raw_total_kb, 2),
            "compression_ratio": round(compression_ratio, 1),
            "raw_data_never_shared": True,
            "num_rounds": self.round_number,
            "num_clients": len(clients),
        }
