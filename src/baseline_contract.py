"""
BASELINE CONTRACT
=================
Defines which baseline each component uses and why.

SFI / DQP cascade detection use engine-specific static baselines aligned
with the dashboard simulator. CAT C13 values match training dataset centroids.
CAT C7/C15 use scaled baselines with the same percentage leak signatures.

ML inference translates non-C13 readings into the C13 training frame so the
model (trained on C13 absolute values) sees consistent deviation patterns.
"""

from __future__ import annotations

from typing import Dict

from engine_config import DEFAULT_ENGINE

# C13 dataset-aligned centroids — must stay stable for ML/SFI/tests.
C13_SENSOR_BASELINES: Dict[str, float] = {
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

# Aligned with dashboard/src/simulator.js ENGINE_BASELINES.CAT_C7
C7_SENSOR_BASELINES: Dict[str, float] = {
    **C13_SENSOR_BASELINES,
    "Engine_Speed_Setpoint_RPM": 2000.0,
    "Engine_Speed_Actual_RPM": 2000.0,
    "Fuel_Flow_Rate_kgph": 30.3,
    "MAF_Sensor_Reading_kgph": 520.0,
    "Pre_Compressor_Pressure_kPa": 97.6,
    "Post_Compressor_Pressure_kPa": 203.0,
    "Post_CAC_Pressure_kPa": 198.3,
    "Intake_Manifold_Pressure_kPa": 196.4,
    "Boost_Pressure_kPa": 101.7,
    "Turbocharger_Speed_RPM": 82000.0,
    "Exhaust_Manifold_Pressure_kPa": 214.2,
    "Exhaust_Manifold_Temp_C": 640.0,
    "Pre_Turbine_Pressure_kPa": 209.5,
    "Pre_Turbine_Temp_C": 630.0,
    "Post_Turbine_Pressure_kPa": 108.0,
    "Post_Turbine_Temp_C": 451.8,
    "Post_DOC_Pressure_kPa": 105.6,
    "Post_DPF_Pressure_kPa": 102.3,
    "Post_SCR_Pressure_kPa": 102.3,
    "Post_SCR_Temp_C": 442.0,
    "EGR_Flow_Rate_kgph": 40.6,
    "Intake_Mass_Balance_Error_kgph": 6.2,
    "Compressor_Pressure_Ratio": 2.08,
    "Turbine_Expansion_Ratio": 1.94,
    "CAC_Pressure_Drop_kPa": 4.7,
}

# Aligned with dashboard/src/simulator.js ENGINE_BASELINES.CAT_C15
C15_SENSOR_BASELINES: Dict[str, float] = {
    **C13_SENSOR_BASELINES,
    "Fuel_Flow_Rate_kgph": 50.4,
    "MAF_Sensor_Reading_kgph": 865.0,
    "Pre_Compressor_Pressure_kPa": 101.5,
    "Post_Compressor_Pressure_kPa": 229.4,
    "Post_CAC_Pressure_kPa": 224.1,
    "Intake_Manifold_Pressure_kPa": 221.9,
    "Boost_Pressure_kPa": 128.1,
    "Turbocharger_Speed_RPM": 98000.0,
    "Exhaust_Manifold_Pressure_kPa": 242.0,
    "Exhaust_Manifold_Temp_C": 710.0,
    "Pre_Turbine_Pressure_kPa": 236.7,
    "Pre_Turbine_Temp_C": 699.0,
    "Post_Turbine_Pressure_kPa": 113.8,
    "Post_Turbine_Temp_C": 501.3,
    "Post_DOC_Pressure_kPa": 111.3,
    "Post_DPF_Pressure_kPa": 107.9,
    "Post_SCR_Pressure_kPa": 104.8,
    "Post_SCR_Temp_C": 438.6,
    "EGR_Flow_Rate_kgph": 71.0,
    "Intake_Mass_Balance_Error_kgph": 8.9,
    "Compressor_Pressure_Ratio": 2.26,
    "Turbine_Expansion_Ratio": 2.08,
    "CAC_Pressure_Drop_kPa": 5.3,
}

SENSOR_BASELINES: Dict[str, float] = dict(C13_SENSOR_BASELINES)

_ENGINE_BASELINE_MAP: Dict[str, Dict[str, float]] = {
    "CAT_C7": C7_SENSOR_BASELINES,
    "CAT_C13": C13_SENSOR_BASELINES,
    "CAT_C15": C15_SENSOR_BASELINES,
}


def resolve_pipeline_baselines(engine_id: str) -> Dict[str, float]:
    """Return numeric baselines for ML/SFI/DQP cascade reference."""
    if engine_id not in _ENGINE_BASELINE_MAP:
        return dict(C13_SENSOR_BASELINES)
    return dict(_ENGINE_BASELINE_MAP[engine_id])


def get_sensor_baselines(engine_id: str = DEFAULT_ENGINE) -> Dict[str, float]:
    """Return sensor baselines for the requested engine."""
    return resolve_pipeline_baselines(engine_id)


def translate_reading_to_c13_frame(
    reading: Dict[str, float],
    engine_id: str = DEFAULT_ENGINE,
) -> Dict[str, float]:
    """
    Map engine-specific absolute readings to C13-equivalent values for ML.

    Preserves percentage deviation from each engine's normal baseline so leak
    signatures match what the C13-trained model expects.
    """
    if engine_id == "CAT_C13":
        return dict(reading)

    engine_bl = resolve_pipeline_baselines(engine_id)
    translated = dict(reading)

    for key, c13_base in C13_SENSOR_BASELINES.items():
        if key not in reading:
            continue
        actual = reading[key]
        eng_base = engine_bl.get(key)
        if actual is None or eng_base is None:
            continue
        if eng_base == 0:
            translated[key] = c13_base + (actual - eng_base)
        else:
            translated[key] = c13_base * (actual / eng_base)

    return translated
