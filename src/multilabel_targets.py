"""
Shared multi-label leak location definitions and helpers.

All three production models (RF, XGBoost, NN) use the same 7-location
multi-hot encoding trained on combined single + multi-leak data.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

import numpy as np
import pandas as pd

LEAK_LOCATIONS: List[str] = [
    "CAC_Direct_Leak",
    "EGR_Leak",
    "Exhaust_PostTurbine",
    "Exhaust_PreTurbine",
    "Intake_PostTurbo_CAC",
    "Intake_PreTurbo",
    "Minor_Intake_Leak",
]

LABEL_COLS: List[str] = [f"label_{loc}" for loc in LEAK_LOCATIONS]

# Training target column order: present + 7 locations + severity + action
TARGET_COLS: List[str] = (
    ["Leak_Present"] + LABEL_COLS + ["Leak_Severity", "Recommended_Action"]
)

LOCATION_SLICE = slice(1, 1 + len(LEAK_LOCATIONS))
SEVERITY_IDX = 1 + len(LEAK_LOCATIONS)
ACTION_IDX = SEVERITY_IDX + 1

ACTIVATION_THRESHOLD = 0.50


def label_col_for_location(location: str) -> str:
    return f"label_{location}"


def build_single_row_labels(leak_location: str) -> Dict[str, int]:
    """Multi-hot vector for a single-leak or normal row."""
    labels = {col: 0 for col in LABEL_COLS}
    if leak_location and leak_location != "None":
        col = label_col_for_location(leak_location)
        if col in labels:
            labels[col] = 1
    return labels


def build_targets_from_single_df(df: pd.DataFrame) -> pd.DataFrame:
    """Build unified target frame from the original single-leak dataset."""
    rows = []
    for _, row in df.iterrows():
        loc = str(row.get("Leak_Location", "None"))
        label_bits = build_single_row_labels(loc)
        rows.append(
            {
                "Leak_Present": int(row.get("Leak_Present", 0)),
                **label_bits,
                "Leak_Severity": row.get("Leak_Severity", "None"),
                "Recommended_Action": row.get("Recommended_Action", "Continue_Testing"),
                "_stratify": loc if loc else "None",
            }
        )
    return pd.DataFrame(rows)


def build_targets_from_multi_df(df: pd.DataFrame) -> pd.DataFrame:
    """Build unified target frame from the synthetic multi-leak dataset."""
    rows = []
    for _, row in df.iterrows():
        label_bits = {col: int(row.get(col, 0)) for col in LABEL_COLS}
        rows.append(
            {
                "Leak_Present": 1,
                **label_bits,
                "Leak_Severity": "Moderate",
                "Recommended_Action": "Pause_Test_Inspect_Component",
                "_stratify": str(row.get("Combo_Label", "multi")),
            }
        )
    return pd.DataFrame(rows)


def encode_multilabel_targets(
    y: pd.DataFrame,
    fit: bool = True,
    encoders: Dict | None = None,
) -> Tuple[pd.DataFrame, Dict]:
    """Encode severity/action; keep Leak_Present + label_* as numeric."""
    from sklearn.preprocessing import LabelEncoder

    if encoders is None:
        encoders = {}

    y_out = y.drop(columns=["_stratify"], errors="ignore").copy()
    for col in LABEL_COLS + ["Leak_Present"]:
        y_out[col] = y_out[col].astype(int)

    for col in ["Leak_Severity", "Recommended_Action"]:
        if fit:
            le = LabelEncoder()
            y_out[col] = le.fit_transform(y[col].astype(str))
            encoders[col] = le
        else:
            y_out[col] = encoders[col].transform(y[col].astype(str))

    return y_out, encoders


def location_probs_from_sklearn(model, X: np.ndarray) -> np.ndarray:
    """Per-location probabilities from MultiOutputClassifier (outputs 1..7)."""
    probs = np.zeros((X.shape[0], len(LEAK_LOCATIONS)), dtype=np.float32)
    for i in range(len(LEAK_LOCATIONS)):
        est = model.estimators_[1 + i]
        proba = est.predict_proba(X)
        if proba.shape[1] == 2:
            probs[:, i] = proba[:, 1]
        else:
            probs[:, i] = proba[:, 0]
    return probs


def decode_multilabel_prediction(
    leak_present: int,
    location_probs: Dict[str, float],
    severity_idx: int,
    action_idx: int,
    encoders: Dict,
    threshold: float = ACTIVATION_THRESHOLD,
) -> Tuple[int, str, str, str, Dict]:
    """
    Convert raw model outputs to API fields + Multi_Pattern block.

    Returns:
        leak_present, primary_location, severity, action, multi_pattern
    """
    active = sorted(
        [loc for loc, p in location_probs.items() if p >= threshold],
        key=lambda loc: location_probs[loc],
        reverse=True,
    )

    if leak_present == 0 and not active:
        multi_pattern = {
            "is_multi_leak": False,
            "active_locations": [],
            "primary_location": "None",
            "secondary_location": None,
            "location_probs": {k: round(v, 3) for k, v in location_probs.items()},
            "routing_reason": "No active leak locations above threshold",
        }
        return 0, "None", "None", "Continue_Testing", multi_pattern

    if not active:
        active = [
            max(location_probs, key=location_probs.get)
        ] if location_probs else []

    primary = active[0]
    is_multi = len(active) >= 2
    secondary = active[1] if is_multi else None

    severity = encoders["Leak_Severity"].inverse_transform([severity_idx])[0]
    action = encoders["Recommended_Action"].inverse_transform([action_idx])[0]

    multi_pattern = {
        "is_multi_leak": is_multi,
        "active_locations": active,
        "primary_location": primary,
        "secondary_location": secondary,
        "location_probs": {k: round(v, 3) for k, v in location_probs.items()},
        "routing_reason": (
            f"Unified multi-label model — {len(active)} active location(s)"
        ),
        "detection_model": "unified_multilabel",
    }

    return 1, primary, severity, action, multi_pattern
