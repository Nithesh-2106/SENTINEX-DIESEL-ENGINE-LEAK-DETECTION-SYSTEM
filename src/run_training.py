"""
Main training script.
Run with: PYTHONPATH=src python src/run_training.py
"""

from pathlib import Path

import torch

from preprocess import DEFAULT_CSV, TRAINING_READY_CSV, load_and_split, resolve_csv_path
from train import (
    evaluate_on_test_set,
    select_best_model,
    train_neural_network,
    train_random_forest,
    train_xgboost,
)


def main():
    csv_path = resolve_csv_path(
        TRAINING_READY_CSV if TRAINING_READY_CSV.exists() else DEFAULT_CSV
    )
    print(f"Dataset: {csv_path}")
    print()

    (
        X_train,
        X_val,
        X_test,
        X_train_sc,
        X_val_sc,
        X_test_sc,
        Y_train,
        Y_val,
        Y_test,
    ) = load_and_split(csv_path)

    rf_model, rf_metrics = train_random_forest(X_train, Y_train, X_val, Y_val)
    xgb_model, xgb_metrics = train_xgboost(X_train, Y_train, X_val, Y_val)
    nn_model, nn_metrics = train_neural_network(
        X_train_sc,
        Y_train,
        X_val_sc,
        Y_val,
        epochs=60,
        batch_size=512,
        learning_rate=0.001,
    )

    best_name = select_best_model(rf_metrics, xgb_metrics, nn_metrics)

    evaluate_on_test_set(
        rf_model,
        xgb_model,
        nn_model,
        X_test,
        X_test_sc,
        Y_test,
        best_name,
    )

    print("\n" + "=" * 55)
    print("  TRAINING COMPLETE")
    print("=" * 55)
    print(f"  Best model:     {best_name.upper()}")
    print("  Models saved:   models/")
    print("  Selection:      models/model_selection.json")
    print("  Test results:   models/test_results.json")
    print()

    _cleanup_legacy_artifacts()


def _cleanup_legacy_artifacts() -> None:
    """Remove obsolete dual-model pipeline artifacts."""
    from preprocess import MODELS_DIR

    legacy = [
        "xgb_single.pkl",
        "rf_single.pkl",
        "nn_single.pt",
        "nn_single_meta.pkl",
        "best_single_model.txt",
        "best_multilabel_model.txt",
        "location_encoder.pkl",
        "multilabel_model_selection.pkl",
        "multilabel_thresholds.pkl",
        "multilabel_thresholds_rf.pkl",
        "multilabel_thresholds_xgb.pkl",
        "multilabel_thresholds_nn.pkl",
        "multilabel_metrics.json",
        "evaluation_report.json",
        "random_forest.pkl",
        "xgboost.pkl",
        "neural_network.pt",
        "nn_meta.pkl",
        "multilabel_nn.pt",
    ]
    removed = []
    for name in legacy:
        path = MODELS_DIR / name
        if path.is_file():
            path.unlink()
            removed.append(name)
    if removed:
        print(f"Removed legacy artifacts: {', '.join(removed)}")


if __name__ == "__main__":
    main()
