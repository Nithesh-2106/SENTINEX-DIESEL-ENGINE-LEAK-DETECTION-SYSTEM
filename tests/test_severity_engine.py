"""Tests for src/severity_engine.py — physics severity mirror of dynamicSeverity.js."""

from __future__ import annotations

import copy

import pytest

from baseline_contract import C13_SENSOR_BASELINES
from severity_engine import compute_severity

BASELINE = dict(C13_SENSOR_BASELINES)

SCENARIO_DEVIATIONS = {
    "Intake_PreTurbo": {
        "Pre_Compressor_Pressure_kPa": -0.085,
        "Post_Compressor_Pressure_kPa": -0.106,
        "Boost_Pressure_kPa": -0.197,
    },
    "Intake_PostTurbo_CAC": {
        "CAC_Pressure_Drop_kPa": 3.6,
        "Post_CAC_Pressure_kPa": -0.085,
        "Intake_Manifold_Pressure_kPa": -0.09,
    },
    "Exhaust_PreTurbine": {
        "Pre_Turbine_Pressure_kPa": -0.156,
        "Exhaust_Manifold_Temp_C": 0.059,
        "Exhaust_Manifold_Pressure_kPa": -0.139,
    },
    "Exhaust_PostTurbine": {
        "Post_Turbine_Pressure_kPa": -0.071,
        "Post_DPF_Pressure_kPa": -0.061,
        "Post_SCR_Pressure_kPa": -0.053,
    },
    "EGR_Leak": {
        "EGR_Flow_Rate_kgph": -0.345,
        "Intake_Manifold_Temp_C": 0.073,
        "Exhaust_Manifold_Pressure_kPa": -0.026,
    },
    "CAC_Direct_Leak": {
        "CAC_Pressure_Drop_kPa": 4.2,
        "Post_CAC_Temp_C": 0.192,
        "Post_CAC_Pressure_kPa": -0.099,
    },
    "Minor_Intake_Leak": {
        "Pre_Compressor_Pressure_kPa": -0.029,
        "Post_Compressor_Pressure_kPa": -0.039,
        "Post_CAC_Pressure_kPa": -0.04,
        "Intake_Manifold_Pressure_kPa": -0.038,
        "Boost_Pressure_kPa": -0.07,
    },
}


def _reading_for_location(location: str) -> dict:
    reading = copy.deepcopy(BASELINE)
    devs = SCENARIO_DEVIATIONS[location]
    for key, pct in devs.items():
        if key in reading and reading[key] is not None:
            reading[key] = float(reading[key]) * (1.0 + pct)
    return reading


def test_minor_intake_leak_is_minor():
    result = compute_severity(
        _reading_for_location("Minor_Intake_Leak"),
        BASELINE,
        "Minor_Intake_Leak",
    )
    assert result.severity == "Minor"


def test_exhaust_preturbine_is_severe():
    result = compute_severity(
        _reading_for_location("Exhaust_PreTurbine"),
        BASELINE,
        "Exhaust_PreTurbine",
    )
    assert result.severity == "Severe"


def test_egr_leak_is_moderate():
    result = compute_severity(
        _reading_for_location("EGR_Leak"),
        BASELINE,
        "EGR_Leak",
    )
    assert result.severity == "Moderate"


def test_cac_direct_is_moderate():
    result = compute_severity(
        _reading_for_location("CAC_Direct_Leak"),
        BASELINE,
        "CAC_Direct_Leak",
    )
    assert result.severity == "Moderate"


def test_performance_impact_positive():
    result = compute_severity(
        _reading_for_location("Intake_PreTurbo"),
        BASELINE,
        "Intake_PreTurbo",
    )
    assert result.performance_impact_pct > 0
    assert result.impact_basis


def test_sfi_gates_moderate_severity():
    reading = _reading_for_location("Intake_PreTurbo")
    result = compute_severity(
        reading,
        BASELINE,
        "Intake_PreTurbo",
        sfi_confirmed=False,
    )
    assert result.severity == "Minor"


def test_normal_returns_none():
    result = compute_severity(BASELINE, BASELINE, "None")
    assert result.severity == "None"
    assert result.performance_impact_pct == 0.0


@pytest.mark.parametrize(
    ("location", "expected"),
    [
        ("Minor_Intake_Leak", "Minor"),
        ("Exhaust_PostTurbine", "Minor"),
        ("EGR_Leak", "Moderate"),
        ("CAC_Direct_Leak", "Moderate"),
        ("Intake_PreTurbo", "Severe"),
        ("Intake_PostTurbo_CAC", "Severe"),
        ("Exhaust_PreTurbine", "Severe"),
    ],
)
def test_all_calibrated_scenarios(location: str, expected: str):
    result = compute_severity(
        _reading_for_location(location),
        BASELINE,
        location,
    )
    assert result.severity == expected
