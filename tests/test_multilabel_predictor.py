"""Tests for unified multi-label leak detection pipeline."""

from pathlib import Path

import joblib
import pandas as pd
import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent

LEAK_LOCATIONS = [
    "CAC_Direct_Leak",
    "EGR_Leak",
    "Exhaust_PostTurbine",
    "Exhaust_PreTurbine",
    "Intake_PostTurbo_CAC",
    "Intake_PreTurbo",
    "Minor_Intake_Leak",
]

MULTI_DATASET = PROJECT_ROOT / "data" / "caterpillar_multileak_dataset.csv"
COMBINED = PROJECT_ROOT / "data" / "caterpillar_combined_dataset_clean.csv"
MODEL_SELECTION = PROJECT_ROOT / "models" / "model_selection.json"


def test_combined_dataset_has_correct_labels():
    assert MULTI_DATASET.exists()
    df = pd.read_csv(MULTI_DATASET)
    assert len(df) == 7 * 2500
    label_cols = [f"label_{loc}" for loc in LEAK_LOCATIONS]
    assert (df[label_cols].sum(axis=1) == 2).all()


def test_load_and_split_shape():
    from preprocess import EXPECTED_COLS, EXPECTED_ROWS, load_and_split

    splits = load_and_split(COMBINED)
    X_train, X_val, X_test, *_ = splits
    assert len(X_train) + len(X_val) + len(X_test) == EXPECTED_ROWS
    assert X_train.shape[1] == 42
    assert splits[-1].shape[1] == 7


def test_predict_leak_detects_multi_combo():
    if not MODEL_SELECTION.exists():
        pytest.skip("Run run_training.py first")

    from predict import predict_leak

    df = pd.read_csv(MULTI_DATASET)
    row = df[df["Combo_Label"] == "Intake_PreTurbo+EGR_Leak"].iloc[0]
    sensor_row = row.drop(
        labels=[
            "Leak_Location_A",
            "Leak_Location_B",
            "Is_Multi_Leak",
            "Combo_Label",
        ]
        + [f"label_{loc}" for loc in LEAK_LOCATIONS],
        errors="ignore",
    ).to_dict()

    result = predict_leak(sensor_row)
    multi = result.get("Multi_Pattern") or {}
    assert multi.get("is_multi_leak")
    assert "EGR_Leak" in multi.get("active_locations", [])
    assert "Intake_PreTurbo" in multi.get("active_locations", [])


def test_metrics_above_threshold():
    if not MODEL_SELECTION.exists():
        pytest.skip("Run run_training.py first")

    import json

    results_path = PROJECT_ROOT / "models" / "test_results.json"
    assert results_path.exists()
    results = json.loads(results_path.read_text())
    best = results["best_model"]
    best_metrics = results[best]
    assert best_metrics["macro_f1"] >= 0.90
    assert best_metrics["multi_leak_f1"] >= 0.90
