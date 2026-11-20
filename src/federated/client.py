"""
src/federated/client.py — Federated Learning Client
====================================================
Wraps the full 3-model local training pipeline for a single C13 test
facility. Each client maintains its own data, models, preprocessing
objects, and metrics — strictly isolated from other clients.

The NN architecture (LeakDetectionNet) is defined here inline because
src/train.py embeds it directly rather than exporting it from a separate
module.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import f1_score
from sklearn.model_selection import train_test_split
from sklearn.multioutput import MultiOutputClassifier
from sklearn.preprocessing import LabelEncoder, StandardScaler
from torch.utils.data import DataLoader, TensorDataset
from xgboost import XGBClassifier

from src.federated.facility_config import (
    DATASET_PATHS,
    FACILITY_CONFIGS,
    LABEL_COLUMNS,
    LEAK_SCENARIOS,
    METADATA_COLUMNS,
)

logger = logging.getLogger(__name__)

# ── Hyperparameters — identical to src/train.py ───────────────────────
RF_N_ESTIMATORS = 200
RF_MAX_DEPTH = 15

XGB_N_ESTIMATORS = 300
XGB_LEARNING_RATE = 0.05
XGB_MAX_DEPTH = 6

NN_EPOCHS = 50
NN_BATCH_SIZE = 256
NN_LR = 0.001
NN_EARLY_STOP_PATIENCE = 10
NN_DROPOUT_1 = 0.3
NN_DROPOUT_2 = 0.2
NN_HIDDEN_1 = 256
NN_HIDDEN_2 = 128
NN_HIDDEN_3 = 64

RANDOM_STATE = 42


# ======================================================================
#  Neural Network Architecture — mirrors src/train.py LeakDetectionNet
# ======================================================================
class LeakDetectionNet(nn.Module):
    """
    Multi-head neural network for simultaneous four-target prediction.

    Architecture:
        Input → BatchNorm → Dense(256) → ReLU → Dropout(0.3)
              → Dense(128) → ReLU → Dropout(0.2)
              → Dense(64)  → ReLU
              → Four output heads
    
    Forward returns a tuple: (out_present, out_location, out_severity, out_action)
    Matches src/train.py LeakDetectionNet exactly.
    """

    def __init__(
        self,
        input_dim: int,
        n_location: int,
        n_severity: int,
        n_action: int,
    ) -> None:
        super().__init__()
        self.bn = nn.BatchNorm1d(input_dim)
        self.fc1 = nn.Linear(input_dim, NN_HIDDEN_1)
        self.fc2 = nn.Linear(NN_HIDDEN_1, NN_HIDDEN_2)
        self.fc3 = nn.Linear(NN_HIDDEN_2, NN_HIDDEN_3)
        self.drop1 = nn.Dropout(NN_DROPOUT_1)
        self.drop2 = nn.Dropout(NN_DROPOUT_2)
        self.relu = nn.ReLU()
        self.head_leak_present = nn.Linear(NN_HIDDEN_3, 1)
        self.head_leak_location = nn.Linear(NN_HIDDEN_3, n_location)
        self.head_leak_severity = nn.Linear(NN_HIDDEN_3, n_severity)
        self.head_recommended_action = nn.Linear(NN_HIDDEN_3, n_action)

    def forward(self, x):
        x = self.bn(x)
        x = self.drop1(self.relu(self.fc1(x)))
        x = self.drop2(self.relu(self.fc2(x)))
        x = self.relu(self.fc3(x))
        out_present = self.head_leak_present(x)
        out_location = self.head_leak_location(x)
        out_severity = self.head_leak_severity(x)
        out_action = self.head_recommended_action(x)
        return out_present, out_location, out_severity, out_action


# ======================================================================
#  FederatedClient
# ======================================================================
class FederatedClient:
    """
    A federated learning node for one CAT C13 test facility.

    Encapsulates the full local pipeline:
        load_and_preprocess() → train_all_models() → evaluate()
    
    Exposes weight access methods for the aggregator:
        get_xgb_proba(), get_rf_proba()
        get_nn_state_dict(), set_nn_state_dict()
    """

    def __init__(self, facility_key: str) -> None:
        if facility_key not in FACILITY_CONFIGS:
            raise ValueError(
                f"Unknown facility_key: {facility_key}. "
                f"Must be one of {list(FACILITY_CONFIGS.keys())}"
            )
        self.facility_key = facility_key
        self.config = FACILITY_CONFIGS[facility_key]
        self.client_id: str = self.config["client_id"]
        self.facility_name: str = self.config["facility_name"]
        self.city: str = self.config["city"]

        self.data_path: str = DATASET_PATHS[facility_key]["noisy"]
        self.clean_data_path: str = DATASET_PATHS[facility_key]["clean"]

        # Models
        self.rf_model: Optional[MultiOutputClassifier] = None
        self.xgb_model: Optional[MultiOutputClassifier] = None
        self.nn_model: Optional[LeakDetectionNet] = None
        self.best_model_type: Optional[str] = None  # "random_forest" | "xgboost" | "neural_network"

        # Preprocessing
        self.scaler: Optional[StandardScaler] = None
        self.encoders: Dict[str, LabelEncoder] = {}

        # Data splits
        self.X_train: Optional[np.ndarray] = None
        self.X_val: Optional[np.ndarray] = None
        self.X_test: Optional[np.ndarray] = None
        self.y_train: Optional[np.ndarray] = None
        self.y_val: Optional[np.ndarray] = None
        self.y_test: Optional[np.ndarray] = None
        self.feature_cols: List[str] = []

        self.metrics: Dict[str, Any] = {}
        self.round_number: int = 0
        self.is_trained: bool = False

        logger.info(
            "FederatedClient initialised: %s (%s)", self.facility_name, self.city
        )

    # ── Data loading & preprocessing ──────────────────────────────────
    def load_and_preprocess(self) -> None:
        """
        Load the clean facility dataset and run the same preprocessing
        pipeline as src/preprocess.py.

        Uses the CLEAN dataset (post-DQP, no injected noise) for training.
        """
        logger.info(
            "  [%s] Loading clean dataset from %s...",
            self.facility_name, self.clean_data_path,
        )
        df = pd.read_csv(self.clean_data_path)
        logger.info(
            "  [%s] Loaded %d rows, %d columns",
            self.facility_name, len(df), len(df.columns),
        )

        # Drop metadata columns — same as preprocess.py
        drop_cols = [c for c in METADATA_COLUMNS if c in df.columns]
        df = df.drop(columns=drop_cols)

        # Drop any unnamed index columns
        df = df.loc[:, ~df.columns.str.startswith("Unnamed")]

        # Separate features and labels
        label_cols = [c for c in LABEL_COLUMNS if c in df.columns]
        feature_cols = [c for c in df.columns if c not in label_cols]

        X = df[feature_cols].copy()
        y_raw = df[label_cols].copy()

        # Handle remaining NaN — forward fill then 0
        X = X.ffill().fillna(0)

        # Label encode each output column
        y_encoded = pd.DataFrame()
        for col in label_cols:
            le = LabelEncoder()
            y_encoded[col] = le.fit_transform(y_raw[col].astype(str))
            self.encoders[col] = le

        # Standard scale features
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)

        # Stratified 70/15/15 split on Leak_Location
        stratify_col = (
            y_encoded["Leak_Location"] if "Leak_Location" in y_encoded else None
        )
        X_train_val, X_test, y_train_val, y_test = train_test_split(
            X_scaled,
            y_encoded.values,
            test_size=0.15,
            random_state=RANDOM_STATE,
            stratify=stratify_col,
        )

        stratify_train = None
        if "Leak_Location" in y_encoded.columns:
            loc_idx = y_encoded.columns.tolist().index("Leak_Location")
            stratify_train = y_train_val[:, loc_idx]

        self.X_train, self.X_val, self.y_train, self.y_val = train_test_split(
            X_train_val,
            y_train_val,
            test_size=0.15 / 0.85,
            random_state=RANDOM_STATE,
            stratify=stratify_train,
        )
        self.X_test = X_test
        self.y_test = y_test
        self.feature_cols = feature_cols

        logger.info(
            "  [%s] Split: train=%d, val=%d, test=%d",
            self.facility_name,
            len(self.X_train),
            len(self.X_val),
            len(self.X_test),
        )

    # ── Training ──────────────────────────────────────────────────────
    def train_all_models(self, subset_fraction: float = 1.0) -> None:
        """
        Train Random Forest, XGBoost, and Neural Network on local data.
        Uses identical hyperparameters to src/train.py.
        """
        if self.X_train is None:
            raise RuntimeError("Call load_and_preprocess() before train_all_models()")

        limit = int(len(self.X_train) * subset_fraction)
        X_train_sub = self.X_train[:limit]
        y_train_sub = self.y_train[:limit]

        # ── Random Forest ─────────────────────────────────────────────
        logger.info("  [%s] Training Random Forest...", self.facility_name)
        rf = RandomForestClassifier(
            n_estimators=RF_N_ESTIMATORS,
            max_depth=RF_MAX_DEPTH,
            random_state=RANDOM_STATE,
            n_jobs=1,  # macOS OpenMP fork-safety: must be 1 in subprocess
        )
        self.rf_model = MultiOutputClassifier(rf)
        self.rf_model.fit(X_train_sub, y_train_sub)
        logger.info("  [%s] Random Forest done.", self.facility_name)

        # ── XGBoost ───────────────────────────────────────────────────
        logger.info("  [%s] Training XGBoost...", self.facility_name)
        xgb = XGBClassifier(
            n_estimators=XGB_N_ESTIMATORS,
            learning_rate=XGB_LEARNING_RATE,
            max_depth=XGB_MAX_DEPTH,
            random_state=RANDOM_STATE,
            eval_metric="mlogloss",
            nthread=1,   # macOS OpenMP fork-safety: must be 1 in subprocess
            n_jobs=1,
            verbosity=0,
        )
        self.xgb_model = MultiOutputClassifier(xgb)
        self.xgb_model.fit(X_train_sub, y_train_sub)
        logger.info("  [%s] XGBoost done.", self.facility_name)

        # ── Neural Network ────────────────────────────────────────────
        logger.info("  [%s] Training Neural Network...", self.facility_name)
        self._train_neural_network(X_train_sub, y_train_sub)
        logger.info("  [%s] Neural Network done.", self.facility_name)

        self.select_best_model()
        self.is_trained = True
        logger.info("  [%s] Best model: %s", self.facility_name, self.best_model_type)

    def _train_neural_network(self, X_train_sub: np.ndarray, y_train_sub: np.ndarray) -> None:
        """Train the PyTorch NN using identical logic to src/train.py."""
        label_cols = list(self.encoders.keys())
        n_location = len(self.encoders["Leak_Location"].classes_)
        n_severity = len(self.encoders["Leak_Severity"].classes_)
        n_action = len(self.encoders["Recommended_Action"].classes_)
        n_features = X_train_sub.shape[1]

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model = LeakDetectionNet(n_features, n_location, n_severity, n_action).to(device)
        optimizer = torch.optim.Adam(model.parameters(), lr=NN_LR)

        criterion_bce = nn.BCEWithLogitsLoss()
        criterion_ce = nn.CrossEntropyLoss()

        present_idx = label_cols.index("Leak_Present")
        location_idx = label_cols.index("Leak_Location")
        severity_idx = label_cols.index("Leak_Severity")
        action_idx = label_cols.index("Recommended_Action")

        X_tr = torch.tensor(X_train_sub, dtype=torch.float32)
        y_tr = torch.tensor(y_train_sub, dtype=torch.long)
        X_vl = torch.tensor(self.X_val, dtype=torch.float32)
        y_vl = torch.tensor(self.y_val, dtype=torch.long)

        train_loader = DataLoader(
            TensorDataset(X_tr, y_tr), batch_size=NN_BATCH_SIZE, shuffle=True
        )
        val_loader = DataLoader(
            TensorDataset(X_vl, y_vl), batch_size=NN_BATCH_SIZE, shuffle=False
        )

        best_val_loss = float("inf")
        patience_counter = 0
        best_state = None

        for epoch in range(1, NN_EPOCHS + 1):
            model.train()
            for X_batch, y_batch in train_loader:
                X_batch, y_batch = X_batch.to(device), y_batch.to(device)
                out_p, out_loc, out_sev, out_act = model(X_batch)
                loss = (
                    criterion_bce(out_p.squeeze(), y_batch[:, present_idx].float())
                    + criterion_ce(out_loc, y_batch[:, location_idx])
                    + criterion_ce(out_sev, y_batch[:, severity_idx])
                    + criterion_ce(out_act, y_batch[:, action_idx])
                )
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

            model.eval()
            val_loss = 0.0
            with torch.no_grad():
                for X_batch, y_batch in val_loader:
                    X_batch, y_batch = X_batch.to(device), y_batch.to(device)
                    out_p, out_loc, out_sev, out_act = model(X_batch)
                    val_loss += (
                        criterion_bce(out_p.squeeze(), y_batch[:, present_idx].float())
                        + criterion_ce(out_loc, y_batch[:, location_idx])
                        + criterion_ce(out_sev, y_batch[:, severity_idx])
                        + criterion_ce(out_act, y_batch[:, action_idx])
                    ).item() * X_batch.size(0)
            val_loss /= len(val_loader.dataset)

            if val_loss < best_val_loss:
                best_val_loss = val_loss
                patience_counter = 0
                best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            else:
                patience_counter += 1
                if patience_counter >= NN_EARLY_STOP_PATIENCE:
                    logger.info(
                        "  [%s] NN early stopping at epoch %d",
                        self.facility_name, epoch,
                    )
                    break

        if best_state:
            model.load_state_dict(best_state)
        model.to("cpu")
        self.nn_model = model

    # ── Model selection ───────────────────────────────────────────────
    def select_best_model(self) -> None:
        """
        Evaluate all 3 models on validation set.
        Select the one with highest macro F1 on Leak_Location.
        Mirrors auto-selection logic in existing train.py.
        """
        label_cols = list(self.encoders.keys())
        location_idx = label_cols.index("Leak_Location")
        y_true_loc = self.y_val[:, location_idx]

        scores: Dict[str, float] = {}

        # RF
        rf_pred = self.rf_model.predict(self.X_val)
        scores["random_forest"] = float(
            f1_score(y_true_loc, rf_pred[:, location_idx], average="macro", zero_division=0)
        )

        # XGBoost
        xgb_pred = self.xgb_model.predict(self.X_val)
        scores["xgboost"] = float(
            f1_score(y_true_loc, xgb_pred[:, location_idx], average="macro", zero_division=0)
        )

        # NN
        self.nn_model.eval()
        with torch.no_grad():
            X_val_t = torch.tensor(self.X_val, dtype=torch.float32)
            _, nn_loc_logits, _, _ = self.nn_model(X_val_t)
            nn_loc_pred = nn_loc_logits.argmax(dim=1).numpy()
        scores["neural_network"] = float(
            f1_score(y_true_loc, nn_loc_pred, average="macro", zero_division=0)
        )

        best_score = max(scores.values())
        tied = [k for k, v in scores.items() if abs(v - best_score) < 0.001]
        # Prefer XGBoost (production model) when scores are essentially equal
        for pref in ("xgboost", "random_forest", "neural_network"):
            if pref in tied:
                self.best_model_type = pref
                break
        else:
            self.best_model_type = max(scores, key=scores.get)

        self.metrics["val_f1_by_model"] = scores
        self.metrics["leak_location_f1"] = scores[self.best_model_type]

        logger.info("  [%s] Model scores: %s", self.facility_name, scores)

    # ── Evaluation ────────────────────────────────────────────────────
    def evaluate(
        self,
        X: Optional[np.ndarray] = None,
        y: Optional[np.ndarray] = None,
        label: str = "test",
    ) -> Dict[str, Any]:
        """
        Evaluate the best model on given data or own test set.

        Returns:
            dict with F1 scores per output and per scenario
        """
        if X is None:
            X = self.X_test
            y = self.y_test

        label_cols = list(self.encoders.keys())
        location_idx = label_cols.index("Leak_Location")
        present_idx = label_cols.index("Leak_Present")
        severity_idx = label_cols.index("Leak_Severity")
        action_idx = label_cols.index("Recommended_Action")

        if self.best_model_type == "random_forest":
            preds = self.rf_model.predict(X)
            loc_pred = preds[:, location_idx]
            pres_pred = preds[:, present_idx]
            sev_pred = preds[:, severity_idx]
            act_pred = preds[:, action_idx]
        elif self.best_model_type == "xgboost":
            preds = self.xgb_model.predict(X)
            loc_pred = preds[:, location_idx]
            pres_pred = preds[:, present_idx]
            sev_pred = preds[:, severity_idx]
            act_pred = preds[:, action_idx]
        else:  # neural_network
            self.nn_model.eval()
            with torch.no_grad():
                X_t = torch.tensor(X, dtype=torch.float32)
                out_p, out_loc, out_sev, out_act = self.nn_model(X_t)
                pres_pred = (torch.sigmoid(out_p.squeeze()) >= 0.5).long().numpy()
                loc_pred = out_loc.argmax(dim=1).numpy()
                sev_pred = out_sev.argmax(dim=1).numpy()
                act_pred = out_act.argmax(dim=1).numpy()

        leak_location_f1 = float(f1_score(y[:, location_idx], loc_pred, average="macro", zero_division=0))
        leak_present_f1 = float(f1_score(y[:, present_idx], pres_pred, average="macro", zero_division=0))
        leak_severity_f1 = float(f1_score(y[:, severity_idx], sev_pred, average="macro", zero_division=0))
        recommended_action_f1 = float(f1_score(y[:, action_idx], act_pred, average="macro", zero_division=0))

        # Per-scenario F1 using location encoder
        loc_encoder = self.encoders["Leak_Location"]
        per_scenario_f1: Dict[str, Optional[float]] = {}
        for scenario in LEAK_SCENARIOS:
            try:
                encoded_label = loc_encoder.transform([scenario])[0]
                mask = y[:, location_idx] == encoded_label
                if mask.sum() > 0:
                    per_scenario_f1[scenario] = float(
                        f1_score(y[mask, location_idx], loc_pred[mask], average="micro", zero_division=0)
                    )
                else:
                    per_scenario_f1[scenario] = None
            except ValueError:
                per_scenario_f1[scenario] = None

        result: Dict[str, Any] = {
            "client_id": self.client_id,
            "facility_name": self.facility_name,
            "city": self.city,
            "best_model_type": self.best_model_type,
            "label": label,
            "leak_present_f1": leak_present_f1,
            "leak_location_f1": leak_location_f1,
            "leak_severity_f1": leak_severity_f1,
            "recommended_action_f1": recommended_action_f1,
            "per_scenario_f1": per_scenario_f1,
        }
        if label == "test":
            self.metrics.update(result)
        return result

    # ── Weight access for aggregator ──────────────────────────────────
    def get_xgb_proba(self, X: np.ndarray) -> Dict[str, np.ndarray]:
        """XGBoost prediction probabilities for FL aggregation."""
        proba_list = self.xgb_model.predict_proba(X)
        output_keys = ["leak_present", "leak_location", "leak_severity", "recommended_action"]
        return {output_keys[i]: proba_list[i] for i in range(len(output_keys))}

    def get_rf_proba(self, X: np.ndarray) -> Dict[str, np.ndarray]:
        """Random Forest prediction probabilities for FL aggregation."""
        proba_list = self.rf_model.predict_proba(X)
        output_keys = ["leak_present", "leak_location", "leak_severity", "recommended_action"]
        return {output_keys[i]: proba_list[i] for i in range(len(output_keys))}

    def get_nn_state_dict(self) -> Dict:
        """Return PyTorch state dict for NN weight averaging."""
        return {k: v.clone() for k, v in self.nn_model.state_dict().items()}

    def set_nn_state_dict(self, averaged_state_dict: Dict) -> None:
        """Load globally averaged NN weights into local model."""
        self.nn_model.load_state_dict(averaged_state_dict)
        self.round_number += 1

    def get_client_summary(self) -> Dict[str, Any]:
        """Return serialisable dict of current client state."""
        return {
            "client_id": self.client_id,
            "facility_name": self.facility_name,
            "city": self.city,
            "state": self.config["state"],
            "elevation_m": self.config["elevation_m"],
            "description": self.config["description"],
            "best_model_type": self.best_model_type,
            "model_scores": self.metrics.get("val_f1_by_model", {}),
            "train_samples": int(len(self.X_train)) if self.X_train is not None else 0,
            "val_samples": int(len(self.X_val)) if self.X_val is not None else 0,
            "test_samples": int(len(self.X_test)) if self.X_test is not None else 0,
            "round_number": self.round_number,
            "is_trained": self.is_trained,
            "overrepresented_scenario": self.config["overrepresented_scenario"],
            "metrics": self.metrics,
        }
