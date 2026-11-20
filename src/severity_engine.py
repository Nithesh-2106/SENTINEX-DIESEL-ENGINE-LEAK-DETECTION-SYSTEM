"""
Severity Engine — Python mirror of dashboard/src/utils/dynamicSeverity.js
Server-side physics severity for API responses.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

LOCATION_PRIMARY_SENSORS: Dict[str, List[str]] = {
    "Intake_PreTurbo": [
        "Pre_Compressor_Pressure_kPa",
        "Boost_Pressure_kPa",
        "Post_Compressor_Pressure_kPa",
    ],
    "Intake_PostTurbo_CAC": [
        "CAC_Pressure_Drop_kPa",
        "Post_CAC_Pressure_kPa",
        "Intake_Manifold_Pressure_kPa",
    ],
    "Exhaust_PreTurbine": [
        "Pre_Turbine_Pressure_kPa",
        "Exhaust_Manifold_Temp_C",
        "Exhaust_Manifold_Pressure_kPa",
    ],
    "Exhaust_PostTurbine": [
        "Post_Turbine_Pressure_kPa",
        "Post_DPF_Pressure_kPa",
        "Post_SCR_Pressure_kPa",
    ],
    "EGR_Leak": [
        "EGR_Flow_Rate_kgph",
        "Intake_Manifold_Temp_C",
        "Exhaust_Manifold_Pressure_kPa",
    ],
    "CAC_Direct_Leak": [
        "CAC_Pressure_Drop_kPa",
        "Post_CAC_Temp_C",
        "Post_CAC_Pressure_kPa",
    ],
    "Minor_Intake_Leak": [
        "Post_CAC_Pressure_kPa",
        "Intake_Manifold_Pressure_kPa",
        "Boost_Pressure_kPa",
    ],
}

SENSOR_DEV_CAPS = {
    "EGR_Flow_Rate_kgph": 14.0,
}

SCORE_WEIGHT_MAX = 0.65
SCORE_WEIGHT_AVG = 0.35

DEFAULT_THRESHOLDS = {"minor": 7.5, "moderate": 12.0, "severe": 19.0}

LOCATION_THRESHOLDS = {
    "EGR_Leak": {"minor": 7.5, "moderate": 14.0, "severe": 22.0},
    "CAC_Direct_Leak": {"minor": 7.5, "moderate": 21.0, "severe": 26.0},
    "Minor_Intake_Leak": {"minor": 8.5, "moderate": 14.0, "severe": 22.0},
    "Exhaust_PostTurbine": {"minor": 8.0, "moderate": 14.0, "severe": 22.0},
}

ACTION_MAP = {
    "Minor": "Flag_and_Monitor",
    "Moderate": "Pause_Test_Inspect_Component",
    "Severe": "Pause_Test_Inspect_Component",
    "Critical": "Pause_Test_Inspect_Component",
    "None": "Continue_Testing",
}


@dataclass
class SeverityResult:
    severity: str
    recommended_action: str
    performance_impact_pct: float
    impact_basis: str
    blend_score: float
    severity_method: str = "physics_rules_v1"


def _thresholds_for_location(leak_location: str) -> Dict[str, float]:
    return LOCATION_THRESHOLDS.get(leak_location, DEFAULT_THRESHOLDS)


def _effective_deviation_pct(sensor: str, actual: float, expected: float) -> float:
    if sensor == "CAC_Pressure_Drop_kPa":
        delta_kpa = abs(actual - expected)
        return min(22.0, (delta_kpa / 4.0) * 5.0)

    if sensor == "Intake_Mass_Balance_Error_kgph":
        delta = abs(actual - expected)
        return min(18.0, (delta / 2.5) * 4.0)

    if expected == 0:
        return 0.0

    pct = abs((actual - expected) / abs(expected) * 100.0)
    cap = SENSOR_DEV_CAPS.get(sensor)
    if cap is not None:
        pct = min(pct, cap)
    return pct


def _blend_score(deviations: List[float]) -> float:
    max_dev = max(deviations)
    avg_dev = sum(deviations) / len(deviations)
    return max_dev * SCORE_WEIGHT_MAX + avg_dev * SCORE_WEIGHT_AVG


def _score_to_severity(score: float, leak_location: str) -> str:
    t = _thresholds_for_location(leak_location)
    if score < t["minor"]:
        return "Minor"
    if score < t["moderate"]:
        return "Moderate"
    if score < t["severe"]:
        return "Severe"
    return "Critical"


def _raw_dev_pct(reading: dict, baseline: dict, sensor: str) -> float:
    actual = reading.get(sensor)
    expected = baseline.get(sensor)
    if actual is None or expected is None:
        return 0.0
    expected_f = float(expected)
    if expected_f == 0:
        return 0.0
    return abs((float(actual) - expected_f) / expected_f * 100.0)


def _compute_performance_impact(
    reading: dict, baseline: dict, leak_location: str
) -> tuple[float, str]:
    impact_map = {
        "Intake_PreTurbo": lambda: (
            _raw_dev_pct(reading, baseline, "Pre_Compressor_Pressure_kPa")
            + _raw_dev_pct(reading, baseline, "Boost_Pressure_kPa")
        )
        / 2.0,
        "Intake_PostTurbo_CAC": lambda: _raw_dev_pct(
            reading, baseline, "Post_CAC_Pressure_kPa"
        ),
        "Exhaust_PreTurbine": lambda: (
            _raw_dev_pct(reading, baseline, "Exhaust_Manifold_Pressure_kPa")
            + _raw_dev_pct(reading, baseline, "Turbine_Expansion_Ratio")
        )
        / 2.0,
        "Exhaust_PostTurbine": lambda: _raw_dev_pct(
            reading, baseline, "Post_Turbine_Pressure_kPa"
        )
        * 0.5,
        "EGR_Leak": lambda: _raw_dev_pct(reading, baseline, "EGR_Flow_Rate_kgph") * 0.3,
        "CAC_Direct_Leak": lambda: _raw_dev_pct(
            reading, baseline, "Post_CAC_Pressure_kPa"
        ),
        "Minor_Intake_Leak": lambda: (
            _raw_dev_pct(reading, baseline, "Pre_Compressor_Pressure_kPa")
            + _raw_dev_pct(reading, baseline, "Post_Compressor_Pressure_kPa")
            + _raw_dev_pct(reading, baseline, "Post_CAC_Pressure_kPa")
        )
        / 3.0,
    }

    basis_map = {
        "Intake_PreTurbo": "MAF and boost pressure loss",
        "Intake_PostTurbo_CAC": "Charge air pressure loss",
        "Exhaust_PreTurbine": "Turbine energy loss",
        "Exhaust_PostTurbine": "Back-pressure change",
        "EGR_Leak": "Emissions impact",
        "CAC_Direct_Leak": "Boost pressure loss at CAC",
        "Minor_Intake_Leak": "Distributed intake loss",
    }

    fn = impact_map.get(leak_location)
    impact = min(fn(), 25.0) if fn else 0.0
    return round(impact, 1), basis_map.get(leak_location, "")


def compute_severity(
    reading: dict,
    baseline: dict,
    leak_location: str,
    sfi_confirmed: bool = True,
) -> SeverityResult:
    """Compute physics-based leak severity (mirror of dynamicSeverity.js)."""
    if leak_location in ("None", None, ""):
        return SeverityResult(
            severity="None",
            recommended_action=ACTION_MAP["None"],
            performance_impact_pct=0.0,
            impact_basis="",
            blend_score=0.0,
        )

    sensors = LOCATION_PRIMARY_SENSORS.get(
        leak_location, LOCATION_PRIMARY_SENSORS["Intake_PreTurbo"]
    )

    impact_pct, impact_basis = _compute_performance_impact(
        reading, baseline, leak_location
    )

    deviations: List[float] = []
    for sensor in sensors:
        actual = reading.get(sensor)
        expected = baseline.get(sensor)
        if actual is None or expected is None:
            continue
        dev = _effective_deviation_pct(sensor, float(actual), float(expected))
        if dev > 0:
            deviations.append(dev)

    if not deviations:
        tier = "Moderate"
        return SeverityResult(
            severity=tier,
            recommended_action=ACTION_MAP[tier],
            performance_impact_pct=impact_pct,
            impact_basis=impact_basis,
            blend_score=0.0,
        )

    score = _blend_score(deviations)
    tier = _score_to_severity(score, leak_location)

    if not sfi_confirmed and tier in ("Moderate", "Severe", "Critical"):
        tier = "Minor"

    return SeverityResult(
        severity=tier,
        recommended_action=ACTION_MAP.get(tier, ACTION_MAP["Minor"]),
        performance_impact_pct=impact_pct,
        impact_basis=impact_basis,
        blend_score=round(score, 2),
    )
