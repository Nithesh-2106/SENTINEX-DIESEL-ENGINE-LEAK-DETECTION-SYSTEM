"""
generate_testcell_data.py — Synthetic Caterpillar test-cell leak dataset
======================================================================
Generates two datasets:
  - caterpillar_testcell_leak_dataset_clean.csv  (validation / demos)
  - caterpillar_testcell_leak_dataset.csv        (noisy, for training)

Scenarios 0–4 preserve statistical means from legacy data (_scenario_means.json).
Scenarios 5–7 add EGR, CAC body, and minor intake leaks with physics-correct
derived fields computed AFTER scenario deviations are applied.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)

# ── Paths ────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
CLEAN_DATA_PATH = DATA_DIR / "caterpillar_testcell_leak_dataset_clean.csv"
NOISY_DATA_PATH = DATA_DIR / "caterpillar_testcell_leak_dataset.csv"
LEGACY_MEANS_PATH = PROJECT_ROOT / "_scenario_means.json"

# ── Generation constants ─────────────────────────────────────────────
ROWS_PER_SCENARIO = 1800
RNG_SEED = 42
INTAKE_MASS_BALANCE_DIV = 0.296

# Noise injection rates (fraction of rows affected)
SPIKE_RATE = 0.005
DRIFT_RATE = 0.010
MISSING_RATE = 0.003
HF_NOISE_RATE = 0.030
SPIKE_MAG_MIN = 0.20
SPIKE_MAG_MAX = 0.50
DRIFT_MAG_MIN = 0.015
DRIFT_MAG_MAX = 0.040
DRIFT_WINDOW_MIN = 15
DRIFT_WINDOW_MAX = 25
HF_NOISE_MAG = 0.02

NORMAL_OPERATION: Dict[str, float] = {
    "Engine_Speed_Setpoint_RPM": 1800.0,
    "Engine_Load_Setpoint_Pct": 75.0,
    "Engine_Speed_Actual_RPM": 1800.19,
    "Engine_Load_Actual_Pct": 75.0,
    "Fuel_Flow_Rate_kgph": 42.0,
    "Engine_Coolant_Temp_C": 88.0,
    "Engine_Oil_Pressure_bar": 4.2,
    "Ambient_Temp_C": 32.0,
    "Ambient_Pressure_kPa": 101.3,
    "Ambient_Humidity_Pct": 68.0,
    "Intake_Ambient_Pressure_kPa": 101.3,
    "MAF_Sensor_Reading_kgph": 720.0,
    "Pre_Compressor_Pressure_kPa": 99.5,
    "Pre_Compressor_Temp_C": 38.0,
    "Post_Compressor_Pressure_kPa": 218.0,
    "Post_Compressor_Temp_C": 167.9,
    "Post_CAC_Pressure_kPa": 213.0,
    "Post_CAC_Temp_C": 52.0,
    "Intake_Manifold_Pressure_kPa": 211.0,
    "Intake_Manifold_Temp_C": 55.0,
    "Turbocharger_Speed_RPM": 92000.0,
    "Boost_Pressure_kPa": 116.7,
    "Exhaust_Manifold_Pressure_kPa": 230.0,
    "Exhaust_Manifold_Temp_C": 680.0,
    "Pre_Turbine_Pressure_kPa": 225.0,
    "Pre_Turbine_Temp_C": 670.0,
    "Post_Turbine_Pressure_kPa": 112.0,
    "Post_Turbine_Temp_C": 480.2,
    "Post_DOC_Pressure_kPa": 109.5,
    "Post_DOC_Temp_C": 490.0,
    "Post_DPF_Pressure_kPa": 106.0,
    "Post_DPF_Temp_C": 469.9,
    "Post_SCR_Pressure_kPa": 103.5,
    "Post_SCR_Temp_C": 420.1,
    "Tailpipe_BackPressure_kPa": 102.0,
    "EGR_Flow_Rate_kgph": 58.0,
    "Intake_Mass_Balance_Error_kgph": 7.4,
    "Compressor_Pressure_Ratio": 2.19,
    "Turbine_Expansion_Ratio": 2.01,
    "CAC_Pressure_Drop_kPa": 5.0,
    "DPF_Delta_Pressure_kPa": 3.5,
    "Intake_Temp_Rise_Across_CAC_C": -116.0,
}

SCENARIOS: Dict[int, Dict[str, object]] = {
    0: {
        "name": "Normal",
        "leak_present": 0,
        "leak_location": "None",
        "leak_severity": "None",
        "recommended_action": "Continue_Testing",
    },
    1: {
        "name": "Intake_PreTurbo",
        "leak_present": 1,
        "leak_location": "Intake_PreTurbo",
        "leak_severity": "Moderate",
        "recommended_action": "Pause_Test_Inspect_Component",
    },
    2: {
        "name": "Intake_PostTurbo_CAC",
        "leak_present": 1,
        "leak_location": "Intake_PostTurbo_CAC",
        "leak_severity": "Moderate",
        "recommended_action": "Pause_Test_Inspect_Component",
    },
    3: {
        "name": "Exhaust_PreTurbine",
        "leak_present": 1,
        "leak_location": "Exhaust_PreTurbine",
        "leak_severity": "Moderate",
        "recommended_action": "Pause_Test_Inspect_Component",
    },
    4: {
        "name": "Exhaust_PostTurbine",
        "leak_present": 1,
        "leak_location": "Exhaust_PostTurbine",
        "leak_severity": "Minor",
        "recommended_action": "Flag_and_Monitor",
    },
    5: {
        "name": "EGR_Leak",
        "leak_present": 1,
        "leak_location": "EGR_Leak",
        "leak_severity": "Moderate",
        "recommended_action": "Pause_Test_Inspect_Component",
    },
    6: {
        "name": "CAC_Direct_Leak",
        "leak_present": 1,
        "leak_location": "CAC_Direct_Leak",
        "leak_severity": "Moderate",
        "recommended_action": "Pause_Test_Inspect_Component",
    },
    7: {
        "name": "Minor_Intake_Leak",
        "leak_present": 1,
        "leak_location": "Minor_Intake_Leak",
        "leak_severity": "Minor",
        "recommended_action": "Flag_and_Monitor",
    },
}

LEGACY_CONF_MEAN = {0: 0.97, 1: 0.8801, 2: 0.8798, 3: 0.8803, 4: 0.8795}

FEATURE_KEYS: List[str] = list(NORMAL_OPERATION.keys())

CSV_COLUMNS: List[str] = (
    ["Test_ID", "Timestamp", "Engine_Serial_No", "Test_Cell_ID"]
    + [FEATURE_KEYS[0], FEATURE_KEYS[1], "Test_Mode"]
    + FEATURE_KEYS[2:]
    + [
        "Leak_Present",
        "Leak_Location",
        "Leak_Severity",
        "Confidence_Score",
        "Recommended_Action",
    ]
)

NOISE_SENSOR_COLS: List[str] = [
    "Engine_Speed_Actual_RPM",
    "Engine_Load_Actual_Pct",
    "Fuel_Flow_Rate_kgph",
    "Engine_Coolant_Temp_C",
    "Engine_Oil_Pressure_bar",
    "Ambient_Temp_C",
    "Ambient_Pressure_kPa",
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
    "Compressor_Pressure_Ratio",
    "Turbine_Expansion_Ratio",
    "CAC_Pressure_Drop_kPa",
    "DPF_Delta_Pressure_kPa",
    "Intake_Temp_Rise_Across_CAC_C",
    "Intake_Mass_Balance_Error_kgph",
]

LABEL_COLS = [
    "Leak_Present",
    "Leak_Location",
    "Leak_Severity",
    "Recommended_Action",
]


def noise(rng: np.random.Generator, mean: float, pct: float) -> float:
    """Gaussian perturbation around mean (pct = relative std scale)."""
    z = float(rng.normal(0.0, 1.0))
    return float(mean * (1.0 + z * pct))


def _apply_derived(b: Dict[str, float]) -> None:
    """Recompute derived diagnostics from scenario-modified primitives."""
    maf = b["MAF_Sensor_Reading_kgph"]
    imp = b["Intake_Manifold_Pressure_kPa"]
    p_pre = b["Pre_Compressor_Pressure_kPa"]
    p_post = b["Post_Compressor_Pressure_kPa"]
    p_cac = b["Post_CAC_Pressure_kPa"]
    pre_t = b["Pre_Turbine_Pressure_kPa"]
    post_t = b["Post_Turbine_Pressure_kPa"]

    b["CAC_Pressure_Drop_kPa"] = round(p_post - p_cac, 3)
    b["Intake_Mass_Balance_Error_kgph"] = round(
        maf - (imp / INTAKE_MASS_BALANCE_DIV), 3
    )
    b["Compressor_Pressure_Ratio"] = round(p_post / p_pre, 4)
    b["Turbine_Expansion_Ratio"] = round(pre_t / post_t, 4)


def _simulate_row_features(scenario_id: int, rng: np.random.Generator) -> Dict[str, float]:
    """Generate one row of 42 sensor features for a scenario."""
    if scenario_id in (0, 1, 2, 3, 4):
        try:
            legacy = json.loads(LEGACY_MEANS_PATH.read_text(encoding="utf-8"))
        except OSError as exc:
            raise FileNotFoundError(
                f"Missing {LEGACY_MEANS_PATH} — required for scenarios 0–4."
            ) from exc
        means = legacy[str(scenario_id)]
        return {k: noise(rng, float(means[k]), 0.005) for k in FEATURE_KEYS}

    b = {k: float(v) for k, v in NORMAL_OPERATION.items()}

    if scenario_id == 5:  # EGR_Leak
        b["EGR_Flow_Rate_kgph"] = noise(rng, 38.0, 0.015)
        b["Intake_Manifold_Pressure_kPa"] = noise(rng, 208.5, 0.008)
        b["Intake_Manifold_Temp_C"] = noise(rng, 59.0, 0.01)
        b["Exhaust_Manifold_Pressure_kPa"] = noise(rng, 224.0, 0.008)
        b["Post_SCR_Temp_C"] = noise(rng, 412.0, 0.01)
        b["Post_DOC_Temp_C"] = noise(rng, 484.0, 0.01)
        skip = {
            "EGR_Flow_Rate_kgph",
            "Intake_Manifold_Pressure_kPa",
            "Intake_Manifold_Temp_C",
            "Exhaust_Manifold_Pressure_kPa",
            "Post_SCR_Temp_C",
            "Post_DOC_Temp_C",
        }
        for k in FEATURE_KEYS:
            if k not in skip:
                b[k] = noise(rng, NORMAL_OPERATION[k], 0.005)
        _apply_derived(b)

    elif scenario_id == 6:  # CAC_Direct_Leak
        b["Post_CAC_Pressure_kPa"] = noise(rng, 192.0, 0.008)
        b["Post_CAC_Temp_C"] = noise(rng, 62.0, 0.01)
        b["Intake_Manifold_Pressure_kPa"] = noise(rng, 189.5, 0.008)
        b["Intake_Manifold_Temp_C"] = noise(rng, 63.0, 0.01)
        # post_compressor_p / MAF unchanged — leak is after compressor / after MAF
        skip = {
            "Post_CAC_Pressure_kPa",
            "Post_CAC_Temp_C",
            "Intake_Manifold_Pressure_kPa",
            "Intake_Manifold_Temp_C",
            "Boost_Pressure_kPa",
        }
        for k in FEATURE_KEYS:
            if k not in skip:
                b[k] = noise(rng, NORMAL_OPERATION[k], 0.005)
        _apply_derived(b)
        # Boost = gain above ambient at CAC outlet (intake manifold reference)
        b["Boost_Pressure_kPa"] = round(
            b["Post_CAC_Pressure_kPa"] - b["Intake_Ambient_Pressure_kPa"], 3
        )

    elif scenario_id == 7:  # Minor_Intake_Leak
        b["Pre_Compressor_Pressure_kPa"] = noise(rng, 96.6, 0.005)
        b["Post_Compressor_Pressure_kPa"] = noise(rng, 209.5, 0.005)
        b["Post_Compressor_Temp_C"] = noise(rng, 164.5, 0.008)
        b["Post_CAC_Pressure_kPa"] = noise(rng, 204.5, 0.005)
        b["Intake_Manifold_Pressure_kPa"] = noise(rng, 203.0, 0.005)
        b["Turbocharger_Speed_RPM"] = noise(rng, 90200.0, 0.005)
        b["Boost_Pressure_kPa"] = noise(rng, 108.5, 0.005)
        skip = {
            "Pre_Compressor_Pressure_kPa",
            "Post_Compressor_Pressure_kPa",
            "Post_Compressor_Temp_C",
            "Post_CAC_Pressure_kPa",
            "Intake_Manifold_Pressure_kPa",
            "Turbocharger_Speed_RPM",
            "Boost_Pressure_kPa",
        }
        for k in FEATURE_KEYS:
            if k not in skip:
                b[k] = noise(rng, NORMAL_OPERATION[k], 0.005)
        _apply_derived(b)
        b["CAC_Pressure_Drop_kPa"] = round(
            b["Post_Compressor_Pressure_kPa"] - b["Post_CAC_Pressure_kPa"], 3
        )

    else:
        raise ValueError(f"Unknown scenario_id: {scenario_id}")

    return b


def confidence_for_scenario(scenario_id: int, rng: np.random.Generator) -> float:
    """Simulated label confidence for each scenario."""
    if scenario_id in LEGACY_CONF_MEAN:
        c = noise(rng, LEGACY_CONF_MEAN[scenario_id], 0.008)
    elif scenario_id == 5:
        c = noise(rng, 0.87, 0.02)
    elif scenario_id == 6:
        c = noise(rng, 0.90, 0.02)
    else:
        c = noise(rng, 0.83, 0.03)
    return float(min(0.999, max(0.5, c)))


def simulate_scenario(
    scenario_id: int,
    n_rows: int,
    rng: np.random.Generator,
    time_offset: int,
    base_time: datetime,
) -> pd.DataFrame:
    """Build a DataFrame of n_rows for one leak scenario."""
    meta = SCENARIOS[scenario_id]
    records: List[Dict[str, object]] = []

    for i in range(n_rows):
        global_idx = time_offset + i
        feats = _simulate_row_features(scenario_id, rng)
        conf = confidence_for_scenario(scenario_id, rng)
        ts = base_time + timedelta(seconds=global_idx)

        row: Dict[str, object] = {
            "Test_ID": "TC2025-RUN01",
            "Timestamp": ts.strftime("%H:%M:%S.%f")[:-3],
            "Engine_Serial_No": "CAT-C13-SN-00412",
            "Test_Cell_ID": "TC-CELL-03",
            "Test_Mode": "Steady_State",
            "Leak_Present": meta["leak_present"],
            "Leak_Location": meta["leak_location"],
            "Leak_Severity": meta["leak_severity"],
            "Confidence_Score": round(conf, 5),
            "Recommended_Action": meta["recommended_action"],
        }
        row.update(feats)
        records.append(row)

    return pd.DataFrame(records, columns=CSV_COLUMNS)


def inject_realistic_noise(
    df: pd.DataFrame,
    random_seed: int = RNG_SEED,
) -> pd.DataFrame:
    """
    Inject realistic data quality issues into sensor readings only.

    Labels are never modified. Missing values are forward-filled within
    each scenario block to avoid cross-scenario contamination.
    """
    rng = np.random.default_rng(random_seed)
    df_noisy = df.copy()
    sensor_cols = [c for c in NOISE_SENSOR_COLS if c in df_noisy.columns]
    n_rows = len(df_noisy)
    df_noisy = df_noisy.reset_index(drop=True)

    # ── Spikes (0.5%) ─────────────────────────────────────────────────
    n_spikes = max(1, int(n_rows * SPIKE_RATE))
    spike_rows = rng.choice(n_rows, size=n_spikes, replace=False)
    spike_sensors = rng.integers(0, len(sensor_cols), size=n_spikes)

    for row_i, sensor_i in zip(spike_rows, spike_sensors):
        sensor = sensor_cols[sensor_i]
        original_val = df_noisy.loc[row_i, sensor]
        if pd.isna(original_val) or original_val == 0:
            continue
        magnitude = float(rng.uniform(SPIKE_MAG_MIN, SPIKE_MAG_MAX))
        direction = int(rng.choice([-1, 1]))
        df_noisy.loc[row_i, sensor] = float(
            original_val * (1 + direction * magnitude)
        )

    # ── Gradual drift (1%) ────────────────────────────────────────────
    n_drifts = max(1, int(n_rows * DRIFT_RATE))
    drift_pool = list(range(0, max(1, n_rows - DRIFT_WINDOW_MAX)))
    drift_starts = (
        rng.choice(drift_pool, size=min(n_drifts, len(drift_pool)), replace=False)
        if drift_pool
        else np.array([], dtype=int)
    )
    drift_sensors = rng.choice(sensor_cols, size=len(drift_starts), replace=True)

    for start_i, sensor in zip(drift_starts, drift_sensors):
        window = int(rng.integers(DRIFT_WINDOW_MIN, DRIFT_WINDOW_MAX + 1))
        end_i = min(int(start_i) + window, n_rows - 1)
        start_val = df_noisy.loc[int(start_i), sensor]
        if pd.isna(start_val) or start_val == 0:
            continue
        drift_pct = float(rng.uniform(DRIFT_MAG_MIN, DRIFT_MAG_MAX))
        direction = int(rng.choice([-1, 1]))
        end_val = float(start_val * (1 + direction * drift_pct))
        drift_values = np.linspace(start_val, end_val, end_i - int(start_i) + 1)
        for offset, val in enumerate(drift_values):
            idx = int(start_i) + offset
            if idx < n_rows:
                df_noisy.loc[idx, sensor] = float(val)

    # ── Missing values (0.3%) ─────────────────────────────────────────
    n_missing = max(1, int(n_rows * MISSING_RATE))
    missing_rows = rng.choice(n_rows, size=n_missing, replace=False)
    missing_sensors = rng.integers(0, len(sensor_cols), size=n_missing)

    for row_i, sensor_i in zip(missing_rows, missing_sensors):
        df_noisy.loc[row_i, sensor_cols[sensor_i]] = np.nan

    for scenario in df_noisy["Leak_Location"].unique():
        mask = df_noisy["Leak_Location"] == scenario
        df_noisy.loc[mask, sensor_cols] = (
            df_noisy.loc[mask, sensor_cols].ffill().bfill()
        )

    # ── High-frequency noise (3%) ─────────────────────────────────────
    n_hf = max(1, int(n_rows * HF_NOISE_RATE))
    hf_rows = rng.choice(n_rows, size=n_hf, replace=True)
    hf_sensors = rng.integers(0, len(sensor_cols), size=n_hf)

    for row_i, sensor_i in zip(hf_rows, hf_sensors):
        sensor = sensor_cols[sensor_i]
        original_val = df_noisy.loc[row_i, sensor]
        if pd.isna(original_val):
            continue
        hf_noise = float(rng.uniform(-HF_NOISE_MAG, HF_NOISE_MAG))
        df_noisy.loc[row_i, sensor] = float(original_val * (1 + hf_noise))

    # Verify labels unchanged
    for col in LABEL_COLS:
        if col in df.columns:
            if not (df[col].astype(str) == df_noisy[col].astype(str)).all():
                raise RuntimeError(f"Label column {col} was modified during noise injection!")

    return df_noisy


def main() -> None:
    """Generate clean and noisy datasets."""
    if not LEGACY_MEANS_PATH.is_file():
        raise FileNotFoundError(
            f"Missing {LEGACY_MEANS_PATH} — required to preserve scenarios 0–4 means."
        )

    logger.info("=" * 60)
    logger.info("  Caterpillar Test Cell — Dataset Generator")
    logger.info("  Championship Edition — Finale 2026")
    logger.info("=" * 60)

    rng = np.random.default_rng(RNG_SEED)
    base_time = datetime(2025, 1, 15, 9, 0, 0)
    all_dfs: List[pd.DataFrame] = []
    row_offset = 0

    for sid in range(len(SCENARIOS)):
        meta = SCENARIOS[sid]
        logger.info("[Scenario %d] %s ...", sid, meta["name"])
        df_scenario = simulate_scenario(sid, ROWS_PER_SCENARIO, rng, row_offset, base_time)
        all_dfs.append(df_scenario)
        row_offset += ROWS_PER_SCENARIO
        logger.info("  %d rows | Leak: %s", len(df_scenario), meta["leak_location"])

    combined_df = pd.concat(all_dfs, ignore_index=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    try:
        combined_df.to_csv(CLEAN_DATA_PATH, index=False)
    except OSError as exc:
        logger.error("Failed to write clean dataset: %s", exc)
        raise

    logger.info("Clean dataset saved: %s (%d rows)", CLEAN_DATA_PATH, len(combined_df))

    logger.info("Injecting realistic noise...")
    noisy_df = inject_realistic_noise(combined_df, random_seed=RNG_SEED)

    try:
        noisy_df.to_csv(NOISY_DATA_PATH, index=False)
    except OSError as exc:
        logger.error("Failed to write noisy dataset: %s", exc)
        raise

    logger.info("Noisy dataset saved: %s (%d rows)", NOISY_DATA_PATH, len(noisy_df))

    total = len(combined_df)
    logger.info("Noise injection summary:")
    logger.info("  Spikes:      ~%d rows (%.1f%%)", int(total * SPIKE_RATE), SPIKE_RATE * 100)
    logger.info("  Drift:       ~%d rows (%.1f%%)", int(total * DRIFT_RATE), DRIFT_RATE * 100)
    logger.info("  Missing:     ~%d rows (%.1f%%)", int(total * MISSING_RATE), MISSING_RATE * 100)
    logger.info("  HF noise:    ~%d rows (%.1f%%)", int(total * HF_NOISE_RATE), HF_NOISE_RATE * 100)

    logger.info("Scenario distribution (noisy):")
    for scenario, count in noisy_df["Leak_Location"].value_counts().items():
        logger.info("  %-35s %d rows", scenario, count)

    logger.info("Both datasets ready. Next: python src/preprocess.py")


if __name__ == "__main__":
    main()
