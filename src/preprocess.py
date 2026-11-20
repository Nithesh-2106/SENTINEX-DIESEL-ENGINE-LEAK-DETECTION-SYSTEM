"""
preprocess.py — Load, clean, split, and scale training data.
"""

from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = PROJECT_ROOT / "models"
DEFAULT_CSV = PROJECT_ROOT / "data" / "caterpillar_combined_dataset_clean.csv"
TRAINING_READY_CSV = PROJECT_ROOT / "data" / "caterpillar_training_ready.csv"

SENSOR_COLS = [
    "Engine_Speed_Setpoint_RPM",
    "Engine_Load_Setpoint_Pct",
    "Engine_Speed_Actual_RPM",
    "Engine_Load_Actual_Pct",
    "Fuel_Flow_Rate_kgph",
    "Engine_Coolant_Temp_C",
    "Engine_Oil_Pressure_bar",
    "Ambient_Temp_C",
    "Ambient_Pressure_kPa",
    "Ambient_Humidity_Pct",
    "Intake_Ambient_Pressure_kPa",
    "MAF_Sensor_Reading_kgph",
    "Pre_Compressor_Pressure_kPa",
    "Pre_Compressor_Temp_C",
    "Post_Compressor_Pressure_kPa",
    "Post_Compressor_Temp_C",
    "Post_CAC_Pressure_kPa",
    "Post_CAC_Temp_C",
    "Intake_Manifold_Pressure_kPa",
    "Intake_Manifold_Temp_C",
    "Turbocharger_Speed_RPM",
    "Boost_Pressure_kPa",
    "Exhaust_Manifold_Pressure_kPa",
    "Exhaust_Manifold_Temp_C",
    "Pre_Turbine_Pressure_kPa",
    "Pre_Turbine_Temp_C",
    "Post_Turbine_Pressure_kPa",
    "Post_Turbine_Temp_C",
    "Post_DOC_Pressure_kPa",
    "Post_DOC_Temp_C",
    "Post_DPF_Pressure_kPa",
    "Post_DPF_Temp_C",
    "Post_SCR_Pressure_kPa",
    "Post_SCR_Temp_C",
    "Tailpipe_BackPressure_kPa",
    "EGR_Flow_Rate_kgph",
    "Intake_Mass_Balance_Error_kgph",
    "Compressor_Pressure_Ratio",
    "Turbine_Expansion_Ratio",
    "CAC_Pressure_Drop_kPa",
    "DPF_Delta_Pressure_kPa",
    "Intake_Temp_Rise_Across_CAC_C",
]

LABEL_COLS = [
    "label_CAC_Direct_Leak",
    "label_EGR_Leak",
    "label_Exhaust_PostTurbine",
    "label_Exhaust_PreTurbine",
    "label_Intake_PostTurbo_CAC",
    "label_Intake_PreTurbo",
    "label_Minor_Intake_Leak",
]

SCENARIO_NAMES = [
    "CAC_Direct_Leak",
    "EGR_Leak",
    "Exhaust_PostTurbine",
    "Exhaust_PreTurbine",
    "Intake_PostTurbo_CAC",
    "Intake_PreTurbo",
    "Minor_Intake_Leak",
]

LABEL_THRESHOLD = 0.50

COLS_TO_DROP = [
    "Test_ID",
    "Timestamp",
    "Engine_Serial_No",
    "Test_Cell_ID",
    "Test_Mode",
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

KEEP_COLS = SENSOR_COLS + LABEL_COLS + ["Stratify_Key"]
EXPECTED_ROWS = 31_900
EXPECTED_COLS = 50

# Legacy exports
COMBINED_PATH = DEFAULT_CSV
DATA_PATH = PROJECT_ROOT / "data" / "caterpillar_testcell_leak_dataset_clean.csv"
METADATA_COLS = ["Test_ID", "Timestamp", "Engine_Serial_No", "Test_Cell_ID", "Test_Mode"]
LABEL_ONLY_COL = "Confidence_Score"
SCENARIO_ORDER = SCENARIO_NAMES


def resolve_csv_path(csv_path: str | Path | None = None) -> Path:
    if csv_path:
        return Path(csv_path)
    if TRAINING_READY_CSV.exists():
        return TRAINING_READY_CSV
    if DEFAULT_CSV.exists():
        return DEFAULT_CSV
    candidates = sorted(PROJECT_ROOT.glob("**/caterpillar_combined_dataset_clean.csv"))
    if candidates:
        return candidates[0]
    raise FileNotFoundError("No training CSV found in data/")


def load_data(csv_path: str | Path | None = None) -> pd.DataFrame:
    """
    Load the full test-cell dataset for CLI demos and validation scripts.

    Uses keep_default_na=False so Leak_Location \"None\" stays a string, not NaN.
    Prefers the noisy training CSV (DATA_PATH), then clean validation CSV, then combined.
    """
    if csv_path:
        path = Path(csv_path)
    elif DATA_PATH.is_file():
        path = DATA_PATH
    else:
        clean_path = PROJECT_ROOT / "data" / "caterpillar_testcell_leak_dataset_clean.csv"
        path = clean_path if clean_path.is_file() else resolve_csv_path()

    if not path.is_file():
        raise FileNotFoundError(f"Dataset not found: {path}")

    return pd.read_csv(path, keep_default_na=False, low_memory=False)


def load_and_split(csv_path: str | Path | None = None, random_state: int = 42):
    """
    Load dataset, drop unwanted columns, split 70/15/15
    stratified on Stratify_Key.
    Returns raw/scaled X splits, Y splits, and saves scaler.
    """
    path = resolve_csv_path(csv_path)
    df = pd.read_csv(path, low_memory=False)
    print(f"Loaded {len(df):,} rows, {len(df.columns)} columns")

    existing_drop = [c for c in COLS_TO_DROP if c in df.columns]
    if existing_drop:
        df = df.drop(columns=existing_drop)
        print(f"After dropping metadata: {df.shape}")

    extra = [c for c in df.columns if c not in KEEP_COLS]
    if extra:
        df = df.drop(columns=extra)

    df = df[KEEP_COLS]

    assert len(df.columns) == EXPECTED_COLS, (
        f"Expected {EXPECTED_COLS} cols after drop, got {len(df.columns)}"
    )
    missing = int(df.isnull().sum().sum())
    assert missing == 0, f"Found {missing} missing values"
    assert len(df) == EXPECTED_ROWS, f"Expected {EXPECTED_ROWS} rows, got {len(df)}"

    X = df[SENSOR_COLS].values.astype(np.float32)
    Y = df[LABEL_COLS].values.astype(np.float32)
    stratify_key = df["Stratify_Key"].values

    print(f"X shape: {X.shape}")
    print(f"Y shape: {Y.shape}")

    idx = np.arange(len(df))
    idx_train, idx_temp = train_test_split(
        idx, test_size=0.30, stratify=stratify_key, random_state=random_state
    )
    idx_val, idx_test = train_test_split(
        idx_temp,
        test_size=0.50,
        stratify=stratify_key[idx_temp],
        random_state=random_state,
    )

    X_train, X_val, X_test = X[idx_train], X[idx_val], X[idx_test]
    Y_train, Y_val, Y_test = Y[idx_train], Y[idx_val], Y[idx_test]

    print("\nSplit sizes:")
    print(f"  Train: {len(X_train):,}")
    print(f"  Val:   {len(X_val):,}")
    print(f"  Test:  {len(X_test):,}")

    scaler = StandardScaler()
    X_train_sc = scaler.fit_transform(X_train)
    X_val_sc = scaler.transform(X_val)
    X_test_sc = scaler.transform(X_test)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(scaler, MODELS_DIR / "scaler.pkl")
    print("Scaler saved → models/scaler.pkl")

    return (
        X_train,
        X_val,
        X_test,
        X_train_sc,
        X_val_sc,
        X_test_sc,
        Y_train,
        Y_val,
        Y_test,
    )
