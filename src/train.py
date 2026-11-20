"""
train.py — Multi-label leak detection: RF, XGBoost, Neural Network.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

import joblib
import numpy as np
import torch
import torch.nn as nn
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, f1_score, hamming_loss, precision_score, recall_score
from sklearn.multioutput import MultiOutputClassifier
from torch.utils.data import DataLoader, TensorDataset
from xgboost import XGBClassifier

from nn_model import MultiLabelLeakNN
from preprocess import LABEL_COLS, LABEL_THRESHOLD, MODELS_DIR, SCENARIO_NAMES, SENSOR_COLS

__all__ = [
    "LABEL_COLS",
    "SCENARIO_NAMES",
    "XGBMultiLabel",
    "train_random_forest",
    "train_xgboost",
    "train_neural_network",
    "select_best_model",
    "evaluate_on_test_set",
    "compute_metrics",
    "get_proba_matrix",
    "evaluate_model",
    "evaluate_nn_model",
    "print_metrics",
]


class XGBMultiLabel:
    """Wrapper for 7 per-label XGBoost classifiers."""

    def __init__(self, estimators: List[XGBClassifier]):
        self.estimators_ = estimators

    def predict_proba(self, X):
        return [est.predict_proba(X) for est in self.estimators_]

    def predict(self, X, threshold: float = LABEL_THRESHOLD):
        proba = self._get_proba_matrix(X)
        return (proba >= threshold).astype(int)

    def _get_proba_matrix(self, X):
        proba_list = self.predict_proba(X)
        return np.column_stack([p[:, 1] for p in proba_list])


def get_proba_matrix(model, X: np.ndarray) -> np.ndarray:
    """Get (n_samples, 7) probability matrix from RF, XGB, or NN."""
    if hasattr(model, "_get_proba_matrix"):
        return model._get_proba_matrix(X)
    if hasattr(model, "estimators_"):
        proba_list = model.predict_proba(X)
        return np.column_stack([p[:, 1] for p in proba_list])
    raise ValueError("Unknown model type")


def get_nn_proba_matrix(nn_model: MultiLabelLeakNN, X_tensor: torch.Tensor, device) -> np.ndarray:
    nn_model.eval()
    with torch.no_grad():
        return nn_model(X_tensor.to(device)).cpu().numpy()


def compute_metrics(Y_true: np.ndarray, Y_pred_proba: np.ndarray, threshold: float = LABEL_THRESHOLD) -> Dict:
    Y_pred = (Y_pred_proba >= threshold).astype(int)

    per_label = {}
    for i, name in enumerate(SCENARIO_NAMES):
        per_label[name] = {
            "f1": float(f1_score(Y_true[:, i], Y_pred[:, i], zero_division=0)),
            "precision": float(precision_score(Y_true[:, i], Y_pred[:, i], zero_division=0)),
            "recall": float(recall_score(Y_true[:, i], Y_pred[:, i], zero_division=0)),
        }

    macro_f1 = float(f1_score(Y_true, Y_pred, average="macro", zero_division=0))
    micro_f1 = float(f1_score(Y_true, Y_pred, average="micro", zero_division=0))
    hamming = float(hamming_loss(Y_true, Y_pred))
    sample_f1 = float(f1_score(Y_true, Y_pred, average="samples", zero_division=0))

    true_multi = (Y_true.sum(axis=1) >= 2).astype(int)
    pred_multi = (Y_pred.sum(axis=1) >= 2).astype(int)
    multi_f1 = float(f1_score(true_multi, pred_multi, zero_division=0))
    multi_prec = float(precision_score(true_multi, pred_multi, zero_division=0))
    multi_rec = float(recall_score(true_multi, pred_multi, zero_division=0))

    true_normal = (Y_true.sum(axis=1) == 0).astype(int)
    pred_normal = (Y_pred.sum(axis=1) == 0).astype(int)
    normal_f1 = float(f1_score(true_normal, pred_normal, zero_division=0))

    return {
        "macro_f1": macro_f1,
        "micro_f1": micro_f1,
        "sample_f1": sample_f1,
        "hamming_loss": hamming,
        "multi_leak_f1": multi_f1,
        "multi_leak_precision": multi_prec,
        "multi_leak_recall": multi_rec,
        "normal_detection_f1": normal_f1,
        "per_label": per_label,
    }


def print_metrics(metrics: Dict, model_name: str) -> None:
    print(f"\n{'=' * 55}")
    print(f"  {model_name} — VALIDATION METRICS")
    print(f"{'=' * 55}")
    print(f"  Macro F1:          {metrics['macro_f1']:.4f}")
    print(f"  Micro F1:          {metrics['micro_f1']:.4f}")
    print(f"  Sample F1:         {metrics['sample_f1']:.4f}")
    print(f"  Hamming Loss:      {metrics['hamming_loss']:.4f}")
    print(f"  Multi-Leak F1:     {metrics['multi_leak_f1']:.4f}")
    print(f"  Multi-Leak Prec:   {metrics['multi_leak_precision']:.4f}")
    print(f"  Multi-Leak Recall: {metrics['multi_leak_recall']:.4f}")
    print(f"  Normal Detect F1:  {metrics['normal_detection_f1']:.4f}")
    print("\n  Per-label F1:")
    for label, m in metrics["per_label"].items():
        bar = "█" * int(m["f1"] * 20)
        print(f"    {label:<30} {m['f1']:.4f}  {bar}")


def evaluate_model(model, X: np.ndarray, Y: np.ndarray, name: str) -> Dict:
    proba = get_proba_matrix(model, X)
    metrics = compute_metrics(Y, proba)
    print_metrics(metrics, name)
    return metrics


def evaluate_nn_model(nn_model: MultiLabelLeakNN, X_tensor: torch.Tensor, Y: np.ndarray, device) -> Dict:
    proba = get_nn_proba_matrix(nn_model, X_tensor, device)
    return compute_metrics(Y, proba)


def train_random_forest(X_train, Y_train, X_val, Y_val):
    print("\n=== TRAINING RANDOM FOREST ===")

    base_rf = RandomForestClassifier(
        n_estimators=300,
        max_depth=20,
        min_samples_leaf=2,
        min_samples_split=4,
        class_weight="balanced",
        max_features="sqrt",
        random_state=42,
        n_jobs=-1,
        verbose=0,
    )

    model = MultiOutputClassifier(base_rf, n_jobs=1)
    model.fit(X_train, Y_train)

    metrics = evaluate_model(model, X_val, Y_val, "RF")
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODELS_DIR / "rf_multilabel.pkl")
    print("Saved → models/rf_multilabel.pkl")
    return model, metrics


def train_xgboost(X_train, Y_train, X_val, Y_val):
    print("\n=== TRAINING XGBOOST ===")

    models = []
    for i, label in enumerate(LABEL_COLS):
        y_i = Y_train[:, i]
        pos = float(y_i.sum())
        neg = float(len(y_i) - pos)
        spw = neg / pos if pos > 0 else 1.0
        print(f"  Training {label} — scale_pos_weight={spw:.2f}")

        xgb = XGBClassifier(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            scale_pos_weight=spw,
            eval_metric="logloss",
            random_state=42,
            n_jobs=-1,
            verbosity=0,
        )
        xgb.fit(X_train, y_i, eval_set=[(X_val, Y_val[:, i])], verbose=False)
        models.append(xgb)

    model = XGBMultiLabel(models)
    metrics = evaluate_model(model, X_val, Y_val, "XGBoost")
    joblib.dump(model, MODELS_DIR / "xgb_multilabel.pkl")
    print("Saved → models/xgb_multilabel.pkl")
    return model, metrics


def train_neural_network(
    X_train_sc,
    Y_train,
    X_val_sc,
    Y_val,
    epochs: int = 60,
    batch_size: int = 512,
    learning_rate: float = 0.001,
):
    print("\n=== TRAINING NEURAL NETWORK ===")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    for i in range(Y_train.shape[1]):
        pos = float(Y_train[:, i].sum())
        neg = float(len(Y_train) - pos)
        pw = neg / pos if pos > 0 else 1.0
        print(f"  {LABEL_COLS[i]:<35} pos_weight={pw:.2f}")

    X_tr = torch.tensor(X_train_sc, dtype=torch.float32)
    Y_tr = torch.tensor(Y_train, dtype=torch.float32)
    X_v = torch.tensor(X_val_sc, dtype=torch.float32)
    Y_v = torch.tensor(Y_val, dtype=torch.float32)

    train_loader = DataLoader(TensorDataset(X_tr, Y_tr), batch_size=batch_size, shuffle=True)

    model = MultiLabelLeakNN(input_dim=42, hidden_dims=[256, 128, 64], num_labels=7).to(device)
    criterion = nn.BCELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", factor=0.5, patience=5
    )

    best_val_loss = float("inf")
    best_epoch = 0
    patience_counter = 0
    early_stop_patience = 12
    best_path = MODELS_DIR / "nn_multilabel_best.pt"

    for epoch in range(1, epochs + 1):
        model.train()
        train_loss = 0.0
        for X_batch, Y_batch in train_loader:
            X_batch = X_batch.to(device)
            Y_batch = Y_batch.to(device)
            optimizer.zero_grad()
            preds = model(X_batch)
            loss = criterion(preds, Y_batch)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * len(X_batch)
        train_loss /= len(X_tr)

        model.eval()
        with torch.no_grad():
            val_preds = model(X_v.to(device))
            val_loss = criterion(val_preds, Y_v.to(device)).item()

        scheduler.step(val_loss)

        if val_loss < best_val_loss - 1e-5:
            best_val_loss = val_loss
            best_epoch = epoch
            patience_counter = 0
            torch.save(model.state_dict(), best_path)
        else:
            patience_counter += 1

        if epoch % 10 == 0 or epoch == 1:
            print(
                f"  Epoch {epoch:3d}/{epochs} "
                f"train_loss={train_loss:.5f} "
                f"val_loss={val_loss:.5f} "
                f"best_epoch={best_epoch}"
            )

        if patience_counter >= early_stop_patience:
            print(f"  Early stopping at epoch {epoch}")
            break

    model.load_state_dict(torch.load(best_path, map_location=device, weights_only=True))
    print(f"\nBest model from epoch {best_epoch} (val_loss={best_val_loss:.5f})")

    metrics = evaluate_nn_model(model, X_v, Y_val, device)
    print_metrics(metrics, "NeuralNetwork")

    torch.save(model.state_dict(), MODELS_DIR / "nn_multilabel.pt")
    print("Saved → models/nn_multilabel.pt")
    return model, metrics


def select_best_model(rf_metrics: Dict, xgb_metrics: Dict, nn_metrics: Dict) -> str:
    scores = {"rf": rf_metrics, "xgb": xgb_metrics, "nn": nn_metrics}

    print(f"\n{'=' * 55}")
    print("  MODEL COMPARISON SUMMARY")
    print(f"{'=' * 55}")
    print(f"  {'Model':<10} {'Macro F1':>10} {'Multi F1':>10} {'Hamming':>10}")
    print(f"  {'-' * 42}")
    for name, m in scores.items():
        print(
            f"  {name.upper():<10} "
            f"{m['macro_f1']:>10.4f} "
            f"{m['multi_leak_f1']:>10.4f} "
            f"{m['hamming_loss']:>10.4f}"
        )

    def composite(m):
        return (
            m["macro_f1"] * 0.50
            + m["multi_leak_f1"] * 0.35
            + (1 - m["hamming_loss"]) * 0.15
        )

    scored = {name: composite(m) for name, m in scores.items()}
    best_name = max(scored, key=scored.get)

    print("\n  Composite scores:")
    for name, s in scored.items():
        marker = " ← BEST" if name == best_name else ""
        print(f"    {name.upper():<6} {s:.4f}{marker}")

    print(f"\n  SELECTED FOR PRODUCTION: {best_name.upper()}")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    result = {
        "best_model": best_name,
        "scores": scored,
        "rf_metrics": rf_metrics,
        "xgb_metrics": xgb_metrics,
        "nn_metrics": nn_metrics,
    }
    with open(MODELS_DIR / "model_selection.json", "w") as f:
        json.dump(result, f, indent=2)
    print("  Saved → models/model_selection.json")
    return best_name


def evaluate_on_test_set(
    rf_model,
    xgb_model,
    nn_model,
    X_test,
    X_test_sc,
    Y_test,
    best_model_name: str,
):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    X_test_tensor = torch.tensor(X_test_sc, dtype=torch.float32)

    print(f"\n{'=' * 55}")
    print("  FINAL TEST SET RESULTS (held-out, never seen)")
    print(f"{'=' * 55}")

    rf_proba = get_proba_matrix(rf_model, X_test)
    rf_test = compute_metrics(Y_test, rf_proba)
    print_metrics(rf_test, "Random Forest (test)")

    xgb_proba = get_proba_matrix(xgb_model, X_test)
    xgb_test = compute_metrics(Y_test, xgb_proba)
    print_metrics(xgb_test, "XGBoost (test)")

    nn_proba = get_nn_proba_matrix(nn_model, X_test_tensor, device)
    nn_test = compute_metrics(Y_test, nn_proba)
    print_metrics(nn_test, "NeuralNetwork (test)")

    proba_map = {"rf": rf_proba, "xgb": xgb_proba, "nn": nn_proba}
    best_proba = proba_map[best_model_name]
    best_pred = (best_proba >= LABEL_THRESHOLD).astype(int)

    print(f"\n{'=' * 55}")
    print(f"  BEST MODEL ({best_model_name.upper()}) — PER-LABEL REPORT")
    print(f"{'=' * 55}")
    print(classification_report(Y_test, best_pred, target_names=SCENARIO_NAMES, zero_division=0))

    test_results = {
        "rf": rf_test,
        "xgb": xgb_test,
        "nn": nn_test,
        "best_model": best_model_name,
    }
    with open(MODELS_DIR / "test_results.json", "w") as f:
        json.dump(test_results, f, indent=2)
    print("Saved → models/test_results.json")

    # Legacy dashboard metadata
    best_metrics = {"rf": rf_test, "xgb": xgb_test, "nn": nn_test}[best_model_name]
    joblib.dump(
        {
            "best_model_name": best_model_name.upper(),
            "best_model_file": f"{best_model_name}_multilabel",
            "Leak_Location_accuracy": best_metrics["macro_f1"],
            "multilabel_location_f1_macro": best_metrics["macro_f1"],
        },
        MODELS_DIR / "best_model.pkl",
    )
    joblib.dump(
        {
            "selection_criterion": "composite_score",
            "active_model_id": f"{best_model_name}_multilabel",
            "active_model_name": f"{best_model_name.upper()} (multi-label)",
            "active_leak_location_accuracy": best_metrics["macro_f1"],
            "active_multilabel_f1": best_metrics["multi_leak_f1"],
            "models": [
                {
                    "id": f"{k}_multilabel",
                    "name": f"{k.upper()} (multi-label)",
                    "leak_location_accuracy": v["macro_f1"],
                    "multilabel_location_f1_macro": v["multi_leak_f1"],
                    "is_active": k == best_model_name,
                }
                for k, v in [("rf", rf_test), ("xgb", xgb_test), ("nn", nn_test)]
            ],
        },
        MODELS_DIR / "model_evaluation.pkl",
    )
