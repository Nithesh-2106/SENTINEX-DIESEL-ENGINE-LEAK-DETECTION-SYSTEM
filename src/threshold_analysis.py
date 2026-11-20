"""
threshold_analysis.py — Confidence Threshold Sensitivity Analysis
================================================================
Demonstrates the operational trade-off between catching every leak
early (high recall, more false alarms) and only flagging
high-confidence leaks (high precision, fewer disruptions).

This is a real decision in test cells: safety-critical runs need
aggressive thresholds; routine endurance tests need quieter ones.

Provides:
    run_threshold_analysis()      — sweep thresholds, save CSV + plot
    get_recommended_threshold()   — safety vs efficiency recommendation
    print_threshold_summary()     — formatted table at key thresholds
"""

import logging
from pathlib import Path
from typing import List, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import f1_score, precision_score, recall_score

from preprocess import run_preprocessing

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)

# ── Paths ────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = PROJECT_ROOT / "models"
OUTPUTS_DIR = PROJECT_ROOT / "outputs"
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

# ── Threshold sweep range ────────────────────────────────────────────
THRESHOLD_MIN = 0.10
THRESHOLD_MAX = 0.90
THRESHOLD_STEP = 0.05

PLOT_DPI = 150


def _load_xgb_model():
    """Load the saved XGBoost MultiOutputClassifier."""
    path = MODELS_DIR / "xgboost.pkl"
    if not path.exists():
        raise FileNotFoundError(f"XGBoost model not found at {path}. Run train.py first.")
    return joblib.load(path)


def _sweep_thresholds(
    y_true: np.ndarray, probas: np.ndarray
) -> List[dict]:
    """Compute metrics at every threshold in the sweep range.

    Args:
        y_true: Ground truth binary labels (0/1) for Leak_Present.
        probas: Predicted probabilities of class 1 (leak present).

    Returns:
        List of dicts, one per threshold, with precision/recall/F1 etc.
    """
    results = []
    thresholds = np.arange(THRESHOLD_MIN, THRESHOLD_MAX + THRESHOLD_STEP / 2, THRESHOLD_STEP)

    for t in thresholds:
        y_pred = (probas >= t).astype(int)

        tp = int(np.sum((y_pred == 1) & (y_true == 1)))
        fp = int(np.sum((y_pred == 1) & (y_true == 0)))
        fn = int(np.sum((y_pred == 0) & (y_true == 1)))
        tn = int(np.sum((y_pred == 0) & (y_true == 0)))

        precision = precision_score(y_true, y_pred, zero_division=0)
        recall = recall_score(y_true, y_pred, zero_division=0)
        f1 = f1_score(y_true, y_pred, zero_division=0)

        false_alarm_rate = fp / (fp + tn) if (fp + tn) > 0 else 0.0
        missed_leak_rate = fn / (fn + tp) if (fn + tp) > 0 else 0.0

        results.append({
            "Threshold": round(float(t), 2),
            "Precision": round(precision, 4),
            "Recall": round(recall, 4),
            "F1": round(f1, 4),
            "False_Alarm_Rate": round(false_alarm_rate, 4),
            "Missed_Leak_Rate": round(missed_leak_rate, 4),
            "TP": tp, "FP": fp, "FN": fn, "TN": tn,
        })

    return results


def _generate_plot(df: pd.DataFrame) -> None:
    """Save the threshold sensitivity plot with two subplots.

    Args:
        df: DataFrame from the threshold sweep with all metrics.
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))

    # Left: Precision / Recall / F1
    ax1.plot(df["Threshold"], df["Precision"], "b-o", markersize=3, label="Precision")
    ax1.plot(df["Threshold"], df["Recall"], color="orange", marker="o", markersize=3, label="Recall")
    ax1.plot(df["Threshold"], df["F1"], "g-o", markersize=3, label="F1")
    ax1.axvline(x=0.5, color="red", linestyle="--", alpha=0.7, label="Default Threshold (0.5)")
    ax1.set_xlabel("Confidence Threshold", fontsize=11)
    ax1.set_ylabel("Score (0 to 1)", fontsize=11)
    ax1.set_title("Precision / Recall / F1 vs Decision Threshold", fontsize=12)
    ax1.legend(fontsize=9)
    ax1.grid(True, alpha=0.3)
    ax1.set_xlim(THRESHOLD_MIN, THRESHOLD_MAX)
    ax1.set_ylim(-0.05, 1.05)

    # Right: False Alarm vs Missed Leak
    ax2.plot(df["Threshold"], df["False_Alarm_Rate"], "r-o", markersize=3, label="False Alarm Rate")
    ax2.plot(df["Threshold"], df["Missed_Leak_Rate"], "b-o", markersize=3, label="Missed Leak Rate")
    ax2.axvline(x=0.5, color="red", linestyle="--", alpha=0.7, label="Default Threshold (0.5)")
    ax2.set_xlabel("Confidence Threshold", fontsize=11)
    ax2.set_ylabel("Rate (0 to 1)", fontsize=11)
    ax2.set_title("Operational Trade-off: False Alarms vs Missed Leaks", fontsize=12)
    ax2.legend(fontsize=9)
    ax2.grid(True, alpha=0.3)
    ax2.set_xlim(THRESHOLD_MIN, THRESHOLD_MAX)
    ax2.set_ylim(-0.05, 1.05)

    plt.tight_layout()
    path = OUTPUTS_DIR / "threshold_sensitivity.png"
    fig.savefig(path, dpi=PLOT_DPI, bbox_inches="tight")
    plt.close(fig)
    logger.info("Saved threshold plot -> %s", path)


def run_threshold_analysis() -> pd.DataFrame:
    """Run the full threshold sweep analysis.

    Loads test set, gets XGBoost predict_proba for Leak_Present,
    sweeps thresholds 0.10–0.90, saves CSV and plot.

    Returns:
        DataFrame with metrics at every threshold.
    """
    logger.info("Running threshold sensitivity analysis...")

    data = run_preprocessing()
    model = _load_xgb_model()

    X_test = data["X_test"]
    y_test_present = data["y_test"]["Leak_Present"].values

    probas = model.estimators_[0].predict_proba(X_test)[:, 1]
    logger.info(
        "Probability range: min=%.4f, max=%.4f, mean=%.4f",
        probas.min(), probas.max(), probas.mean(),
    )

    results = _sweep_thresholds(y_test_present, probas)
    df = pd.DataFrame(results)

    csv_path = OUTPUTS_DIR / "threshold_analysis.csv"
    df.to_csv(csv_path, index=False)
    logger.info("Saved threshold analysis -> %s", csv_path)

    try:
        _generate_plot(df)
    except Exception as e:
        logger.warning("Could not generate plot: %s", e)

    return df


def get_recommended_threshold(priority: str) -> float:
    """Recommend a threshold based on operational priority.

    Args:
        priority: 'safety' (catch 98%+ leaks) or 'efficiency'
                  (minimize false alarms to < 5%).

    Returns:
        Recommended threshold value.

    Raises:
        ValueError: If priority is not 'safety' or 'efficiency'.
    """
    csv_path = OUTPUTS_DIR / "threshold_analysis.csv"
    if not csv_path.exists():
        logger.info("Threshold analysis not found -- running now...")
        run_threshold_analysis()

    df = pd.read_csv(csv_path)

    if priority == "safety":
        candidates = df[df["Missed_Leak_Rate"] < 0.02]
        if candidates.empty:
            threshold = df.loc[df["Missed_Leak_Rate"].idxmin(), "Threshold"]
        else:
            threshold = float(candidates["Threshold"].max())

        row = df[df["Threshold"] == threshold].iloc[0]
        print(f"\n  Safety mode threshold: {threshold}")
        print(f"  -> Catches {(1 - row['Missed_Leak_Rate']) * 100:.1f}% of leaks.")
        print(f"  -> False alarm rate: {row['False_Alarm_Rate'] * 100:.1f}%")
        print(f"  Recommended for: emissions compliance testing, pre-certification runs.\n")
        return threshold

    elif priority == "efficiency":
        candidates = df[df["False_Alarm_Rate"] < 0.05]
        if candidates.empty:
            threshold = df.loc[df["False_Alarm_Rate"].idxmin(), "Threshold"]
        else:
            threshold = float(candidates["Threshold"].min())

        row = df[df["Threshold"] == threshold].iloc[0]
        print(f"\n  Efficiency mode threshold: {threshold}")
        print(f"  -> False alarm rate: {row['False_Alarm_Rate'] * 100:.1f}%")
        print(f"  -> Catches {(1 - row['Missed_Leak_Rate']) * 100:.1f}% of leaks.")
        print(f"  Recommended for: routine endurance testing, break-in runs.\n")
        return threshold

    else:
        raise ValueError(f"priority must be 'safety' or 'efficiency', got '{priority}'")


def print_threshold_summary() -> None:
    """Print a formatted table of metrics at 5 key thresholds."""
    csv_path = OUTPUTS_DIR / "threshold_analysis.csv"
    if not csv_path.exists():
        logger.info("Threshold analysis not found -- running now...")
        run_threshold_analysis()

    df = pd.read_csv(csv_path)
    key_thresholds = [0.2, 0.35, 0.5, 0.65, 0.8]

    best_f1_threshold = float(df.loc[df["F1"].idxmax(), "Threshold"])

    header = f"{'Threshold':>10} | {'Precision':>10} | {'Recall':>10} | {'F1':>10} | {'FalseAlarm':>10} | {'MissedLeak':>10}"
    separator = "-" * len(header)

    print(f"\n{separator}")
    print("  THRESHOLD SENSITIVITY SUMMARY")
    print(separator)
    print(header)
    print(separator)

    for t in key_thresholds:
        row = df.loc[(df["Threshold"] - t).abs().idxmin()]
        marker = "  ← Best F1" if abs(row["Threshold"] - best_f1_threshold) < 0.01 else ""
        print(
            f"{row['Threshold']:>10.2f} | {row['Precision']:>10.4f} | "
            f"{row['Recall']:>10.4f} | {row['F1']:>10.4f} | "
            f"{row['False_Alarm_Rate']:>10.4f} | "
            f"{row['Missed_Leak_Rate']:>10.4f}{marker}"
        )

    print(separator)
    print(f"  Best F1 threshold: {best_f1_threshold}")
    print(separator + "\n")


if __name__ == "__main__":
    df = run_threshold_analysis()
    print_threshold_summary()
    get_recommended_threshold("safety")
    get_recommended_threshold("efficiency")
