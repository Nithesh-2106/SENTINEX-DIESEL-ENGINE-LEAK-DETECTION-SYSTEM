"""
predict.py -- Single-Row Inference Pipeline for Deployment
=========================================================
Loads the best-performing model, scaler, and label encoders from the
models/ directory, then exposes ``predict_leak()`` for real-time
inference on a single sensor-reading dictionary.

Every prediction automatically includes SHAP-based explainability:
the top 5 sensors driving the Leak_Location decision are returned
alongside the prediction itself.

Usage:
    from predict import predict_leak
    result = predict_leak(sensor_row_dict)
"""

import logging
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

# Prevent macOS OpenMP deadlocks with XGBoost + SHAP
os.environ["KMP_DUPLICATE_LIB_OK"] = "True"
os.environ["OMP_NUM_THREADS"] = "1"

import joblib
import numpy as np
import pandas as pd
import shap

from baseline_contract import (
    SENSOR_BASELINES,
    get_sensor_baselines,
    translate_reading_to_c13_frame,
)
from severity_engine import compute_severity
try:
    from steady_state_guard import SteadyStateGuard
except Exception:  # pragma: no cover
    SteadyStateGuard = Any  # type: ignore[misc,assignment]

try:
    from baseline_engine import BaselineEngine
except Exception:  # pragma: no cover
    BaselineEngine = Any  # type: ignore[misc,assignment]

try:
    from data_quality_pipeline import DataQualityPipeline, DQPResult
except Exception:  # pragma: no cover
    DataQualityPipeline = Any  # type: ignore[misc,assignment]
    DQPResult = Any  # type: ignore[misc,assignment]

try:
    from sensor_fault_isolator import (
        SENSOR_DEPENDENCY_MAP,
        SensorFaultIsolator,
        SensorFaultResult,
    )
except Exception:  # pragma: no cover
    SENSOR_DEPENDENCY_MAP = {}  # type: ignore[misc,assignment]
    SensorFaultIsolator = Any  # type: ignore[misc,assignment]
    SensorFaultResult = Any  # type: ignore[misc,assignment]

from inference import predict_full, warm_load_models
from multileak_scenarios import order_active_labels, stabilize_multi_leak_result
from preprocess import SENSOR_COLS

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)

# ── Paths ────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = PROJECT_ROOT / "models"

# ── Expected feature columns (42 features) ──────────────────────────
FEATURE_COLUMNS = SENSOR_COLS
LEAK_LOCATIONS = [
    "CAC_Direct_Leak",
    "EGR_Leak",
    "Exhaust_PostTurbine",
    "Exhaust_PreTurbine",
    "Intake_PostTurbo_CAC",
    "Intake_PreTurbo",
    "Minor_Intake_Leak",
]

SEVERITY_RANK = {
    "None": 0,
    "Minor": 1,
    "Moderate": 2,
    "Severe": 3,
    "Critical": 4,
}

# ── Lazy-loaded singletons ──────────────────────────────────────────
_scaler = None
_xgb_model = None
_shap_explainer = None


def _load_scaler():
    """Load the StandardScaler from disk (cached)."""
    global _scaler
    if _scaler is None:
        path = MODELS_DIR / "scaler.pkl"
        if not path.exists():
            raise FileNotFoundError(f"Scaler not found at {path}. Run train.py first.")
        _scaler = joblib.load(path)
        logger.info("Loaded scaler from %s", path)
    return _scaler


def _load_xgb_for_shap():
    """Load XGBoost multi-label model for SHAP (cached)."""
    global _xgb_model, _shap_explainer

    if _xgb_model is not None:
        return _xgb_model, _shap_explainer

    path = MODELS_DIR / "xgb_multilabel.pkl"
    if not path.exists():
        raise FileNotFoundError(
            f"XGBoost model not found at {path}. Run run_training.py first."
        )

    _xgb_model = joblib.load(path)
    _shap_explainer = None
    logger.info("Loaded XGBoost multi-label model for SHAP.")
    return _xgb_model, _shap_explainer

_MODEL_FILE_TO_NAME = {
    "xgb_single": "XGBoost",
    "xgb_multilabel": "XGBoost",
    "rf_single": "Random Forest",
    "rf_multilabel": "Random Forest",
    "nn_single": "Neural Network",
    "nn_multilabel": "Neural Network",
}

_MODEL_SELECTION_CACHE: Optional[Dict[str, Any]] = None


def get_model_selection_metadata() -> Dict[str, Any]:
    """Return active production model and per-model test-set accuracies."""
    global _MODEL_SELECTION_CACHE
    if _MODEL_SELECTION_CACHE is not None:
        return _MODEL_SELECTION_CACHE

    eval_path = MODELS_DIR / "model_evaluation.pkl"
    if eval_path.exists():
        _MODEL_SELECTION_CACHE = joblib.load(eval_path)
        return _MODEL_SELECTION_CACHE

    sel_path = MODELS_DIR / "model_selection.json"
    active_id = "xgb_multilabel"
    loc_acc = None
    if sel_path.exists():
        import json
        sel = json.loads(sel_path.read_text())
        active_id = f"{sel['best_model']}_multilabel"
        loc_acc = sel.get("xgb_metrics", {}).get("macro_f1")

    best_path = MODELS_DIR / "best_model.pkl"
    if best_path.exists():
        legacy = joblib.load(best_path)
        active_id = legacy.get("best_model_file", active_id)
        loc_acc = legacy.get("Leak_Location_accuracy", loc_acc)

    result = {
        "selection_criterion": "composite_score",
        "active_model_id": active_id,
        "active_model_name": _MODEL_FILE_TO_NAME.get(active_id, active_id),
        "active_leak_location_accuracy": loc_acc,
        "models": [
            {
                "id": f"{k}_multilabel",
                "name": _MODEL_FILE_TO_NAME.get(f"{k}_multilabel", k.upper()),
                "leak_location_accuracy": None,
                "leak_present_accuracy": None,
                "is_active": active_id == f"{k}_multilabel",
            }
            for k in ("rf", "xgb", "nn")
        ],
    }
    _MODEL_SELECTION_CACHE = result
    return result


def _attach_model_selection(result: Dict[str, Any]) -> Dict[str, Any]:
    """Add Model_Selection block to a prediction response dict."""
    if result.get("Model_Selection") is None:
        result["Model_Selection"] = get_model_selection_metadata()
    return result


def _interpret_direction(shap_val: float, actual: float, baseline: float) -> str:
    """Generate a human-readable interpretation of the SHAP contribution."""
    if abs(((actual - baseline) / abs(baseline) * 100) if baseline != 0 else 0.0) < 0.5:
        return "Within normal range -- baseline condition"
    if shap_val > 0 and actual >= baseline:
        return "ABOVE normal -- drives leak prediction"
    if shap_val < 0 and actual <= baseline:
        return "BELOW normal -- drives leak prediction"
    if shap_val > 0 and actual < baseline:
        return "BELOW normal -- unexpected direction"
    return "ABOVE normal -- unexpected direction"


def _worst_severity(*severities: str) -> str:
    """Return the highest-ranked severity among the given values."""
    ranked = [s for s in severities if s and s != "None"]
    if not ranked:
        return "None"
    return max(ranked, key=lambda s: SEVERITY_RANK.get(s, 0))


def _combo_label(active_labels: List[str]) -> Optional[str]:
    """Dataset-style combo label, e.g. Intake_PreTurbo+EGR_Leak."""
    if len(active_labels) < 2:
        return None
    return "+".join(active_labels)


def _multi_leak_to_pattern(ml_result: Optional[Dict]) -> Optional[Dict]:
    """Map unified multi-label inference to dashboard Multi_Pattern format."""
    if not ml_result:
        return None

    label_probs = ml_result.get("Label_Probabilities") or ml_result.get("multi_leak", {}).get(
        "label_probabilities", {}
    )
    active_labels = ml_result.get("Active_Labels") or []
    is_multi = bool(ml_result.get("Is_Multi_Leak") or ml_result.get("multi_leak", {}).get("is_multi_leak"))
    display_mode = ml_result.get("display_mode") or ml_result.get("Display_Mode", "SINGLE")

    base = {
        "is_multi_leak": is_multi,
        "active_locations": active_labels,
        "primary_location": ml_result.get("Leak_Location", "None"),
        "secondary_location": ml_result.get("Secondary_Leak"),
        "location_probs": {k: round(v, 3) for k, v in label_probs.items()},
        "combo_label": _combo_label(active_labels),
        "display_mode": display_mode,
        "detection_model": ml_result.get("Model_Used", "MULTILABEL"),
        "routing_reason": (
            f"Unified multi-label — {len(active_labels)} active scenario(s)"
            if is_multi
            else "Unified multi-label model"
        ),
    }
    return base


def _build_active_leak_details(
    active_labels: List[str],
    label_probs: Dict[str, float],
    sensor_row: dict,
    actual_row_df: pd.DataFrame,
    X_scaled: np.ndarray,
    severity_baseline: Dict[str, float],
    sfi_confirmed: bool,
) -> List[Dict[str, Any]]:
    """Per-active-location physics severity and SHAP (same logic as single leak)."""
    details: List[Dict[str, Any]] = []
    for loc in active_labels:
        if loc not in LEAK_LOCATIONS:
            continue
        phys = compute_severity(
            reading=sensor_row,
            baseline=severity_baseline,
            leak_location=loc,
            sfi_confirmed=sfi_confirmed,
        )
        shap_top5 = _compute_shap_explanation(
            X_scaled,
            actual_row_df,
            loc,
            baseline_overrides=severity_baseline,
        )
        prob = float(label_probs.get(loc, 0.0))
        details.append({
            "location": loc,
            "probability": round(prob, 4),
            "confidence": round(prob, 4),
            "severity": phys.severity,
            "recommended_action": phys.recommended_action,
            "physics_severity": {
                "severity": phys.severity,
                "recommended_action": phys.recommended_action,
                "performance_impact_pct": phys.performance_impact_pct,
                "impact_basis": phys.impact_basis,
                "blend_score": phys.blend_score,
                "severity_method": phys.severity_method,
            },
            "top_5_sensors_driving_prediction": shap_top5,
        })
    return details


def _compute_shap_explanation(
    X_scaled: np.ndarray,
    row_df: pd.DataFrame,
    predicted_location: str,
    baseline_overrides: Optional[Dict[str, float]] = None,
) -> List[Dict]:
    """Compute the top 5 SHAP sensor drivers for the predicted leak scenario."""
    xgb_model, _ = _load_xgb_for_shap()
    X_raw = row_df.values.astype(np.float32)

    est_idx = LEAK_LOCATIONS.index(predicted_location) if predicted_location in LEAK_LOCATIONS else 0
    explainer = shap.TreeExplainer(xgb_model.estimators_[est_idx])
    shap_values = explainer.shap_values(X_raw)

    if isinstance(shap_values, list):
        sv = shap_values[1][0] if len(shap_values) > 1 else shap_values[0][0]
    elif getattr(shap_values, "ndim", 1) == 3:
        sv = shap_values[0, :, 1]
    else:
        sv = shap_values[0]

    abs_shap = np.abs(sv)
    top_indices = np.argsort(abs_shap)[-5:][::-1]

    baseline_lookup = baseline_overrides or SENSOR_BASELINES

    top_sensors: List[Dict] = []
    for idx in top_indices:
        sensor_name = FEATURE_COLUMNS[idx]
        actual_val = float(row_df.iloc[0, idx])
        baseline_val = baseline_lookup.get(sensor_name, SENSOR_BASELINES.get(sensor_name, actual_val))
        deviation_pct = (
            ((actual_val - baseline_val) / abs(baseline_val) * 100)
            if baseline_val != 0 else 0.0
        )
        top_sensors.append({
            "sensor": sensor_name,
            "your_value": round(actual_val, 4),
            "normal_baseline": round(baseline_val, 4),
            "deviation_pct": round(deviation_pct, 2),
            "shap_impact": round(float(sv[idx]), 4),
            "interpretation": _interpret_direction(float(sv[idx]), actual_val, baseline_val),
        })

    return top_sensors


def _reconcile_prediction_heads(
    leak_present: int,
    predicted_location: str,
    predicted_severity: str,
    recommended_action: str,
) -> Tuple[int, str, str, str]:
    """
    Align multi-head model outputs under a single business rule.

    The classifier predicts Leak_Present, Leak_Location, Leak_Severity, and
    Recommended_Action independently. On noisy or borderline readings the
    binary head can disagree with the multiclass heads — e.g. Leak_Present=0
    but Location=Intake_PreTurbo with Pause_Test action.

    Leak_Present is the gate: when no leak, all other fields must reflect
    normal operation. When leak is flagged but location is None, downgrade
    to no leak (no actionable finding).
    """
    if leak_present == 0:
        return 0, "None", "None", "Continue_Testing"

    if predicted_location in ("None", "Normal", None, ""):
        return 0, "None", "None", "Continue_Testing"

    return leak_present, predicted_location, predicted_severity, recommended_action


def _validate_input(sensor_row: dict) -> None:
    """Raise ValueError if required feature columns are missing.

    Args:
        sensor_row: Raw sensor readings dictionary.
    """
    missing = [col for col in FEATURE_COLUMNS if col not in sensor_row]
    if missing:
        raise ValueError(
            f"Missing {len(missing)} required feature column(s): {missing}"
        )


def _format_sfi_metadata(sfi_result: "SensorFaultResult") -> Dict[str, Any]:
    """Serialize SensorFaultResult for API / dashboard consumption."""
    return {
        "checked": True,
        "is_sensor_fault": sfi_result.is_sensor_fault,
        "is_confirmed_leak": sfi_result.is_confirmed_leak,
        "faulty_sensor": sfi_result.faulty_sensor,
        "fault_reason": sfi_result.fault_reason,
        "correlated_deviating": sfi_result.correlated_deviating,
        "correlated_required": sfi_result.correlated_required,
        "confidence_modifier": sfi_result.confidence_modifier,
        "fault_type": sfi_result.fault_type,
        "fault_confidence": sfi_result.fault_confidence,
    }


def _is_sfi_demo_scenario(demo_scenario: Optional[str]) -> bool:
    return bool(demo_scenario and str(demo_scenario).startswith("sensor_fault"))


def _format_dqp_metadata(dqp_result: "DQPResult") -> Dict[str, Any]:
    """Serialize DQPResult flags for API / dashboard consumption."""
    return {
        "score": dqp_result.data_quality_score,
        "is_usable": dqp_result.is_usable,
        "summary": dqp_result.summary,
        "flags": [
            {
                "sensor": f.sensor,
                "type": f.flag_type,
                "severity": f.severity,
                "original": (
                    round(f.original_value, 3)
                    if not np.isnan(f.original_value)
                    else None
                ),
                "cleaned": round(f.cleaned_value, 3),
                "detail": f.description,
            }
            for f in dqp_result.flags
        ],
    }


def predict_leak(
    sensor_row: dict,
    guard: Optional["SteadyStateGuard"] = None,
    baseline_engine: Optional["BaselineEngine"] = None,
    dqp: Optional["DataQualityPipeline"] = None,
    sfi: Optional["SensorFaultIsolator"] = None,
    demo_scenario: Optional[str] = None,
    engine_id: str = "CAT_C13",
) -> dict:
    """Predict leak status from a single row of sensor readings.

    Processing order when optional modules are enabled:
      0. Save raw reading for SFI health tracking
      1. Data Quality Pipeline (clean raw reading)
      2. SFI health update (on raw reading, before cleaning effects)
      3. Steady State Guard (suppress during transients)
      4. ML model inference
      5. SHAP explainability with dynamic baseline
      6. Sensor Fault Isolation (validate physical consistency)
    """
    _validate_input(sensor_row)

    sensor_row = dict(sensor_row)
    sensor_row_original = dict(sensor_row)

    # ── Stage 1: Data Quality Pipeline (optional) ─────────────────────
    dqp_result: Optional["DQPResult"] = None
    if dqp is not None:
        dqp_result = dqp.process(sensor_row)
        sensor_row = dqp_result.cleaned_reading
        if not dqp_result.is_usable:
            logger.warning(
                "DQP: reading marked unusable (score=%s). Proceeding with cleaned values.",
                dqp_result.data_quality_score,
            )

    if sfi is not None:
        sfi.update(sensor_row_original)

    # ── Stage 2: Steady State Guard (optional) ────────────────────────
    if guard is not None:
        guard.add_reading(sensor_row)
        is_steady, reason = guard.is_steady_state()
        if not is_steady and not _is_sfi_demo_scenario(demo_scenario):
            suppressed = {
                "Leak_Present": 0,
                "Leak_Location": "None",
                "Leak_Severity": "None",
                "Recommended_Action": "Continue_Testing",
                "Confidence_Score": 1.0,
                "Suppressed": True,
                "Suppression_Reason": reason,
                "Steady_State_Metrics": guard.get_steady_state_metrics(),
                "Dynamic_Baseline": None,
                "Data_Quality": (
                    _format_dqp_metadata(dqp_result) if dqp_result else None
                ),
                "Sensor_Fault_Isolation": None,
                "top_5_sensors_driving_prediction": [],
            }
            return _attach_model_selection(suppressed)

    # ── Stage 3: Dynamic Baseline (optional) ─────────────────────────
    dynamic_baseline: Optional[Dict[str, float]] = None
    if baseline_engine is not None:
        dynamic_baseline = baseline_engine.compute_baseline(
            rpm=float(sensor_row["Engine_Speed_Actual_RPM"]),
            load_pct=float(sensor_row["Engine_Load_Actual_Pct"]),
            ambient_pressure_kpa=float(sensor_row["Ambient_Pressure_kPa"]),
            ambient_temp_c=float(sensor_row["Ambient_Temp_C"]),
        )

    # ML was trained on C13 absolute values — map other engines by deviation ratio.
    ml_reading = translate_reading_to_c13_frame(sensor_row, engine_id)
    row_df = pd.DataFrame([ml_reading])[FEATURE_COLUMNS]
    actual_row_df = pd.DataFrame([sensor_row])[FEATURE_COLUMNS]
    scaler = _load_scaler()
    X_scaled = scaler.transform(row_df)

    ml_result = predict_full(ml_reading)
    ml_result = stabilize_multi_leak_result(ml_result, demo_scenario)
    if ml_result.get("Leak_Location") == "Normal":
        ml_result["Leak_Location"] = "None"

    leak_present = int(ml_result["Leak_Present"])
    predicted_location = ml_result["Leak_Location"]
    predicted_severity = ml_result["Leak_Severity"]
    recommended_action = ml_result["Recommended_Action"]
    confidence = float(ml_result["Confidence_Score"])
    multi_pattern_payload = _multi_leak_to_pattern(ml_result)

    leak_present, predicted_location, predicted_severity, recommended_action = (
        _reconcile_prediction_heads(
            leak_present,
            predicted_location,
            predicted_severity,
            recommended_action,
        )
    )

    shap_baseline = get_sensor_baselines(engine_id)
    shap_location = (
        predicted_location if predicted_location in LEAK_LOCATIONS else "None"
    )
    top_sensors = _compute_shap_explanation(
        X_scaled,
        actual_row_df,
        shap_location,
        baseline_overrides=shap_baseline,
    )

    # ── Stage 5: Sensor Fault Isolation (optional) ────────────────────
    # Always compare against fixed normal-operation baselines (training /
    # simulator reference). Dynamic baselines are operating-point aware but
    # their pressure chain differs from SENSOR_BASELINES and break cascade
    # detection when used here.
    sfi_result: Optional["SensorFaultResult"] = None
    sfi_baseline: Optional[Dict[str, float]] = None
    if sfi is not None:
        sfi_baseline = get_sensor_baselines(engine_id)
        dqp_flags = dqp_result.flags if dqp_result is not None else None

        if predicted_location != "None":
            sfi_result = sfi.check(
                predicted_location=predicted_location,
                sensor_reading=sensor_row,
                baseline=sfi_baseline,
                dqp_flags=dqp_flags,
            )

            if sfi_result.is_sensor_fault:
                logger.warning(
                    "SFI: Sensor fault detected. Overriding leak prediction. "
                    "Faulty sensor: %s",
                    sfi_result.faulty_sensor,
                )
                leak_present = 0
                predicted_location = "None"
                predicted_severity = "None"
                recommended_action = "Inspect_Sensor_Hardware"
                confidence = 0.0
                top_sensors = []
            else:
                confidence = min(
                    1.0,
                    confidence * sfi_result.confidence_modifier,
                )

        elif leak_present == 0:
            # Only flag isolated single-sensor faults when the ML model
            # did not predict a leak. Multi-sensor cascades are genuine leaks.
            sfi_result = sfi.detect_isolated_fault(
                sensor_row_original,
                sfi_baseline,
                dqp_flags=dqp_flags,
            )
            if sfi_result is not None:
                recommended_action = "Inspect_Sensor_Hardware"
                confidence = 0.0
                logger.warning(
                    "SFI: Isolated sensor fault on '%s'.",
                    sfi_result.faulty_sensor,
                )

    active_leak_details: List[Dict[str, Any]] = []
    active_labels: List[str] = []
    physics_severity_payload: Optional[Dict[str, Any]] = None
    if leak_present == 1 and predicted_location not in ("None", None, ""):
        sfi_confirmed = (
            bool(sfi_result.is_confirmed_leak)
            if sfi_result is not None
            else True
        )
        severity_baseline = (
            sfi_baseline
            if sfi is not None and sfi_baseline is not None
            else get_sensor_baselines(engine_id)
        )
        active_labels = order_active_labels(
            list(ml_result.get("Active_Labels") or []),
            demo_scenario,
        )
        if not active_labels:
            active_labels = [predicted_location]
        label_probs = ml_result.get("Label_Probabilities") or {}

        active_leak_details = _build_active_leak_details(
            active_labels,
            label_probs,
            sensor_row,
            actual_row_df,
            X_scaled,
            severity_baseline,
            sfi_confirmed,
        )

        if active_leak_details:
            primary_detail = active_leak_details[0]
            predicted_severity = _worst_severity(
                *(d["severity"] for d in active_leak_details)
            )
            worst_detail = next(
                (d for d in active_leak_details if d["severity"] == predicted_severity),
                primary_detail,
            )
            recommended_action = worst_detail["recommended_action"]
            physics_severity_payload = primary_detail["physics_severity"]
            top_sensors = primary_detail["top_5_sensors_driving_prediction"]

        if multi_pattern_payload is not None:
            multi_pattern_payload["active_leak_details"] = active_leak_details
            multi_pattern_payload["active_locations"] = active_labels
            multi_pattern_payload["primary_location"] = active_labels[0] if active_labels else predicted_location
            multi_pattern_payload["secondary_location"] = (
                active_labels[1] if len(active_labels) > 1 else None
            )
            multi_pattern_payload["combo_label"] = _combo_label(active_labels)

    result = {
        "Leak_Present": leak_present,
        "Leak_Location": predicted_location,
        "Leak_Severity": predicted_severity,
        "Recommended_Action": recommended_action,
        "Confidence_Score": round(confidence, 4),
        "top_5_sensors_driving_prediction": top_sensors,
        "display_mode": ml_result.get("display_mode") or ml_result.get("Display_Mode", "SINGLE"),
        "Is_Multi_Leak": bool(ml_result.get("Is_Multi_Leak")),
        "Secondary_Leak": ml_result.get("Secondary_Leak"),
        "Active_Labels": active_labels if leak_present else [],
        "Label_Probabilities": ml_result.get("Label_Probabilities") or {},
        "Active_Leak_Details": active_leak_details,
        "multi_leak": ml_result.get("multi_leak"),
    }

    if physics_severity_payload is not None:
        result["Physics_Severity"] = physics_severity_payload

    if multi_pattern_payload is not None:
        result["Multi_Pattern"] = multi_pattern_payload

    if (
        guard is not None
        or baseline_engine is not None
        or dqp is not None
        or sfi is not None
    ):
        result.update(
            {
                "Suppressed": False,
                "Suppression_Reason": None,
                "Steady_State_Metrics": (
                    guard.get_steady_state_metrics() if guard is not None else None
                ),
                "Dynamic_Baseline": dynamic_baseline,
                "Data_Quality": (
                    _format_dqp_metadata(dqp_result) if dqp_result else None
                ),
                "Sensor_Fault_Isolation": (
                    _format_sfi_metadata(sfi_result) if sfi_result else None
                ),
            }
        )
    elif dqp_result is not None:
        result["Data_Quality"] = _format_dqp_metadata(dqp_result)
        result["Sensor_Fault_Isolation"] = (
            _format_sfi_metadata(sfi_result) if sfi_result else None
        )
    else:
        result["Data_Quality"] = None
        result["Sensor_Fault_Isolation"] = (
            _format_sfi_metadata(sfi_result) if sfi_result else None
        )

    return _attach_model_selection(result)


# ── Interactive prediction mode ──────────────────────────────────────
if __name__ == "__main__":
    import json
    import sys

    from preprocess import load_data, METADATA_COLS, LABEL_ONLY_COL

    SEPARATOR = "=" * 65

    def _run_custom_input():
        """Prompt the user for each sensor value and run prediction."""
        print(f"\n{SEPARATOR}")
        print("  CUSTOM SENSOR INPUT MODE")
        print(f"  Enter values for all {len(FEATURE_COLUMNS)} sensor readings.")
        print(f"  Press Ctrl+C to cancel at any time.")
        print(f"{SEPARATOR}\n")

        sensor_row = {}
        for i, col in enumerate(FEATURE_COLUMNS, 1):
            while True:
                try:
                    val = input(f"  [{i:2d}/{len(FEATURE_COLUMNS)}] {col}: ")
                    sensor_row[col] = float(val)
                    break
                except ValueError:
                    print(f"         Invalid number. Try again.")

        result = predict_leak(sensor_row)
        print(f"\n{SEPARATOR}")
        print("  PREDICTION RESULT")
        print(f"{SEPARATOR}")
        print(json.dumps(result, indent=2))
        print(SEPARATOR)

    def _run_dataset_sample(index: int):
        """Run prediction on a specific row from the dataset."""
        df = load_data()
        if index < 0 or index >= len(df):
            print(f"Error: Index {index} out of range (0–{len(df) - 1}).")
            return

        targets = ["Leak_Present", "Leak_Location", "Leak_Severity",
                    "Recommended_Action", LABEL_ONLY_COL]
        sample = df.drop(columns=METADATA_COLS + targets).iloc[index].to_dict()

        actual_location = df.iloc[index]["Leak_Location"]
        actual_severity = df.iloc[index]["Leak_Severity"]

        result = predict_leak(sample)
        print(f"\n{SEPARATOR}")
        print(f"  PREDICTION FOR ROW {index}")
        print(f"{SEPARATOR}")
        print(f"  Actual  → Leak_Location: {actual_location}, Severity: {actual_severity}")
        print(f"{SEPARATOR}")
        print(json.dumps(result, indent=2))
        print(SEPARATOR)

    # ── CLI entry point ──────────────────────────────────────────
    print(f"\n{SEPARATOR}")
    print("  CATERPILLAR LEAK DETECTION — PREDICTION TOOL")
    print(SEPARATOR)
    print("  Options:")
    print("    1  → Enter your own sensor measurements")
    print("    2  → Pick a row from the dataset (by index)")
    print("    3  → Quick demo (one row per scenario: all 8 leak types + normal)")
    print(SEPARATOR)

    choice = input("\n  Select option (1/2/3): ").strip()

    if choice == "1":
        _run_custom_input()
    elif choice == "2":
        try:
            idx = int(input("  Enter row index (0–14399): ").strip())
            _run_dataset_sample(idx)
        except ValueError:
            print("  Invalid index.")
    elif choice == "3":
        demo_rows = [
            (100, "Normal"),
            (1900, "Intake_PreTurbo"),
            (3700, "Intake_PostTurbo_CAC"),
            (5500, "Exhaust_PreTurbine"),
            (7300, "Exhaust_PostTurbine"),
            (9100, "EGR_Leak"),
            (10900, "CAC_Direct_Leak"),
            (12700, "Minor_Intake_Leak"),
        ]
        for idx, label in demo_rows:
            print(f"\n  --- {label} (row {idx}) ---")
            _run_dataset_sample(idx)
    else:
        print("  Invalid option.")
