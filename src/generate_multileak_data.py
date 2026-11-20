"""
Multi-Leak Dataset Generator

Generates synthetic sensor data for simultaneous
leak scenarios using multiplicative superposition
of physically independent single-leak patterns.

Only valid combinations are generated:
  - No Exhaust_PreTurbine combinations
    (turbo energy coupling corrupts patterns)
  - All other combinations are approximately
    additive due to physical independence

Output: data/caterpillar_multileak_dataset.csv
Labels: multi-hot binary vectors per location
"""

import logging
from pathlib import Path

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ── Leak location index (same order as ML encoder) ──
LEAK_LOCATIONS = [
    "CAC_Direct_Leak",
    "EGR_Leak",
    "Exhaust_PostTurbine",
    "Exhaust_PreTurbine",
    "Intake_PostTurbo_CAC",
    "Intake_PreTurbo",
    "Minor_Intake_Leak",
]

# ── Normal baseline (C13, 75% load, 1800 RPM) ──
NORMAL_BASELINES = {
    "Engine_Speed_Setpoint_RPM": 1800.0,
    "Engine_Load_Setpoint_Pct": 75.0,
    "Engine_Speed_Actual_RPM": 1800.0,
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
    "Post_Compressor_Temp_C": 168.0,
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
    "Post_Turbine_Temp_C": 480.0,
    "Post_DOC_Pressure_kPa": 109.5,
    "Post_DOC_Temp_C": 490.0,
    "Post_DPF_Pressure_kPa": 106.0,
    "Post_DPF_Temp_C": 470.0,
    "Post_SCR_Pressure_kPa": 103.5,
    "Post_SCR_Temp_C": 420.0,
    "Tailpipe_BackPressure_kPa": 102.0,
    "EGR_Flow_Rate_kgph": 58.0,
    "Intake_Mass_Balance_Error_kgph": 6.5,
    "Compressor_Pressure_Ratio": 2.19,
    "Turbine_Expansion_Ratio": 2.01,
    "CAC_Pressure_Drop_kPa": 5.0,
    "DPF_Delta_Pressure_kPa": 3.5,
    "Intake_Temp_Rise_Across_CAC_C": -116.0,
}

# ── Single-scenario percentage deviations ──
SCENARIO_DEVIATIONS = {
    "Intake_PreTurbo": {
        "Pre_Compressor_Pressure_kPa": -0.085,
        "Post_Compressor_Pressure_kPa": -0.106,
        "Post_Compressor_Temp_C": -0.060,
        "Post_CAC_Pressure_kPa": -0.108,
        "Intake_Manifold_Pressure_kPa": -0.109,
        "Turbocharger_Speed_RPM": -0.054,
        "Boost_Pressure_kPa": -0.197,
        "Compressor_Pressure_Ratio": -0.055,
    },
    "Intake_PostTurbo_CAC": {
        "Post_CAC_Pressure_kPa": -0.085,
        "Post_CAC_Temp_C": +0.115,
        "Intake_Manifold_Pressure_kPa": -0.090,
        "Intake_Manifold_Temp_C": +0.109,
        "Boost_Pressure_kPa": -0.085,
        "CAC_Pressure_Drop_kPa": +4.200,
        "Intake_Temp_Rise_Across_CAC_C": +0.300,
    },
    "Exhaust_PreTurbine": {
        "Exhaust_Manifold_Pressure_kPa": -0.139,
        "Exhaust_Manifold_Temp_C": +0.059,
        "Pre_Turbine_Pressure_kPa": -0.156,
        "Pre_Turbine_Temp_C": -0.015,
        "Post_Turbine_Pressure_kPa": -0.036,
        "Post_Turbine_Temp_C": -0.042,
        "Turbine_Expansion_Ratio": -0.125,
        "Post_Compressor_Pressure_kPa": -0.059,
        "Boost_Pressure_kPa": -0.111,
        "Turbocharger_Speed_RPM": -0.043,
    },
    "Exhaust_PostTurbine": {
        "Post_Turbine_Pressure_kPa": -0.071,
        "Post_Turbine_Temp_C": -0.073,
        "Post_DOC_Pressure_kPa": -0.073,
        "Post_DOC_Temp_C": -0.071,
        "Post_DPF_Pressure_kPa": -0.061,
        "Post_DPF_Temp_C": -0.064,
        "Post_SCR_Pressure_kPa": -0.053,
        "Post_SCR_Temp_C": -0.071,
        "DPF_Delta_Pressure_kPa": -0.430,
    },
    "EGR_Leak": {
        "EGR_Flow_Rate_kgph": -0.345,
        "Intake_Manifold_Pressure_kPa": -0.012,
        "Intake_Manifold_Temp_C": +0.073,
        "Exhaust_Manifold_Pressure_kPa": -0.026,
        "Intake_Mass_Balance_Error_kgph": +1.400,
    },
    "CAC_Direct_Leak": {
        "Post_CAC_Pressure_kPa": -0.099,
        "Post_CAC_Temp_C": +0.192,
        "Intake_Manifold_Pressure_kPa": -0.102,
        "Intake_Manifold_Temp_C": +0.145,
        "Boost_Pressure_kPa": -0.222,
        "CAC_Pressure_Drop_kPa": +4.600,
        "Intake_Temp_Rise_Across_CAC_C": +0.350,
    },
    "Minor_Intake_Leak": {
        "Pre_Compressor_Pressure_kPa": -0.029,
        "Post_Compressor_Pressure_kPa": -0.039,
        "Post_Compressor_Temp_C": -0.021,
        "Post_CAC_Pressure_kPa": -0.040,
        "Intake_Manifold_Pressure_kPa": -0.038,
        "Turbocharger_Speed_RPM": -0.020,
        "Boost_Pressure_kPa": -0.070,
    },
}

VALID_COMBINATIONS = [
    ("Intake_PreTurbo", "EGR_Leak"),
    ("Intake_PostTurbo_CAC", "EGR_Leak"),
    ("CAC_Direct_Leak", "EGR_Leak"),
    ("Exhaust_PostTurbine", "EGR_Leak"),
    ("Exhaust_PostTurbine", "Intake_PreTurbo"),
    ("Exhaust_PostTurbine", "CAC_Direct_Leak"),
    ("Minor_Intake_Leak", "EGR_Leak"),
]

ROWS_PER_COMBINATION = 2500


def noise(value: float, pct: float = 0.005) -> float:
    """Add gaussian noise to a value."""
    return float(value * (1 + np.random.normal(0, pct)))


def generate_combination(
    scenario_a: str,
    scenario_b: str,
    n_rows: int = ROWS_PER_COMBINATION,
) -> pd.DataFrame:
    """Generate rows for simultaneous leak scenarios."""
    devs_a = SCENARIO_DEVIATIONS.get(scenario_a, {})
    devs_b = SCENARIO_DEVIATIONS.get(scenario_b, {})

    label_a = LEAK_LOCATIONS.index(scenario_a)
    label_b = LEAK_LOCATIONS.index(scenario_b)
    multihot = [0] * len(LEAK_LOCATIONS)
    multihot[label_a] = 1
    multihot[label_b] = 1

    rows = []
    for _ in range(n_rows):
        reading = {}

        for sensor, baseline_val in NORMAL_BASELINES.items():
            dev_a = devs_a.get(sensor, 0.0)
            dev_b = devs_b.get(sensor, 0.0)
            combined_factor = (1 + dev_a) * (1 + dev_b)
            noisy_val = noise(baseline_val * combined_factor, pct=0.005)
            reading[sensor] = round(noisy_val, 3)

        reading["Compressor_Pressure_Ratio"] = round(
            reading["Post_Compressor_Pressure_kPa"]
            / max(reading["Pre_Compressor_Pressure_kPa"], 0.1),
            4,
        )
        reading["Turbine_Expansion_Ratio"] = round(
            reading["Pre_Turbine_Pressure_kPa"]
            / max(reading["Post_Turbine_Pressure_kPa"], 0.1),
            4,
        )
        reading["CAC_Pressure_Drop_kPa"] = round(
            reading["Post_Compressor_Pressure_kPa"]
            - reading["Post_CAC_Pressure_kPa"],
            3,
        )
        reading["DPF_Delta_Pressure_kPa"] = round(
            reading["Post_DOC_Pressure_kPa"]
            - reading["Post_DPF_Pressure_kPa"],
            3,
        )
        reading["Intake_Mass_Balance_Error_kgph"] = round(
            reading["MAF_Sensor_Reading_kgph"]
            - (reading["Intake_Manifold_Pressure_kPa"] / 0.296),
            3,
        )

        reading["Leak_Location_A"] = scenario_a
        reading["Leak_Location_B"] = scenario_b
        reading["Is_Multi_Leak"] = 1
        reading["Combo_Label"] = f"{scenario_a}+{scenario_b}"

        for i, loc in enumerate(LEAK_LOCATIONS):
            reading[f"label_{loc}"] = multihot[i]

        rows.append(reading)

    return pd.DataFrame(rows)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s | %(message)s",
    )
    np.random.seed(42)

    all_dfs = []

    print("=" * 65)
    print("  MULTI-LEAK DATASET GENERATOR")
    print("=" * 65)

    for scenario_a, scenario_b in VALID_COMBINATIONS:
        print(f"\n[Generating] {scenario_a} + {scenario_b}")
        df = generate_combination(scenario_a, scenario_b, ROWS_PER_COMBINATION)
        all_dfs.append(df)
        print(f"  ✓ {len(df)} rows")

    combined = pd.concat(all_dfs, ignore_index=True)

    output_path = Path("data/caterpillar_multileak_dataset.csv")
    combined.to_csv(output_path, index=False)

    print(f"\n{'=' * 65}")
    print(f"  Dataset saved: {output_path}")
    print(f"  Total rows:    {len(combined)}")
    print(f"  Combinations:  {len(VALID_COMBINATIONS)}")
    print("\n  Distribution:")
    for combo in combined["Combo_Label"].unique():
        count = (combined["Combo_Label"] == combo).sum()
        print(f"    {combo}: {count} rows")

    label_cols = [f"label_{loc}" for loc in LEAK_LOCATIONS]
    active_per_row = combined[label_cols].sum(axis=1)
    assert (active_per_row == 2).all(), "Each row must have exactly 2 active labels"
    print("\n  ✅ All rows have exactly 2 active labels")
    print("=" * 65)
