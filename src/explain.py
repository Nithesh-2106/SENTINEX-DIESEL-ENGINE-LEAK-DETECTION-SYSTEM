"""
explain.py — SHAP Explainability for Leak Detection Predictions
===============================================================
When the model flags a leak, a test cell engineer needs to know
WHICH sensors triggered it and WHY.  This module uses SHAP
(SHapley Additive exPlanations) to show exactly how much each
sensor reading contributed to the prediction.

Provides:
    explain_prediction()    — single-row explanation dict
    generate_shap_plots()   — summary, beeswarm, waterfall PNGs
    run_explainability_demo() — CLI entry point
"""

import json
import logging
from pathlib import Path
from typing import Dict, List

import joblib
import numpy as np
import pandas as pd
import shap

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)

# ── Paths ────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = PROJECT_ROOT / "models"
DATA_PATH = PROJECT_ROOT / "data" / "caterpillar_testcell_leak_dataset.csv"
SHAP_OUTPUT_DIR = PROJECT_ROOT / "outputs" / "shap"

PLOT_DPI = 150

from baseline_contract import SENSOR_BASELINES

FEATURE_COLUMNS = list(SENSOR_BASELINES.keys())

# ── Metadata columns to drop when loading raw data ───────────────────
METADATA_COLS = [
    "Test_ID", "Timestamp", "Engine_Serial_No", "Test_Cell_ID", "Test_Mode",
]
TARGET_COLS = [
    "Leak_Present", "Leak_Location", "Leak_Severity",
    "Recommended_Action", "Confidence_Score",
]


def _load_xgb_model():
    """Load the saved XGBoost MultiOutputClassifier."""
    path = MODELS_DIR / "xgboost.pkl"
    if not path.exists():
        raise FileNotFoundError(f"XGBoost model not found at {path}. Run train.py first.")
    return joblib.load(path)


def _load_scaler():
    """Load the saved StandardScaler."""
    path = MODELS_DIR / "scaler.pkl"
    if not path.exists():
        raise FileNotFoundError(f"Scaler not found at {path}. Run train.py first.")
    return joblib.load(path)


def _load_encoders() -> Dict:
    """Load all LabelEncoders."""
    encoders = {}
    for col in ["Leak_Location", "Leak_Severity", "Recommended_Action"]:
        path = MODELS_DIR / f"encoder_{col}.pkl"
        if not path.exists():
            raise FileNotFoundError(f"Encoder not found at {path}.")
        encoders[col] = joblib.load(path)
    return encoders


def _interpret_direction(shap_val: float, actual: float, baseline: float) -> str:
    """Generate a human-readable interpretation of the SHAP contribution.

    Args:
        shap_val: SHAP value for this feature.
        actual:   The sensor's actual reading.
        baseline: Expected normal-operation value.

    Returns:
        Interpretation string describing the deviation.
    """
    deviation_pct = ((actual - baseline) / abs(baseline) * 100) if baseline != 0 else 0.0

    if abs(deviation_pct) < 0.5:
        return "Within normal range -- baseline condition"
    if shap_val > 0 and actual >= baseline:
        return "ABOVE normal -- drives leak prediction"
    if shap_val < 0 and actual <= baseline:
        return "BELOW normal -- drives leak prediction"
    if shap_val > 0 and actual < baseline:
        return "BELOW normal -- unexpected direction"
    return "ABOVE normal -- unexpected direction"


def explain_prediction(sensor_row: dict) -> dict:
    """Explain a single prediction using SHAP values.

    Delegates to predict_leak() which now includes SHAP explanation
    in every prediction. This function reshapes the output for
    backward compatibility with callers expecting the nested format.

    Args:
        sensor_row: Dict with 42 feature column names and float values.

    Returns:
        Dict with 'prediction' and 'explanation' sub-dicts.
    """
    from predict import predict_leak

    result = predict_leak(sensor_row)

    top_sensors = result.pop("top_5_sensors_driving_prediction", [])

    return {
        "prediction": result,
        "explanation": {
            "top_5_sensors_driving_prediction": top_sensors,
            "predicted_class": result["Leak_Location"],
            "shap_confidence": result["Confidence_Score"],
        },
    }


def generate_shap_plots(output_dir: str = None) -> None:
    """Generate and save 3 SHAP visualisation plots.

    Creates:
        shap_summary_leak_location.png   — bar chart of feature importances
        shap_beeswarm_leak_location.png  — beeswarm value distribution
        shap_waterfall_sample_leak.png   — single-sample waterfall

    Args:
        output_dir: Target directory (defaults to outputs/shap/).
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    out = Path(output_dir) if output_dir else SHAP_OUTPUT_DIR
    out.mkdir(parents=True, exist_ok=True)

    logger.info("Loading model and data for SHAP plots...")
    model = _load_xgb_model()
    scaler = _load_scaler()
    encoders = _load_encoders()
    loc_estimator = model.estimators_[1]

    df = pd.read_csv(DATA_PATH, keep_default_na=False, na_values=[""])
    X = df.drop(columns=METADATA_COLS + TARGET_COLS)[FEATURE_COLUMNS]
    X_scaled = pd.DataFrame(scaler.transform(X), columns=FEATURE_COLUMNS)

    logger.info("Computing SHAP values (this may take a minute)...")
    explainer = shap.TreeExplainer(loc_estimator)
    shap_values = explainer.shap_values(X_scaled)

    loc_classes = list(encoders["Leak_Location"].classes_)

    # ── Plot A: Summary bar chart ────────────────────────────────
    logger.info("Generating summary bar plot...")
    plt.figure(figsize=(12, 8))
    shap.summary_plot(
        shap_values, X_scaled, plot_type="bar",
        class_names=loc_classes, show=False, max_display=20,
    )
    plt.title("Feature Impact on Leak Location Detection", fontsize=14)
    plt.tight_layout()
    path_a = out / "shap_summary_leak_location.png"
    plt.savefig(path_a, dpi=PLOT_DPI, bbox_inches="tight")
    plt.close()
    logger.info("Saved -> %s", path_a)

    # ── Plot B: Beeswarm ─────────────────────────────────────────
    logger.info("Generating beeswarm plot...")
    intake_pre_idx = loc_classes.index("Intake_PreTurbo") if "Intake_PreTurbo" in loc_classes else 0
    if isinstance(shap_values, list):
        sv_for_beeswarm = shap_values[intake_pre_idx]
    elif shap_values.ndim == 3:
        sv_for_beeswarm = shap_values[:, :, intake_pre_idx]
    else:
        sv_for_beeswarm = shap_values

    plt.figure(figsize=(12, 10))
    shap.summary_plot(
        sv_for_beeswarm, X_scaled, show=False, max_display=15,
    )
    plt.title("SHAP Value Distribution — Leak Location (Intake_PreTurbo class)", fontsize=14)
    plt.tight_layout()
    path_b = out / "shap_beeswarm_leak_location.png"
    plt.savefig(path_b, dpi=PLOT_DPI, bbox_inches="tight")
    plt.close()
    logger.info("Saved -> %s", path_b)

    # ── Plot C: Waterfall for one Intake_PreTurbo sample ─────────
    logger.info("Generating waterfall plot...")
    intake_rows = df[df["Leak_Location"] == "Intake_PreTurbo"]
    sample_idx = intake_rows.index[100] if len(intake_rows) > 100 else intake_rows.index[0]
    scaled_idx = list(df.index).index(sample_idx)

    if isinstance(shap_values, list):
        sv_sample = shap_values[intake_pre_idx][scaled_idx]
    elif shap_values.ndim == 3:
        sv_sample = shap_values[scaled_idx, :, intake_pre_idx]
    else:
        sv_sample = shap_values[scaled_idx]

    explanation_obj = shap.Explanation(
        values=sv_sample,
        base_values=explainer.expected_value[intake_pre_idx] if isinstance(explainer.expected_value, (list, np.ndarray)) else explainer.expected_value,
        data=X_scaled.iloc[scaled_idx].values,
        feature_names=FEATURE_COLUMNS,
    )

    plt.figure(figsize=(12, 8))
    shap.waterfall_plot(explanation_obj, show=False, max_display=15)
    plt.title("Why the Model Said: Intake_PreTurbo (Sample Explanation)", fontsize=13)
    plt.tight_layout()
    path_c = out / "shap_waterfall_sample_leak.png"
    plt.savefig(path_c, dpi=PLOT_DPI, bbox_inches="tight")
    plt.close()
    logger.info("Saved -> %s", path_c)

    logger.info("All SHAP plots generated successfully.")


# ── Demo samples ─────────────────────────────────────────────────────
_SAMPLE_NORMAL = dict(SENSOR_BASELINES)

_SAMPLE_INTAKE_LEAK = {
    "Engine_Speed_Setpoint_RPM": 1800, "Engine_Load_Setpoint_Pct": 75,
    "Engine_Speed_Actual_RPM": 1797.4, "Engine_Load_Actual_Pct": 74.7,
    "Fuel_Flow_Rate_kgph": 42.615, "Engine_Coolant_Temp_C": 87.98,
    "Engine_Oil_Pressure_bar": 4.22, "Ambient_Temp_C": 31.96,
    "Ambient_Pressure_kPa": 101.465, "Ambient_Humidity_Pct": 67.88,
    "Intake_Ambient_Pressure_kPa": 101.465, "MAF_Sensor_Reading_kgph": 710.531,
    "Pre_Compressor_Pressure_kPa": 91.149, "Pre_Compressor_Temp_C": 36.68,
    "Post_Compressor_Pressure_kPa": 197.726, "Post_Compressor_Temp_C": 158.89,
    "Post_CAC_Pressure_kPa": 189.465, "Post_CAC_Temp_C": 49.93,
    "Intake_Manifold_Pressure_kPa": 189.951, "Intake_Manifold_Temp_C": 55.27,
    "Turbocharger_Speed_RPM": 87040.0, "Boost_Pressure_kPa": 96.261,
    "Exhaust_Manifold_Pressure_kPa": 226.709, "Exhaust_Manifold_Temp_C": 690.32,
    "Pre_Turbine_Pressure_kPa": 226.463, "Pre_Turbine_Temp_C": 666.4,
    "Post_Turbine_Pressure_kPa": 112.538, "Post_Turbine_Temp_C": 477.06,
    "Post_DOC_Pressure_kPa": 108.939, "Post_DOC_Temp_C": 489.41,
    "Post_DPF_Pressure_kPa": 106.509, "Post_DPF_Temp_C": 472.21,
    "Post_SCR_Pressure_kPa": 104.277, "Post_SCR_Temp_C": 421.99,
    "Tailpipe_BackPressure_kPa": 102.741, "EGR_Flow_Rate_kgph": 59.5,
    "Intake_Mass_Balance_Error_kgph": 68.806, "Compressor_Pressure_Ratio": 2.1693,
    "Turbine_Expansion_Ratio": 2.0123, "CAC_Pressure_Drop_kPa": 8.261,
    "DPF_Delta_Pressure_kPa": 2.431, "Intake_Temp_Rise_Across_CAC_C": -108.956,
}

_SAMPLE_EGR_LEAK = {
    **_SAMPLE_NORMAL,
    "EGR_Flow_Rate_kgph": 38.0,
    "Intake_Manifold_Temp_C": 59.0,
}

_SAMPLE_CAC_DIRECT_LEAK = {
    **_SAMPLE_NORMAL,
    "Post_CAC_Pressure_kPa": 192.0,
    "Post_CAC_Temp_C": 62.0,
    "CAC_Pressure_Drop_kPa": 26.0,
}

_SAMPLE_MINOR_INTAKE_LEAK = {
    **_SAMPLE_NORMAL,
    "Pre_Compressor_Pressure_kPa": 96.6,
    "Post_Compressor_Pressure_kPa": 209.5,
}

_SAMPLE_EXHAUST_LEAK = {
    "Engine_Speed_Setpoint_RPM": 1800, "Engine_Load_Setpoint_Pct": 75,
    "Engine_Speed_Actual_RPM": 1807.6, "Engine_Load_Actual_Pct": 74.77,
    "Fuel_Flow_Rate_kgph": 42.439, "Engine_Coolant_Temp_C": 88.58,
    "Engine_Oil_Pressure_bar": 4.242, "Ambient_Temp_C": 32.26,
    "Ambient_Pressure_kPa": 101.535, "Ambient_Humidity_Pct": 68.57,
    "Intake_Ambient_Pressure_kPa": 101.535, "MAF_Sensor_Reading_kgph": 712.791,
    "Pre_Compressor_Pressure_kPa": 99.103, "Pre_Compressor_Temp_C": 37.73,
    "Post_Compressor_Pressure_kPa": 204.492, "Post_Compressor_Temp_C": 166.72,
    "Post_CAC_Pressure_kPa": 215.078, "Post_CAC_Temp_C": 51.07,
    "Intake_Manifold_Pressure_kPa": 209.65, "Intake_Manifold_Temp_C": 54.24,
    "Turbocharger_Speed_RPM": 88616.0, "Boost_Pressure_kPa": 102.957,
    "Exhaust_Manifold_Pressure_kPa": 198.034, "Exhaust_Manifold_Temp_C": 731.76,
    "Pre_Turbine_Pressure_kPa": 189.721, "Pre_Turbine_Temp_C": 647.79,
    "Post_Turbine_Pressure_kPa": 107.8, "Post_Turbine_Temp_C": 466.2,
    "Post_DOC_Pressure_kPa": 109.9, "Post_DOC_Temp_C": 491.73,
    "Post_DPF_Pressure_kPa": 107.522, "Post_DPF_Temp_C": 466.73,
    "Post_SCR_Pressure_kPa": 102.588, "Post_SCR_Temp_C": 427.55,
    "Tailpipe_BackPressure_kPa": 101.782, "EGR_Flow_Rate_kgph": 57.8,
    "Intake_Mass_Balance_Error_kgph": 4.514, "Compressor_Pressure_Ratio": 2.0634,
    "Turbine_Expansion_Ratio": 1.7599, "CAC_Pressure_Drop_kPa": -10.587,
    "DPF_Delta_Pressure_kPa": 2.378, "Intake_Temp_Rise_Across_CAC_C": -115.648,
}


def run_explainability_demo() -> None:
    """Run the full explainability demo: plots + sample explanations."""
    logger.info("=" * 65)
    logger.info("  SHAP EXPLAINABILITY DEMO")
    logger.info("=" * 65)

    # Step 1: generate plots
    logger.info("Step 1 -- Generating SHAP plots...")
    try:
        generate_shap_plots()
    except Exception as e:
        logger.warning("Plot generation failed (matplotlib issue?): %s", e)
        logger.info("Continuing with sample explanations...")

    # Step 2: explain representative samples (includes new scenarios 6–8)
    samples = [
        ("Normal Engine (No Leak)", _SAMPLE_NORMAL),
        ("Intake Leak — Pre-Turbo", _SAMPLE_INTAKE_LEAK),
        ("Exhaust Leak — Pre-Turbine", _SAMPLE_EXHAUST_LEAK),
        ("Sample D — EGR System Leak", _SAMPLE_EGR_LEAK),
        ("Sample E — CAC Direct Leak", _SAMPLE_CAC_DIRECT_LEAK),
        ("Sample F — Minor Intake Leak", _SAMPLE_MINOR_INTAKE_LEAK),
    ]

    for label, sample in samples:
        logger.info("-" * 65)
        logger.info("  %s", label)
        logger.info("-" * 65)
        result = explain_prediction(sample)
        print(f"\n{'=' * 65}")
        print(f"  {label}")
        print(f"{'=' * 65}")
        print(json.dumps(result, indent=2))

    print(f"\n{'=' * 65}")
    print("  Demo complete.")
    print(f"{'=' * 65}")


if __name__ == "__main__":
    run_explainability_demo()
