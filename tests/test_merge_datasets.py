"""Tests for merged clean dataset builder."""

from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
COMBINED = PROJECT_ROOT / "data" / "caterpillar_combined_dataset_clean.csv"


def test_merged_csv_exists_and_shape():
    from merge_datasets import save_combined_dataset

    save_combined_dataset(COMBINED)
    df = pd.read_csv(COMBINED)
    assert len(df) == 14400 + 17500
    assert "Data_Source" in df.columns
    assert (df["Data_Source"] == "single_clean").sum() == 14400
    assert (df["Data_Source"] == "multi_leak").sum() == 17500


def test_merged_has_multilabel_columns():
    df = pd.read_csv(COMBINED)
    label_cols = [c for c in df.columns if c.startswith("label_")]
    assert len(label_cols) == 7
    multi = df[df["Data_Source"] == "multi_leak"]
    assert (multi[label_cols].sum(axis=1) == 2).all()
