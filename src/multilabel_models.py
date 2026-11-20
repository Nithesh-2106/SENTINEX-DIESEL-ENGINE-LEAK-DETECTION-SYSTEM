"""
multilabel_models.py — Shared multi-label training, threshold tuning, and inference helpers.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Tuple, Union

import joblib
import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import f1_score, hamming_loss, precision_score, recall_score
from sklearn.multioutput import MultiOutputClassifier

from preprocess import LABEL_COLS, MODELS_DIR

N_LABELS = len(LABEL_COLS)

MODEL_B_REGISTRY = {
    "rf": {
        "name": "Random Forest (multi-label)",
        "file": "rf_multilabel.pkl",
        "thresholds_file": "multilabel_thresholds_rf.pkl",
        "type": "sklearn",
    },
    "xgb": {
        "name": "XGBoost (multi-label)",
        "file": "xgb_multilabel.pkl",
        "thresholds_file": "multilabel_thresholds_xgb.pkl",
        "type": "sklearn",
    },
    "nn": {
        "name": "Neural Network (multi-label)",
        "file": "nn_multilabel.pt",
        "meta_file": "nn_multilabel_meta.pkl",
        "thresholds_file": "multilabel_thresholds_nn.pkl",
        "type": "nn",
    },
}


class MultiLabelNet(nn.Module):
    """7 independent sigmoid heads for multi-label leak detection."""

    def __init__(self, input_dim: int, n_labels: int = N_LABELS, hidden1: int = 256, hidden2: int = 128):
        super().__init__()
        self.bn = nn.BatchNorm1d(input_dim)
        self.fc1 = nn.Linear(input_dim, hidden1)
        self.fc2 = nn.Linear(hidden1, hidden2)
        self.drop = nn.Dropout(0.3)
        self.relu = nn.ReLU()
        self.head = nn.Linear(hidden2, n_labels)

    def forward(self, x):
        x = self.bn(x)
        x = self.drop(self.relu(self.fc1(x)))
        x = self.relu(self.fc2(x))
        return self.head(x)


def tune_thresholds(Y_val: np.ndarray, Y_val_proba: np.ndarray) -> Dict[str, float]:
    """Find per-label threshold that maximises F1 on validation set."""
    thresholds: Dict[str, float] = {}
    for i, label in enumerate(LABEL_COLS):
        best_thresh = 0.50
        best_f1 = 0.0
        for thresh in np.arange(0.30, 0.75, 0.05):
            preds = (Y_val_proba[:, i] >= thresh).astype(int)
            if preds.sum() == 0:
                continue
            f1 = f1_score(Y_val[:, i], preds, zero_division=0)
            if f1 > best_f1:
                best_f1 = f1
                best_thresh = thresh
        thresholds[label] = round(float(best_thresh), 2)
    return thresholds


def predict_from_proba(Y_proba: np.ndarray, thresholds: Dict[str, float]) -> np.ndarray:
    """Apply tuned thresholds to probability matrix."""
    Y_pred = np.zeros_like(Y_proba, dtype=int)
    for i, label in enumerate(LABEL_COLS):
        thresh = thresholds.get(label, 0.50)
        Y_pred[:, i] = (Y_proba[:, i] >= thresh).astype(int)
    return Y_pred


def sklearn_multilabel_proba(model: MultiOutputClassifier, X: np.ndarray) -> np.ndarray:
    """Per-label P(class=1) from MultiOutputClassifier."""
    probs = np.zeros((X.shape[0], N_LABELS), dtype=np.float32)
    for i, estimator in enumerate(model.estimators_):
        proba = estimator.predict_proba(X)
        probs[:, i] = proba[:, 1] if proba.shape[1] == 2 else proba[:, 0]
    return probs


def nn_multilabel_proba(model: MultiLabelNet, X: np.ndarray) -> np.ndarray:
    """Sigmoid probabilities from multi-label NN."""
    model.eval()
    with torch.no_grad():
        logits = model(torch.tensor(X, dtype=torch.float32))
        return torch.sigmoid(logits).cpu().numpy()


def evaluate_multilabel(
    Y_true: np.ndarray,
    Y_pred: np.ndarray,
    y_multi_true: np.ndarray,
    model_key: str,
) -> Dict:
    """Compute hamming loss, per-label F1, and multi-leak detection F1."""
    per_label_f1 = []
    for i, label in enumerate(LABEL_COLS):
        f1 = f1_score(Y_true[:, i], Y_pred[:, i], zero_division=0)
        per_label_f1.append(f1)

    pred_multi = (Y_pred.sum(axis=1) >= 2).astype(int)
    multi_f1 = f1_score(y_multi_true, pred_multi, zero_division=0)
    multi_p = precision_score(y_multi_true, pred_multi, zero_division=0)
    multi_r = recall_score(y_multi_true, pred_multi, zero_division=0)

    return {
        "model_key": model_key,
        "model_name": MODEL_B_REGISTRY[model_key]["name"],
        "hamming_loss": float(hamming_loss(Y_true, Y_pred)),
        "multilabel_f1_macro": float(np.mean(per_label_f1)),
        "multi_leak_f1": float(multi_f1),
        "multi_leak_precision": float(multi_p),
        "multi_leak_recall": float(multi_r),
        "per_label_f1": {LABEL_COLS[i]: float(per_label_f1[i]) for i in range(N_LABELS)},
    }


def select_best_model_b(results: List[Dict], tiebreak: List[str] | None = None) -> str:
    """
    Select best Model B by multi_leak_f1, then multilabel_f1_macro.
    XGBoost preferred on ties (SHAP / production stability).
    """
    tiebreak = tiebreak or ["xgb", "nn", "rf"]
    best_key = results[0]["model_key"]
    best_score = (-1.0, -1.0)

    for r in results:
        score = (r["multi_leak_f1"], r["multilabel_f1_macro"])
        is_better = score > best_score
        is_tie_better = (
            score == best_score
            and tiebreak.index(r["model_key"]) < tiebreak.index(best_key)
        )
        if is_better or is_tie_better:
            best_score = score
            best_key = r["model_key"]

    return best_key


def save_model_b_selection(best_key: str, all_results: List[Dict]) -> None:
    """Persist best Model B choice and copy production thresholds."""
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    with open(MODELS_DIR / "best_multilabel_model.txt", "w") as f:
        f.write(best_key)

    best_entry = next(r for r in all_results if r["model_key"] == best_key)
    src_thresh = MODELS_DIR / MODEL_B_REGISTRY[best_key]["thresholds_file"]
    if src_thresh.exists():
        joblib.dump(joblib.load(src_thresh), MODELS_DIR / "multilabel_thresholds.pkl")

    selection = {
        "selection_criterion": "multi_leak_f1",
        "active_model_key": best_key,
        "active_model_name": MODEL_B_REGISTRY[best_key]["name"],
        "active_model_file": MODEL_B_REGISTRY[best_key]["file"],
        "active_multi_leak_f1": best_entry["multi_leak_f1"],
        "active_multilabel_f1_macro": best_entry["multilabel_f1_macro"],
        "models": [
            {
                "id": r["model_key"],
                "name": r["model_name"],
                "multi_leak_f1": r["multi_leak_f1"],
                "multilabel_f1_macro": r["multilabel_f1_macro"],
                "hamming_loss": r["hamming_loss"],
                "is_active": r["model_key"] == best_key,
            }
            for r in all_results
        ],
    }
    joblib.dump(selection, MODELS_DIR / "multilabel_model_selection.pkl")


def load_production_model_b():
    """Load the selected production Model B and its thresholds."""
    best_path = MODELS_DIR / "best_multilabel_model.txt"
    best_key = best_path.read_text().strip() if best_path.exists() else "xgb"
    if best_key not in MODEL_B_REGISTRY:
        best_key = "xgb"

    info = MODEL_B_REGISTRY[best_key]
    thresh_path = MODELS_DIR / "multilabel_thresholds.pkl"
    if not thresh_path.exists():
        thresh_path = MODELS_DIR / info["thresholds_file"]
    thresholds = joblib.load(thresh_path)

    if info["type"] == "sklearn":
        model = joblib.load(MODELS_DIR / info["file"])
        proba_fn = lambda X: sklearn_multilabel_proba(model, X)
        return best_key, model, thresholds, proba_fn

    meta = joblib.load(MODELS_DIR / info["meta_file"])
    model = MultiLabelNet(meta["input_dim"], meta["n_labels"])
    model.load_state_dict(
        torch.load(MODELS_DIR / info["file"], map_location="cpu", weights_only=True)
    )
    model.eval()
    proba_fn = lambda X: nn_multilabel_proba(model, X)
    return best_key, model, thresholds, proba_fn


def proba_to_label_dict(proba_row: np.ndarray) -> Dict[str, float]:
    """Map 7-element proba vector to scenario name dict."""
    from preprocess import SCENARIO_ORDER

    return {SCENARIO_ORDER[i]: float(proba_row[i]) for i in range(N_LABELS)}
