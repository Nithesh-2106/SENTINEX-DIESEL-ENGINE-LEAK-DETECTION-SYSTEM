"""
Production inference using best trained multi-label model.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional

import joblib
import numpy as np
import torch

from nn_model import MultiLabelLeakNN
from preprocess import LABEL_COLS, LABEL_THRESHOLD, MODELS_DIR, SCENARIO_NAMES, SENSOR_COLS

_scaler = None
_model = None
_model_name: Optional[str] = None
_nn_model = None

THRESHOLD = LABEL_THRESHOLD


def load_models() -> None:
    global _scaler, _model, _model_name, _nn_model

    _scaler = joblib.load(MODELS_DIR / "scaler.pkl")

    selection_path = MODELS_DIR / "model_selection.json"
    if not selection_path.exists():
        raise FileNotFoundError("model_selection.json not found — run run_training.py first")

    with open(selection_path) as f:
        selection = json.load(f)
    _model_name = selection["best_model"]

    if _model_name == "rf":
        _model = joblib.load(MODELS_DIR / "rf_multilabel.pkl")
    elif _model_name == "xgb":
        _model = joblib.load(MODELS_DIR / "xgb_multilabel.pkl")
    elif _model_name == "nn":
        nn = MultiLabelLeakNN(42, [256, 128, 64], 7)
        nn.load_state_dict(
            torch.load(MODELS_DIR / "nn_multilabel.pt", map_location="cpu", weights_only=True)
        )
        nn.eval()
        _nn_model = nn
        _model = nn
    else:
        raise ValueError(f"Unknown best model: {_model_name}")

    print(f"Loaded production model: {_model_name.upper()}")


def warm_load_models() -> None:
    """API startup hook."""
    load_models()


def _get_probs(X_raw: np.ndarray, X_sc: np.ndarray) -> np.ndarray:
    if _model_name == "nn":
        with torch.no_grad():
            return _model(torch.tensor(X_sc, dtype=torch.float32)).numpy()[0]
    if _model_name == "xgb":
        return _model._get_proba_matrix(X_raw)[0]
    proba_list = _model.predict_proba(X_raw)
    return np.array([p[0, 1] for p in proba_list])


def predict(sensor_readings: dict) -> dict:
    """
    Main inference function.

    Rule: count labels with prob >= 0.50
      0 active → Normal
      1 active → Single leak
      2 active → Multi leak
    """
    global _scaler, _model, _model_name

    if _scaler is None:
        load_models()

    X = np.array(
        [[float(sensor_readings.get(col, 0.0)) for col in SENSOR_COLS]],
        dtype=np.float32,
    )
    X_sc = _scaler.transform(X)
    probs = _get_probs(X, X_sc)

    label_probs = {SCENARIO_NAMES[i]: float(round(probs[i], 4)) for i in range(7)}

    active = [
        (SCENARIO_NAMES[i], float(probs[i]))
        for i in range(7)
        if probs[i] >= THRESHOLD
    ]
    active.sort(key=lambda x: (-x[1], x[0]))
    active_count = len(active)

    if active_count == 0:
        leak_present = 0
        leak_location = "Normal"
        secondary = None
        is_multi = False
        display_mode = "NORMAL"
        confidence = float(1.0 - max(probs))
    elif active_count == 1:
        leak_present = 1
        leak_location = active[0][0]
        confidence = active[0][1]
        secondary = None
        is_multi = False
        display_mode = "SINGLE"
    else:
        leak_present = 1
        leak_location = active[0][0]
        confidence = active[0][1]
        secondary = active[1][0]
        is_multi = True
        display_mode = "MULTI_LEAK"

    if not leak_present:
        severity = "None"
        action = "Continue_Testing"
    elif is_multi:
        severity = "Moderate"
        action = "Pause_Test_Inspect_Component"
    elif confidence >= 0.92:
        severity = "Severe"
        action = "Pause_Test_Inspect_Component"
    elif confidence >= 0.75:
        severity = "Moderate"
        action = "Pause_Test_Inspect_Component"
    else:
        severity = "Minor"
        action = "Monitor_Closely"

    return {
        "Leak_Present": leak_present,
        "Leak_Location": leak_location,
        "Leak_Severity": severity,
        "Confidence_Score": round(confidence, 4),
        "Recommended_Action": action,
        "Is_Multi_Leak": is_multi,
        "Secondary_Leak": secondary,
        "Display_Mode": display_mode,
        "display_mode": display_mode,
        "Active_Count": active_count,
        "Label_Probabilities": label_probs,
        "Active_Labels": [a[0] for a in active],
        "Model_Used": _model_name.upper(),
        "multi_leak": {
            "is_multi_leak": is_multi,
            "primary": leak_location if leak_present else None,
            "secondary": [{"scenario": secondary, "probability": active[1][1]}] if secondary else [],
            "label_probabilities": label_probs,
            "detection_source": f"multi_label_{_model_name}",
        },
    }


def predict_full(sensor_readings: dict) -> dict:
    """Backward-compatible alias for predict.py."""
    return predict(sensor_readings)
