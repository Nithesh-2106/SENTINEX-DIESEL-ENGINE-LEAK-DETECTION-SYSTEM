"""
merge_datasets.py — Clean, unify, and merge single + multi-leak CSVs
==================================================================
Reads:
  - data/caterpillar_testcell_leak_dataset_clean.csv  (single-leak, clean)
  - data/caterpillar_multileak_dataset.csv            (multi-leak)

Writes:
  - data/caterpillar_combined_dataset_clean.csv       (unified training file)

Run:
    python src/merge_datasets.py
"""

from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from multilabel_targets import (
    LABEL_COLS,
    LEAK_LOCATIONS,
    build_single_row_labels,
)

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"

SINGLE_CLEAN_PATH = DATA_DIR / "caterpillar_testcell_leak_dataset_clean.csv"
MULTILEAK_PATH = DATA_DIR / "caterpillar_multileak_dataset.csv"
COMBINED_PATH = DATA_DIR / "caterpillar_combined_dataset_clean.csv"

METADATA_COLS = [
    "Test_ID",
    "Timestamp",
    "Engine_Serial_No",
    "Test_Cell_ID",
    "Test_Mode",
]

LABEL_COL = "Confidence_Score"
LEGACY_LABELS = [
    "Leak_Present",
    "Leak_Location",
    "Leak_Severity",
    LABEL_COL,
    "Recommended_Action",
]

MULTI_META = [
    "Leak_Location_A",
    "Leak_Location_B",
    "Is_Multi_Leak",
    "Combo_Label",
]

UNIFIED_META = METADATA_COLS + LEGACY_LABELS + MULTI_META + LABEL_COLS + [
    "Data_Source",
    "Stratify_Key",
]

DERIVED_COLS = [
    "Compressor_Pressure_Ratio",
    "Turbine_Expansion_Ratio",
    "CAC_Pressure_Drop_kPa",
    "DPF_Delta_Pressure_kPa",
    "Intake_Mass_Balance_Error_kgph",
]

INTAKE_MASS_BALANCE_DIV = 0.296


def _feature_columns(df: pd.DataFrame) -> list:
    drop = set(METADATA_COLS + LEGACY_LABELS + MULTI_META + LABEL_COLS + [
        "Data_Source", "Stratify_Key",
    ])
    return [c for c in df.columns if c not in drop]


def recompute_derived_fields(df: pd.DataFrame) -> pd.DataFrame:
    """Recompute physics-derived columns from base sensors."""
    out = df.copy()
    pre = out["Pre_Compressor_Pressure_kPa"].astype(float).clip(lower=0.1)
    out["Compressor_Pressure_Ratio"] = (
        out["Post_Compressor_Pressure_kPa"].astype(float) / pre
    ).round(4)
    post_t = out["Post_Turbine_Pressure_kPa"].astype(float).clip(lower=0.1)
    out["Turbine_Expansion_Ratio"] = (
        out["Pre_Turbine_Pressure_kPa"].astype(float) / post_t
    ).round(4)
    out["CAC_Pressure_Drop_kPa"] = (
        out["Post_Compressor_Pressure_kPa"].astype(float)
        - out["Post_CAC_Pressure_kPa"].astype(float)
    ).round(3)
    out["DPF_Delta_Pressure_kPa"] = (
        out["Post_DOC_Pressure_kPa"].astype(float)
        - out["Post_DPF_Pressure_kPa"].astype(float)
    ).round(3)
    out["Intake_Mass_Balance_Error_kgph"] = (
        out["MAF_Sensor_Reading_kgph"].astype(float)
        - (out["Intake_Manifold_Pressure_kPa"].astype(float) / INTAKE_MASS_BALANCE_DIV)
    ).round(3)
    return out


def clean_multi_leak_df(df: pd.DataFrame) -> pd.DataFrame:
    """Validate and normalize the multi-leak dataset."""
    required = set(LABEL_COLS + ["Combo_Label", "Leak_Location_A", "Leak_Location_B"])
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Multi-leak dataset missing columns: {missing}")

    out = df.copy()
    out = recompute_derived_fields(out)

    active = out[LABEL_COLS].sum(axis=1)
    if not (active == 2).all():
        bad = int((active != 2).sum())
        raise ValueError(f"Multi-leak dataset: {bad} rows do not have exactly 2 active labels")

    for col in LABEL_COLS:
        out[col] = out[col].astype(int)

    out["Leak_Present"] = 1
    out["Leak_Location"] = out["Leak_Location_A"]
    out["Leak_Severity"] = "Moderate"
    out["Recommended_Action"] = "Pause_Test_Inspect_Component"
    out["Confidence_Score"] = 0.90
    out["Is_Multi_Leak"] = 1

    if "Test_ID" not in out.columns:
        out["Test_ID"] = "TC2026-MULTI"
        out["Engine_Serial_No"] = "CAT-C13-SN-00412"
        out["Test_Cell_ID"] = "TC-CELL-03"
        out["Test_Mode"] = "Steady_State"
    if "Timestamp" not in out.columns or out["Timestamp"].eq("").all():
        out["Timestamp"] = [f"10:{i//3600:02d}:{(i//60)%60:02d}:{i%60:02d}.000" for i in range(len(out))]

    out["Data_Source"] = "multi_leak"
    out["Stratify_Key"] = out["Combo_Label"].astype(str)

    logger.info("Cleaned multi-leak dataset: %d rows", len(out))
    return out


def normalize_single_clean_df(df: pd.DataFrame) -> pd.DataFrame:
    """Add unified multi-label columns to the clean single-leak dataset."""
    out = df.copy()
    out = recompute_derived_fields(out)

    for col in LABEL_COLS:
        out[col] = 0

    for idx, row in out.iterrows():
        loc = str(row.get("Leak_Location", "None"))
        bits = build_single_row_labels(loc)
        for col, val in bits.items():
            out.at[idx, col] = val

    out["Leak_Location_A"] = out["Leak_Location"].where(
        out["Leak_Present"].astype(int) == 1, ""
    )
    out["Leak_Location_B"] = ""
    out["Is_Multi_Leak"] = 0
    out["Combo_Label"] = out.apply(
        lambda r: (
            str(r["Leak_Location"])
            if int(r["Leak_Present"]) == 1
            else "Normal"
        ),
        axis=1,
    )
    out["Data_Source"] = "single_clean"
    out["Stratify_Key"] = out["Combo_Label"]

    logger.info("Normalized single-clean dataset: %d rows", len(out))
    return out


def build_combined_dataset(
    single_path: Path = SINGLE_CLEAN_PATH,
    multi_path: Path = MULTILEAK_PATH,
) -> pd.DataFrame:
    """Load, clean, and merge both source datasets."""
    if not single_path.exists():
        raise FileNotFoundError(f"Single clean dataset not found: {single_path}")
    if not multi_path.exists():
        raise FileNotFoundError(
            f"Multi-leak dataset not found: {multi_path}. "
            "Run src/generate_multileak_data.py first."
        )

    single_df = pd.read_csv(single_path, keep_default_na=False, na_values=[""])
    multi_df = pd.read_csv(multi_path, keep_default_na=False, na_values=[""])

    single_clean = normalize_single_clean_df(single_df)
    multi_clean = clean_multi_leak_df(multi_df)

    feature_cols = _feature_columns(single_clean)
    meta_cols = [c for c in UNIFIED_META if c in single_clean.columns]

    for col in meta_cols + feature_cols:
        if col not in multi_clean.columns:
            multi_clean[col] = single_clean[col].iloc[0] if len(single_clean) else ""

    col_order = meta_cols + feature_cols
    single_clean = single_clean[col_order]
    multi_clean = multi_clean[col_order]

    combined = pd.concat([single_clean, multi_clean], ignore_index=True)

    logger.info(
        "Combined dataset: %d rows (single=%d, multi=%d)",
        len(combined),
        len(single_clean),
        len(multi_clean),
    )
    return combined


def save_combined_dataset(
    path: Path = COMBINED_PATH,
    single_path: Path = SINGLE_CLEAN_PATH,
    multi_path: Path = MULTILEAK_PATH,
) -> Path:
    """Build and persist the merged clean CSV."""
    combined = build_combined_dataset(single_path, multi_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    combined.to_csv(path, index=False)
    logger.info("Saved merged dataset → %s (%d rows × %d cols)", path, *combined.shape)
    return path


if __name__ == "__main__":
    save_combined_dataset()
    df = pd.read_csv(COMBINED_PATH)
    print("\n" + "=" * 70)
    print("  MERGED CLEAN DATASET")
    print("=" * 70)
    print(f"  Path:   {COMBINED_PATH}")
    print(f"  Rows:   {len(df):,}")
    print(f"  Single: {(df['Data_Source'] == 'single_clean').sum():,}")
    print(f"  Multi:  {(df['Data_Source'] == 'multi_leak').sum():,}")
    print(f"  Normal: {(df['Leak_Present'].astype(int) == 0).sum():,}")
    print(f"  Leak:   {(df['Leak_Present'].astype(int) == 1).sum():,}")
    print("=" * 70)
