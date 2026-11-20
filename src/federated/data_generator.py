"""
src/federated/data_generator.py — Facility-Specific C13 Dataset Generator
==========================================================================
Generates per-facility C13 datasets from the base clean CSV by applying
environmental and operational transformations specific to each test cell.

Every generated dataset is still C13 data — just as it would appear coming
from a specific physical facility with its own environmental conditions.
"""

import os
import logging
import numpy as np
import pandas as pd

from src.federated.facility_config import (
    FACILITY_CONFIGS,
    DATASET_PATHS,
    BASE_C13_CLEAN_PATH,
    ABSOLUTE_PRESSURE_SENSORS,
    MASS_FLOW_SENSORS,
    LABEL_COLUMNS,
)

logger = logging.getLogger(__name__)


def generate_facility_dataset(facility_key: str):
    """
    Generate a facility-specific C13 dataset.

    Parameters:
        facility_key: str — one of "hosur_cell_1", "hosur_cell_2", "pune_cell"

    Returns:
        tuple: (noisy_df, clean_df)
    """
    config = FACILITY_CONFIGS[facility_key]
    paths = DATASET_PATHS[facility_key]

    logger.info("    Loading base C13 dataset from %s...", BASE_C13_CLEAN_PATH)
    base_df = pd.read_csv(BASE_C13_CLEAN_PATH)
    logger.info("    Base dataset shape: %s", base_df.shape)

    # ── STEP 1: RESAMPLE TO FACILITY DATA VOLUME ──────────────────────────
    # Each facility has different years of operation = different data volume.
    target_rows = config["num_rows"]
    if len(base_df) >= target_rows:
        df = base_df.sample(n=target_rows, random_state=42).reset_index(drop=True)
    else:
        df = base_df.sample(n=target_rows, replace=True, random_state=42).reset_index(drop=True)
    logger.info("    Resampled to %d rows for %s", len(df), config["facility_name"])

    # ── STEP 2: AMBIENT PRESSURE SCALING ──────────────────────────────────
    # Applies to all absolute pressure sensors proportionally.
    # Pune at 560m has ambient pressure of 94.5 kPa vs 101.3 kPa at Hosur.
    # This shifts all absolute pressure readings proportionally down.
    pressure_scale = config["ambient_pressure_kpa"] / 101.3
    for sensor in ABSOLUTE_PRESSURE_SENSORS:
        if sensor in df.columns:
            df[sensor] = df[sensor] * pressure_scale
    logger.info("    Applied ambient pressure scale: %.4f", pressure_scale)

    # ── STEP 3: HUMIDITY / MASS FLOW SCALING ──────────────────────────────
    # Higher humidity increases air density marginally → higher MAF readings.
    humidity_factor = config["humidity_factor"]
    for sensor in MASS_FLOW_SENSORS:
        if sensor in df.columns:
            df[sensor] = df[sensor] * humidity_factor
    logger.info("    Applied humidity factor: %.3f", humidity_factor)

    # ── STEP 4: CHARACTERISTIC SENSOR DRIFT ───────────────────────────────
    # Applies only to NORMAL operation rows (Leak_Present == 0).
    # Simulates systematic sensor bias that develops at a specific facility
    # due to environmental effects on transducers over years.
    drift_sensor = config["characteristic_drift_sensor"]
    drift_magnitude = config["characteristic_drift_magnitude"]

    if drift_sensor is not None and drift_sensor in df.columns:
        normal_mask = df["Leak_Present"] == 0
        df.loc[normal_mask, drift_sensor] = (
            df.loc[normal_mask, drift_sensor] * (1 + drift_magnitude)
        )
        logger.info(
            "    Applied %+.1f%% drift to %s on %d normal rows",
            drift_magnitude * 100, drift_sensor, int(normal_mask.sum()),
        )

    # ── STEP 5: SCENARIO REBALANCING ──────────────────────────────────────
    # Each facility has seen certain failure modes more frequently.
    scenario = config["overrepresented_scenario"]
    factor = config["overrepresentation_factor"]

    scenario_rows = df[df["Leak_Location"] == scenario]
    if len(scenario_rows) > 0:
        extra_count = int(len(scenario_rows) * (factor - 1.0))
        if extra_count > 0:
            extra_rows = scenario_rows.sample(
                n=extra_count, replace=True, random_state=42
            )
            df = pd.concat([df, extra_rows], ignore_index=True)
            # Resample back to target_rows to maintain dataset size
            if len(df) > target_rows:
                df = df.sample(
                    n=target_rows, replace=False, random_state=42
                ).reset_index(drop=True)
            new_pct = (df["Leak_Location"] == scenario).mean() * 100
            logger.info(
                "    Overrepresented %s: now %.1f%% of data", scenario, new_pct
            )

    # ── STEP 6: UPDATE METADATA ────────────────────────────────────────────
    if "Test_Cell_ID" in df.columns:
        df["Test_Cell_ID"] = config["facility_name"]
    if "Engine_Serial_No" in df.columns:
        df["Engine_Serial_No"] = f"C13-SIM-{config['client_id']}"
    if "Ambient_Pressure_kPa" in df.columns:
        df["Ambient_Pressure_kPa"] = config["ambient_pressure_kpa"]
    if "Ambient_Temp_C" in df.columns:
        df["Ambient_Temp_C"] = config["ambient_temp_c"]

    # Save CLEAN version (no noise injection) — what client trains on after DQP
    clean_df = df.copy()

    # ── STEP 7: APPLY FACILITY-SPECIFIC NOISE (noisy version only) ─────────
    noisy_df = df.copy()
    noise_profile = config["noise_profile"]

    # Identify sensor column types
    non_sensor_cols = set(
        LABEL_COLUMNS
        + ["Test_ID", "Timestamp", "Test_Cell_ID", "Engine_Serial_No",
           "Test_Mode", "Confidence_Score", "Ambient_Pressure_kPa",
           "Ambient_Temp_C", "Engine_Speed_Setpoint_RPM", "Engine_Load_Pct"]
    )
    sensor_cols = [c for c in df.columns if c not in non_sensor_cols]

    pressure_cols = [c for c in sensor_cols if "Pressure" in c or "Ratio" in c]
    temp_cols = [c for c in sensor_cols if "Temp" in c or "Temperature" in c]
    flow_cols = [c for c in sensor_cols if "Flow" in c or "MAF" in c or "Speed" in c]

    np.random.seed(42)
    n_rows = len(noisy_df)

    # Gaussian noise per sensor type
    for col in pressure_cols:
        if col in noisy_df.columns:
            std = noisy_df[col].abs() * noise_profile["pressure_noise_pct"] / 100
            noisy_df[col] = noisy_df[col] + np.random.normal(0, std.values)

    for col in temp_cols:
        if col in noisy_df.columns:
            std = noisy_df[col].abs() * noise_profile["temp_noise_pct"] / 100
            noisy_df[col] = noisy_df[col] + np.random.normal(0, std.values)

    for col in flow_cols:
        if col in noisy_df.columns:
            std = noisy_df[col].abs() * noise_profile["flow_noise_pct"] / 100
            noisy_df[col] = noisy_df[col] + np.random.normal(0, std.values)

    # Spike injection
    spike_rate = noise_profile["spike_injection_rate"]
    spike_count = int(n_rows * spike_rate)
    if spike_count > 0 and len(sensor_cols) > 0:
        for col in sensor_cols:
            if col in noisy_df.columns:
                spike_indices = np.random.choice(n_rows, spike_count, replace=False)
                direction = np.random.choice([-1, 1], spike_count)
                for idx, d in zip(spike_indices, direction):
                    if d == 1:
                        noisy_df.at[idx, col] *= np.random.uniform(1.8, 2.5)
                    else:
                        noisy_df.at[idx, col] *= np.random.uniform(0.1, 0.4)

    # Drift injection — linear drift added to a fraction of rows
    drift_rate = noise_profile["drift_injection_rate"]
    drift_count = int(n_rows * drift_rate)
    if drift_count > 0 and len(pressure_cols) >= 1:
        drift_indices = np.random.choice(n_rows, drift_count, replace=False)
        for col in pressure_cols[:3]:
            if col in noisy_df.columns:
                for idx in drift_indices:
                    drift_amount = (idx / n_rows) * 0.05 * abs(noisy_df.at[idx, col])
                    noisy_df.at[idx, col] += drift_amount

    # Missing values
    missing_rate = noise_profile["missing_rate"]
    for col in sensor_cols:
        if col in noisy_df.columns:
            missing_count = int(n_rows * missing_rate)
            if missing_count > 0:
                missing_indices = np.random.choice(n_rows, missing_count, replace=False)
                noisy_df.loc[missing_indices, col] = np.nan

    logger.info("    Noise injection complete for %s", config["facility_name"])
    return noisy_df, clean_df


def generate_all_facility_datasets(force_regenerate: bool = False) -> None:
    """
    Generate datasets for all three facilities.
    Skips generation if files already exist unless force_regenerate=True.

    Parameters:
        force_regenerate: bool — if True, regenerate even if files exist
    """
    os.makedirs("data/federated", exist_ok=True)

    for facility_key in FACILITY_CONFIGS.keys():
        paths = DATASET_PATHS[facility_key]
        noisy_path = paths["noisy"]
        clean_path = paths["clean"]

        if not force_regenerate and os.path.exists(noisy_path) and os.path.exists(clean_path):
            logger.info("  Skipping %s — files already exist", facility_key)
            continue

        logger.info("  Generating dataset for %s...", facility_key)
        config = FACILITY_CONFIGS[facility_key]
        logger.info("    Facility: %s, %s", config["facility_name"], config["city"])
        logger.info("    Characteristics: %s", config["description"])

        noisy_df, clean_df = generate_facility_dataset(facility_key)

        noisy_df.to_csv(noisy_path, index=False)
        clean_df.to_csv(clean_path, index=False)

        logger.info("    Saved noisy: %s (%d rows)", noisy_path, len(noisy_df))
        logger.info("    Saved clean: %s (%d rows)", clean_path, len(clean_df))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s | %(levelname)s | %(message)s")
    logger.info("Generating facility-specific C13 datasets...")
    generate_all_facility_datasets()
    logger.info("Done.")
