"""
validate_scenarios.py — Clean vs noisy validation demonstration
===============================================================
Runs predict_leak() on representative rows from the clean dataset
(8 scenarios) and selected noisy rows through the real Data Quality
Pipeline to demonstrate pre/post-DQP inference behaviour.
"""

from __future__ import annotations

import copy
import logging
from pathlib import Path
from typing import Dict, List, Tuple

import pandas as pd

from data_quality_pipeline import NORMAL_READING, DataQualityPipeline
from multilabel_targets import LABEL_COLS, LEAK_LOCATIONS, TARGET_COLS, build_single_row_labels
from preprocess import LABEL_ONLY_COL, METADATA_COLS, SENSOR_COLS, load_data
from predict import predict_leak

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CLEAN_DATA_PATH = PROJECT_ROOT / "data" / "caterpillar_testcell_leak_dataset_clean.csv"
MULTI_DATA_PATH = PROJECT_ROOT / "data" / "caterpillar_multileak_dataset.csv"
COMBINED_DATA_PATH = PROJECT_ROOT / "data" / "caterpillar_combined_dataset_clean.csv"
NOISY_DATA_PATH = PROJECT_ROOT / "data" / "caterpillar_testcell_leak_dataset.csv"

SINGLE_VALIDATION_ROWS: List[Tuple[int, str]] = [
    (450, "Normal"),
    (2250, "Intake_PreTurbo"),
    (4050, "Intake_PostTurbo_CAC"),
    (5850, "Exhaust_PreTurbine"),
    (7650, "Exhaust_PostTurbine"),
    (9450, "EGR_Leak"),
    (11250, "CAC_Direct_Leak"),
    (13050, "Minor_Intake_Leak"),
]

# One mid-block row per combo (2,500 rows each) — matches dashboard MULTI_LEAK_SCENARIOS
MULTI_VALIDATION_ROWS: List[Tuple[int, str, str]] = [
    (1250, "Multi: Intake Pre-Turbo + EGR", "Intake_PreTurbo+EGR_Leak"),
    (3750, "Multi: Intake Post-Turbo/CAC + EGR", "Intake_PostTurbo_CAC+EGR_Leak"),
    (6250, "Multi: CAC Direct + EGR", "CAC_Direct_Leak+EGR_Leak"),
    (8750, "Multi: Exhaust Post-Turbine + EGR", "Exhaust_PostTurbine+EGR_Leak"),
    (11250, "Multi: Exhaust Post + Intake Pre", "Exhaust_PostTurbine+Intake_PreTurbo"),
    (13750, "Multi: Exhaust Post + CAC Direct", "Exhaust_PostTurbine+CAC_Direct_Leak"),
    (16250, "Multi: Minor Intake + EGR", "Minor_Intake_Leak+EGR_Leak"),
]

# Backward-compatible alias
CLEAN_VALIDATION_ROWS = SINGLE_VALIDATION_ROWS

NOISY_DEMO_ROWS: List[Tuple[int, str, str]] = [
    (451, "Normal", "SPIKE"),
    (2251, "Intake_PreTurbo", "DRIFT"),
    (5851, "Exhaust_PreTurbine", "MISSING"),
]

_PRESSURE_PATH_SENSORS: List[str] = [
    "Pre_Compressor_Pressure_kPa",
    "Post_Compressor_Pressure_kPa",
    "Post_CAC_Pressure_kPa",
    "Boost_Pressure_kPa",
    "Intake_Manifold_Pressure_kPa",
    "CAC_Pressure_Drop_kPa",
    "Intake_Mass_Balance_Error_kgph",
]


def _row_to_features(df: pd.DataFrame, index: int) -> Dict[str, float]:
    """Extract 42 sensor features from a dataset row."""
    if all(c in df.columns for c in SENSOR_COLS):
        return df[SENSOR_COLS].iloc[index].to_dict()
    drop_cols = [
        c for c in METADATA_COLS + TARGET_COLS + [LABEL_ONLY_COL]
        if c in df.columns
    ]
    extra_drop = [
        c for c in df.columns
        if c.startswith("label_") or c in (
            "Leak_Location_A", "Leak_Location_B", "Is_Multi_Leak",
            "Combo_Label", "Data_Source", "Stratify_Key",
        )
    ]
    return df.drop(columns=drop_cols + extra_drop, errors="ignore").iloc[index].to_dict()


def _active_labels_from_row(df: pd.DataFrame, index: int) -> List[str]:
    """Ground-truth active leak locations from label_* columns or Leak_Location."""
    if all(c in df.columns for c in LABEL_COLS):
        row = df.iloc[index]
        return sorted(
            loc for loc in LEAK_LOCATIONS
            if str(row.get(f"label_{loc}", 0)) in ("1", "True", "true")
        )
    loc = str(df.iloc[index].get("Leak_Location", "None"))
    bits = build_single_row_labels(loc)
    return sorted(loc for loc in LEAK_LOCATIONS if bits.get(f"label_{loc}", 0))


def _active_labels_from_prediction(result: Dict[str, object]) -> List[str]:
    """Predicted active leak locations from multilabel inference output."""
    labels = result.get("Active_Labels") or []
    if labels:
        return sorted(str(loc) for loc in labels)
    loc = str(result.get("Leak_Location", "None"))
    if loc in ("None", "", "nan"):
        return []
    secondary = result.get("Secondary_Leak")
    if secondary and str(secondary) not in ("None", ""):
        return sorted({loc, str(secondary)})
    return [loc]


def _format_locations(labels: List[str]) -> str:
    if not labels:
        return "None"
    if len(labels) == 1:
        return labels[0]
    return " + ".join(labels)


def _score_prediction(actual_labels: List[str], result: Dict[str, object]) -> bool:
    predicted_labels = _active_labels_from_prediction(result)
    if set(actual_labels) != set(predicted_labels):
        return False
    is_multi_actual = len(actual_labels) >= 2
    is_multi_pred = bool(result.get("Is_Multi_Leak")) or len(predicted_labels) >= 2
    return is_multi_actual == is_multi_pred


def _build_example(
    *,
    row_index: int,
    scenario_label: str,
    actual_labels: List[str],
    result: Dict[str, object],
    dataset_source: str,
    combo_label: str | None = None,
) -> Dict[str, object]:
    predicted_labels = _active_labels_from_prediction(result)
    ok = _score_prediction(actual_labels, result)
    return {
        "row_index": row_index,
        "scenario_label": scenario_label,
        "dataset_source": dataset_source,
        "combo_label": combo_label,
        "is_multi_leak": len(actual_labels) >= 2,
        "actual_location": _format_locations(actual_labels),
        "predicted_location": _format_locations(predicted_labels),
        "actual_locations": actual_labels,
        "predicted_locations": predicted_labels,
        "correct": ok,
        "confidence": float(result.get("Confidence_Score", 0.0)),
        "leak_present": bool(result.get("Leak_Present", False)),
        "leak_severity": result.get("Leak_Severity"),
        "recommended_action": result.get("Recommended_Action"),
    }


def _warm_up_dqp(dqp: DataQualityPipeline, clean_df: pd.DataFrame, row_idx: int) -> None:
    """Build DQP history from clean readings near the target scenario row."""
    for offset in range(-14, 1):
        idx = max(0, row_idx + offset)
        dqp.process(_row_to_features(clean_df, idx))


def _corrupt_sample(
    clean_df: pd.DataFrame,
    row_idx: int,
    noise_type: str,
) -> Dict[str, float]:
    """Apply realistic pre-DQP sensor artefacts to a clean row."""
    sample = dict(_row_to_features(clean_df, row_idx))

    if noise_type == "SPIKE":
        leak_ref = _row_to_features(clean_df, row_idx + 1799)
        for key in _PRESSURE_PATH_SENSORS:
            if key in sample and key in leak_ref:
                sample[key] = leak_ref[key]

    elif noise_type == "DRIFT":
        normal_ref = _row_to_features(clean_df, row_idx - 1801)
        blend = 0.30
        for key in sample:
            sample[key] = blend * sample[key] + (1.0 - blend) * normal_ref[key]

    elif noise_type == "MISSING":
        sample["Exhaust_Manifold_Pressure_kPa"] = float("nan")

    return sample


def run_clean_validation_demo(
    single_df: pd.DataFrame | None = None,
    multi_df: pd.DataFrame | None = None,
) -> Dict[str, object]:
    """
    Run 15 clean validation examples (8 single-leak + 7 multi-leak) for API/UI.

    Single-leak rows come from caterpillar_testcell_leak_dataset_clean.csv.
    Multi-leak rows come from caterpillar_multileak_dataset.csv.
    Both sources are merged into the combined training file; this demo runs
    one representative row per scenario through live production inference.
    """
    if single_df is None:
        if not CLEAN_DATA_PATH.is_file():
            raise FileNotFoundError(
                f"Clean validation dataset not found: {CLEAN_DATA_PATH}. "
                "Run: python src/generate_testcell_data.py"
            )
        single_df = pd.read_csv(CLEAN_DATA_PATH, keep_default_na=False)

    if multi_df is None:
        if not MULTI_DATA_PATH.is_file():
            raise FileNotFoundError(
                f"Multi-leak dataset not found: {MULTI_DATA_PATH}. "
                "Run: python src/generate_multileak_data.py"
            )
        multi_df = pd.read_csv(MULTI_DATA_PATH, keep_default_na=False)

    examples: List[Dict[str, object]] = []
    correct = 0

    for row_idx, scenario_label in SINGLE_VALIDATION_ROWS:
        actual_labels = _active_labels_from_row(single_df, row_idx)
        sample = _row_to_features(single_df, row_idx)
        result = predict_leak(sample)
        ex = _build_example(
            row_index=row_idx,
            scenario_label=scenario_label,
            actual_labels=actual_labels,
            result=result,
            dataset_source="single_clean",
        )
        correct += int(ex["correct"])
        examples.append(ex)

    for row_idx, scenario_label, combo_label in MULTI_VALIDATION_ROWS:
        actual_labels = _active_labels_from_row(multi_df, row_idx)
        sample = _row_to_features(multi_df, row_idx)
        result = predict_leak(sample)
        ex = _build_example(
            row_index=row_idx,
            scenario_label=scenario_label,
            actual_labels=actual_labels,
            result=result,
            dataset_source="multi_leak",
            combo_label=combo_label,
        )
        correct += int(ex["correct"])
        examples.append(ex)

    total = len(SINGLE_VALIDATION_ROWS) + len(MULTI_VALIDATION_ROWS)
    training_name = (
        COMBINED_DATA_PATH.name
        if COMBINED_DATA_PATH.is_file()
        else NOISY_DATA_PATH.name
    )
    return {
        "dataset_name": f"{CLEAN_DATA_PATH.name} + {MULTI_DATA_PATH.name}",
        "dataset_role": "clean_validation_demo",
        "training_dataset": training_name,
        "description": (
            "Fifteen representative clean readings — eight single-leak scenarios "
            "(including normal) plus seven simultaneous multi-leak combinations. "
            "The production multilabel model was trained on the combined dataset "
            f"({training_name}, 14.4k single + 17.5k multi rows); this demo runs "
            "one held-out row per scenario through live inference."
        ),
        "single_scenarios": len(SINGLE_VALIDATION_ROWS),
        "multi_scenarios": len(MULTI_VALIDATION_ROWS),
        "total": total,
        "correct": correct,
        "accuracy_pct": round(100.0 * correct / total, 1) if total else 0.0,
        "examples": examples,
    }


def _run_clean_validation(df: pd.DataFrame) -> int:
    """Validate 15 clean scenario examples; return count correct."""
    demo = run_clean_validation_demo(single_df=df)

    print("=" * 72)
    print("  VALIDATION DEMONSTRATION — 15 SCENARIO EXAMPLES (CLEAN DATA)")
    print("=" * 72)
    print(f"{'Row':<8}{'Scenario':<32}{'Actual':<28}{'Predicted':<28}{'OK'}")
    print("-" * 72)

    for ex in demo["examples"]:
        mark = "OK" if ex["correct"] else "MISS"
        print(
            f"{ex['row_index']:<8}{ex['scenario_label']:<32}"
            f"{ex['actual_location']:<28}{ex['predicted_location']:<28}{mark}"
        )

    correct = int(demo["correct"])
    total = int(demo["total"])
    print("-" * 72)
    print(f"Overall: {correct}/{total} correct on clean validation examples")
    print()
    return correct


def _run_noisy_validation(clean_df: pd.DataFrame) -> int:
    """Demonstrate raw vs DQP-corrected predictions on corrupted readings."""
    print("=" * 72)
    print("  NOISY VALIDATION (without Data Quality Pipeline)")
    print("=" * 72)
    print(f"{'Row':<8}{'Scenario':<22}{'Noise':<10}{'Raw Result'}")
    print("-" * 72)

    for row_idx, scenario, noise_type in NOISY_DEMO_ROWS:
        actual = str(clean_df.iloc[row_idx]["Leak_Location"])
        raw_sample = _corrupt_sample(clean_df, row_idx, noise_type)
        result = predict_leak(raw_sample)
        predicted = result["Leak_Location"]
        conf = result["Confidence_Score"]

        if predicted != actual:
            if actual == "None":
                outcome = f"false alarm -> {predicted} ({conf:.2%})"
            else:
                outcome = f"misclass -> {predicted} ({conf:.2%})"
        elif conf < 0.90:
            outcome = f"reduced confidence ({conf:.2%})"
        else:
            outcome = f"correct ({conf:.2%})"

        print(f"{row_idx:<8}{scenario:<22}{noise_type:<10}{outcome}")

    print("-" * 72)
    print("\nNOISY VALIDATION (real DQP):")
    print(
        f"{'Row':<8}{'Scenario':<25}{'Noise':<12}"
        f"{'DQP Score':<12}{'Flags':<20}{'Result'}"
    )
    print("-" * 72)

    dqp_ok = 0
    for row_idx, scenario, noise_type in NOISY_DEMO_ROWS:
        actual = str(clean_df.iloc[row_idx]["Leak_Location"])
        expected = "None" if actual == "None" else actual

        dqp = DataQualityPipeline(window_size=20)
        _warm_up_dqp(dqp, clean_df, row_idx)

        corrupted = _corrupt_sample(clean_df, row_idx, noise_type)
        dqp_result = dqp.process(corrupted)
        pred = predict_leak(dqp_result.cleaned_reading)

        correct = pred["Leak_Location"] == expected
        dqp_ok += int(correct)
        flag_summary = (
            ", ".join(sorted({f.flag_type for f in dqp_result.flags}))
            if dqp_result.flags
            else "none"
        )
        status = "OK" if correct else "FAIL"
        print(
            f"{row_idx:<8}{scenario:<25}{noise_type:<12}"
            f"{dqp_result.data_quality_score:<12.1f}"
            f"{flag_summary:<20}{status}"
        )

    print("-" * 72)
    print(f"DQP recovery: {dqp_ok}/3 noisy examples correct after cleaning")
    print()
    return dqp_ok


def main() -> None:
    """Run clean and noisy validation demonstrations."""
    if not CLEAN_DATA_PATH.is_file():
        raise FileNotFoundError(f"Clean dataset not found: {CLEAN_DATA_PATH}")

    clean_df = pd.read_csv(CLEAN_DATA_PATH, keep_default_na=False)
    if not NOISY_DATA_PATH.is_file():
        load_data()

    correct = _run_clean_validation(clean_df)
    dqp_ok = _run_noisy_validation(clean_df)
    total = len(SINGLE_VALIDATION_ROWS) + len(MULTI_VALIDATION_ROWS)

    if correct < total:
        logger.warning("Clean validation: %d/%d correct.", correct, total)
    else:
        logger.info("Clean validation: %d/%d correct.", correct, total)

    if dqp_ok < 3:
        logger.warning("DQP noisy validation: %d/3 recovered.", dqp_ok)
    else:
        logger.info("DQP noisy validation: 3/3 recovered.")


if __name__ == "__main__":
    main()
