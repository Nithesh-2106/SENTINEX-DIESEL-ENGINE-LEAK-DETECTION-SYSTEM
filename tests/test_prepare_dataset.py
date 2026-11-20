"""Tests for prepare_dataset.py."""

from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT = PROJECT_ROOT / "data" / "caterpillar_training_ready.csv"


def test_prepare_dataset_output_shape():
    from prepare_dataset import EXPECTED_COLS, EXPECTED_ROWS, prepare_dataset

    df = prepare_dataset()
    assert df.shape == (EXPECTED_ROWS, EXPECTED_COLS)
    assert OUTPUT.exists()

    saved = pd.read_csv(OUTPUT, low_memory=False)
    assert saved.shape == (EXPECTED_ROWS, EXPECTED_COLS)
    assert saved.isnull().sum().sum() == 0
