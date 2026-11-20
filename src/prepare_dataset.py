"""
prepare_dataset.py — Build training-ready CSV from combined clean dataset
=========================================================================
Drops 15 metadata/redundant columns and keeps exactly 50 columns:
  42 sensor features + 7 binary labels + Stratify_Key
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Union

import pandas as pd

from preprocess import LABEL_COLS, SENSOR_COLS

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = PROJECT_ROOT / "data" / "caterpillar_combined_dataset_clean.csv"
DEFAULT_OUTPUT = PROJECT_ROOT / "data" / "caterpillar_training_ready.csv"

COLS_TO_DROP = [
    # Row identifiers — not useful for training
    "Test_ID",
    "Timestamp",
    "Engine_Serial_No",
    "Test_Cell_ID",
    "Test_Mode",
    # Derived/redundant target fields
    "Leak_Present",
    "Leak_Location",
    "Leak_Severity",
    "Confidence_Score",
    "Recommended_Action",
    "Leak_Location_A",
    "Leak_Location_B",
    "Is_Multi_Leak",
    "Combo_Label",
    "Data_Source",
]

SPLIT_COL = ["Stratify_Key"]
KEEP_COLS = SENSOR_COLS + LABEL_COLS + SPLIT_COL

EXPECTED_ROWS = 31_900
EXPECTED_COLS = len(KEEP_COLS)  # 50


def find_input_csv() -> Path:
    """Locate caterpillar_combined_dataset_clean.csv under project root or data/."""
    if DEFAULT_INPUT.exists():
        return DEFAULT_INPUT

    candidates = sorted(PROJECT_ROOT.glob("**/caterpillar_combined_dataset_clean.csv"))
    if candidates:
        return candidates[0]

    raise FileNotFoundError(
        "Could not find caterpillar_combined_dataset_clean.csv in project root or data/"
    )


def prepare_dataset(
    input_path: Union[str, Path, None] = None,
    output_path: Union[str, Path, None] = None,
) -> pd.DataFrame:
    """
    Load combined CSV, drop unwanted columns, verify integrity, save training CSV.
    """
    in_path = Path(input_path) if input_path else find_input_csv()
    out_path = Path(output_path) if output_path else DEFAULT_OUTPUT

    # Step 1: Load
    print(f"Loading: {in_path}")
    df = pd.read_csv(in_path, low_memory=False)
    print(f"Raw shape: {df.shape}")

    # Step 2: Verify drop columns
    missing_drop_cols = [c for c in COLS_TO_DROP if c not in df.columns]
    if missing_drop_cols:
        print(f"WARNING: these drop-columns not found: {missing_drop_cols}")

    # Step 3: Drop
    cols_to_drop = [c for c in COLS_TO_DROP if c in df.columns]
    df = df.drop(columns=cols_to_drop)
    print(f"After drop: {df.shape}")

    # Step 4: Verify kept columns
    missing_sensors = [c for c in SENSOR_COLS if c not in df.columns]
    if missing_sensors:
        raise ValueError(f"Missing sensor columns: {missing_sensors}")

    missing_labels = [c for c in LABEL_COLS if c not in df.columns]
    if missing_labels:
        raise ValueError(f"Missing label columns: {missing_labels}")

    if "Stratify_Key" not in df.columns:
        raise ValueError("Stratify_Key column missing")

    extra_cols = [c for c in df.columns if c not in KEEP_COLS]
    if extra_cols:
        print(f"WARNING: unexpected extra columns will be dropped: {extra_cols}")
        df = df.drop(columns=extra_cols)

    df = df[KEEP_COLS]

    # Step 5: Verify zero missing values
    missing_count = int(df.isnull().sum().sum())
    if missing_count > 0:
        print(f"WARNING: {missing_count} missing values found")
        print(df.isnull().sum()[df.isnull().sum() > 0])
    else:
        print("Missing values: 0 — clean")

    # Step 6: Verify label integrity
    label_sums = df[LABEL_COLS].sum(axis=1)
    normal_count = int((label_sums == 0).sum())
    single_count = int((label_sums == 1).sum())
    multi_count = int((label_sums == 2).sum())
    invalid_count = int((label_sums > 2).sum())

    print("\nLabel integrity check:")
    print(f"  Normal rows  (0 labels): {normal_count:,}")
    print(f"  Single leak  (1 label):  {single_count:,}")
    print(f"  Multi leak   (2 labels): {multi_count:,}")
    print(f"  Invalid      (3+ labels): {invalid_count:,}")

    if invalid_count > 0:
        raise ValueError(f"{invalid_count} rows have 3+ active labels — data error")

    # Step 7: Stratify_Key distribution
    print("\nStratify_Key distribution (15 classes):")
    for key, count in df["Stratify_Key"].value_counts().sort_index().items():
        print(f"  {key:<45} {count:>5}")

    # Step 8: Final shape check
    assert df.shape == (EXPECTED_ROWS, EXPECTED_COLS), (
        f"Shape mismatch: got {df.shape}, expected ({EXPECTED_ROWS}, {EXPECTED_COLS})"
    )
    print(f"\nFinal shape: {df.shape} ✓")
    print(f"  {len(SENSOR_COLS)} sensor features")
    print(f"  {len(LABEL_COLS)} label targets")
    print("  1 Stratify_Key column")

    # Step 9: Save
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path, index=False)
    print(f"\nSaved to: {out_path}")
    print("Done.")

    return df


if __name__ == "__main__":
    prepare_dataset(
        input_path=DEFAULT_INPUT,
        output_path=DEFAULT_OUTPUT,
    )
