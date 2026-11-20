"""Tests for src/sensor_fault_isolator.py."""

from __future__ import annotations

import copy

import pytest

from sensor_fault_isolator import SensorFaultIsolator

BASELINE = {
    "Pre_Compressor_Pressure_kPa":    99.5,
    "Post_Compressor_Pressure_kPa":  218.0,
    "Post_CAC_Pressure_kPa":         213.0,
    "Intake_Manifold_Pressure_kPa":  211.0,
    "Boost_Pressure_kPa":            116.7,
    "Turbocharger_Speed_RPM":       92000.0,
    "CAC_Pressure_Drop_kPa":           5.0,
    "Post_CAC_Temp_C":                52.0,
    "Exhaust_Manifold_Pressure_kPa": 230.0,
    "Exhaust_Manifold_Temp_C":       680.0,
    "Pre_Turbine_Pressure_kPa":      225.0,
    "Turbine_Expansion_Ratio":         2.01,
    "Post_Turbine_Pressure_kPa":     112.0,
    "Post_DOC_Pressure_kPa":         109.5,
    "Post_DPF_Pressure_kPa":         106.0,
    "Post_SCR_Pressure_kPa":         103.5,
    "Post_Turbine_Temp_C":           480.0,
    "EGR_Flow_Rate_kgph":             58.0,
    "Intake_Manifold_Temp_C":         55.0,
    "Intake_Mass_Balance_Error_kgph":  6.5,
}


@pytest.fixture
def sfi() -> SensorFaultIsolator:
    return SensorFaultIsolator()


def test_genuine_leak_not_flagged_as_fault(sfi: SensorFaultIsolator) -> None:
    reading = copy.deepcopy(BASELINE)
    reading.update({
        "Pre_Compressor_Pressure_kPa":   91.0,
        "Post_Compressor_Pressure_kPa": 195.0,
        "Boost_Pressure_kPa":            93.7,
        "Turbocharger_Speed_RPM":      87000.0,
        "Intake_Manifold_Pressure_kPa": 188.0,
    })
    result = sfi.check("Intake_PreTurbo", reading, BASELINE)
    assert not result.is_sensor_fault
    assert result.is_confirmed_leak


def test_isolated_sensor_flagged_as_fault(sfi: SensorFaultIsolator) -> None:
    reading = copy.deepcopy(BASELINE)
    reading["Pre_Compressor_Pressure_kPa"] = 72.0
    result = sfi.check("Intake_PreTurbo", reading, BASELINE)
    assert result.is_sensor_fault
    assert not result.is_confirmed_leak
    assert result.faulty_sensor == "Pre_Compressor_Pressure_kPa"


def test_exhaust_leak_confirmed(sfi: SensorFaultIsolator) -> None:
    reading = copy.deepcopy(BASELINE)
    reading.update({
        "Exhaust_Manifold_Pressure_kPa": 198.0,
        "Pre_Turbine_Pressure_kPa":      190.0,
        "Turbine_Expansion_Ratio":         1.76,
        "Exhaust_Manifold_Temp_C":       720.0,
        "Post_Turbine_Pressure_kPa":     108.0,
    })
    result = sfi.check("Exhaust_PreTurbine", reading, BASELINE)
    assert not result.is_sensor_fault
    assert result.is_confirmed_leak


def test_faulty_exhaust_sensor_isolated(sfi: SensorFaultIsolator) -> None:
    reading = copy.deepcopy(BASELINE)
    reading["Exhaust_Manifold_Pressure_kPa"] = 165.0
    result = sfi.check("Exhaust_PreTurbine", reading, BASELINE)
    assert result.is_sensor_fault
    assert result.faulty_sensor == "Exhaust_Manifold_Pressure_kPa"


def test_egr_leak_confirmed(sfi: SensorFaultIsolator) -> None:
    reading = copy.deepcopy(BASELINE)
    reading.update({
        "EGR_Flow_Rate_kgph":            38.0,
        "Intake_Manifold_Temp_C":        59.0,
        "Exhaust_Manifold_Pressure_kPa": 224.0,
        "Intake_Mass_Balance_Error_kgph": 15.5,
    })
    result = sfi.check("EGR_Leak", reading, BASELINE)
    assert not result.is_sensor_fault
    assert result.is_confirmed_leak


def test_faulty_egr_sensor_isolated(sfi: SensorFaultIsolator) -> None:
    reading = copy.deepcopy(BASELINE)
    reading["EGR_Flow_Rate_kgph"] = 5.0
    result = sfi.check("EGR_Leak", reading, BASELINE)
    assert result.is_sensor_fault


def test_normal_prediction_skips_check(sfi: SensorFaultIsolator) -> None:
    result = sfi.check("None", BASELINE, BASELINE)
    assert not result.is_sensor_fault
    assert not result.is_confirmed_leak


def test_cac_leak_up_direction_confirmed(sfi: SensorFaultIsolator) -> None:
    reading = copy.deepcopy(BASELINE)
    reading.update({
        "CAC_Pressure_Drop_kPa":         26.0,
        "Post_CAC_Pressure_kPa":        192.0,
        "Post_CAC_Temp_C":               62.0,
        "Intake_Manifold_Pressure_kPa": 189.5,
        "Boost_Pressure_kPa":            90.7,
    })
    result = sfi.check("CAC_Direct_Leak", reading, BASELINE)
    assert not result.is_sensor_fault
    assert result.is_confirmed_leak


def test_confidence_modifier_high_for_confirmed(sfi: SensorFaultIsolator) -> None:
    reading = copy.deepcopy(BASELINE)
    reading.update({
        "Pre_Compressor_Pressure_kPa":   91.0,
        "Post_Compressor_Pressure_kPa": 195.0,
        "Boost_Pressure_kPa":            93.7,
        "Turbocharger_Speed_RPM":      87000.0,
        "Intake_Manifold_Pressure_kPa": 188.0,
    })
    result = sfi.check("Intake_PreTurbo", reading, BASELINE)
    assert result.confidence_modifier > 0.9


def test_confidence_modifier_zero_for_fault(sfi: SensorFaultIsolator) -> None:
    reading = copy.deepcopy(BASELINE)
    reading["Pre_Compressor_Pressure_kPa"] = 72.0
    result = sfi.check("Intake_PreTurbo", reading, BASELINE)
    assert result.confidence_modifier == 0.0


def test_fault_reason_mentions_faulty_sensor(sfi: SensorFaultIsolator) -> None:
    reading = copy.deepcopy(BASELINE)
    reading["Pre_Compressor_Pressure_kPa"] = 72.0
    result = sfi.check("Intake_PreTurbo", reading, BASELINE)
    assert "Pre_Compressor_Pressure_kPa" in result.fault_reason


def test_detect_isolated_fault_single_sensor(sfi: SensorFaultIsolator) -> None:
    """Only one sensor deviating → isolated fault detected."""
    reading = copy.deepcopy(BASELINE)
    reading["Pre_Compressor_Pressure_kPa"] = 72.0
    result = sfi.detect_isolated_fault(reading, BASELINE)
    assert result is not None
    assert result.is_sensor_fault
    assert result.faulty_sensor == "Pre_Compressor_Pressure_kPa"


def test_detect_isolated_fault_ignores_correlated_only_deviation(
    sfi: SensorFaultIsolator,
) -> None:
    """Correlated-only deviation must not block primary-sensor fault detection."""
    reading = copy.deepcopy(BASELINE)
    reading["Pre_Compressor_Pressure_kPa"] = 72.0
    reading["Intake_Mass_Balance_Error_kgph"] = 15.5
    result = sfi.detect_isolated_fault(reading, BASELINE)
    assert result is not None
    assert result.faulty_sensor == "Pre_Compressor_Pressure_kPa"


def test_detect_isolated_fault_skips_multi_sensor_cascade(
    sfi: SensorFaultIsolator,
) -> None:
    """Genuine cascade (multiple sensors) must not trigger isolated fault."""
    reading = copy.deepcopy(BASELINE)
    reading.update({
        "Pre_Compressor_Pressure_kPa": 91.0,
        "Post_Compressor_Pressure_kPa": 195.0,
        "Boost_Pressure_kPa": 93.7,
    })
    assert sfi.detect_isolated_fault(reading, BASELINE) is None


def test_partial_correlated_reduces_confidence(sfi: SensorFaultIsolator) -> None:
    """Primary normal but one correlated deviates — partial confidence."""
    reading = copy.deepcopy(BASELINE)
    reading["Post_Compressor_Pressure_kPa"] = 195.0
    result = sfi.check("Intake_PreTurbo", reading, BASELINE)
    assert not result.is_sensor_fault
    assert result.is_confirmed_leak
    assert result.confidence_modifier == 0.75


def test_sensor_fault_detected_without_demo_hint() -> None:
    """
    Isolated 72 kPa on Pre_Compressor must trigger sensor fault via
    DQP flags and raw-reading cascade check — no demo_scenario hint.
    """
    from predict import predict_leak, SENSOR_BASELINES
    from sensor_fault_isolator import SensorFaultIsolator
    from data_quality_pipeline import DataQualityPipeline
    from steady_state_guard import SteadyStateGuard

    dqp = DataQualityPipeline(window_size=20)
    guard = SteadyStateGuard(window_size=10, min_steady_readings=5)
    sfi = SensorFaultIsolator()
    for _ in range(12):
        predict_leak(
            dict(SENSOR_BASELINES),
            guard=guard,
            dqp=dqp,
            sfi=sfi,
        )

    fault_reading = {
        **SENSOR_BASELINES,
        "Pre_Compressor_Pressure_kPa": 72.0,
    }

    result = predict_leak(
        fault_reading,
        guard=guard,
        dqp=dqp,
        sfi=sfi,
    )

    sfi_data = result.get("Sensor_Fault_Isolation")
    assert sfi_data is not None, "SFI metadata must be present"
    assert sfi_data["is_sensor_fault"] is True, (
        "Isolated 72 kPa must be flagged as fault"
    )
    assert sfi_data["faulty_sensor"] == "Pre_Compressor_Pressure_kPa"
    assert result["Confidence_Score"] == 0.0
    assert result["Recommended_Action"] == "Inspect_Sensor_Hardware"


def test_dqp_flags_drive_sfi_decision(sfi: SensorFaultIsolator) -> None:
    """DQP SPIKE on primary with clean correlated → sensor fault via DQP signal."""
    from data_quality_pipeline import SensorFlag

    flags = [
        SensorFlag(
            sensor="Pre_Compressor_Pressure_kPa",
            flag_type="SPIKE",
            original_value=72.0,
            cleaned_value=99.5,
            severity="CRITICAL",
            description="Isolated spike",
        )
    ]
    reading = copy.deepcopy(BASELINE)
    result = None
    for _ in range(3):
        result = sfi.check(
            "Intake_PreTurbo", reading, BASELINE, dqp_flags=flags
        )
    assert result is not None
    assert result.is_sensor_fault
    assert result.faulty_sensor == "Pre_Compressor_Pressure_kPa"
    assert "Persistent DQP" in result.fault_reason


def test_dqp_flags_plus_deviation_consistent(sfi: SensorFaultIsolator) -> None:
    """DQP flag on non-primary sensor; deviation logic confirms genuine leak."""
    from data_quality_pipeline import SensorFlag

    flags = [
        SensorFlag(
            sensor="Turbocharger_Speed_RPM",
            flag_type="SPIKE",
            original_value=87000.0,
            cleaned_value=87000.0,
            severity="WARNING",
            description="HF noise on correlated channel",
        )
    ]
    reading = copy.deepcopy(BASELINE)
    reading.update({
        "Pre_Compressor_Pressure_kPa": 91.0,
        "Post_Compressor_Pressure_kPa": 195.0,
        "Boost_Pressure_kPa": 93.7,
        "Turbocharger_Speed_RPM": 87000.0,
        "Intake_Manifold_Pressure_kPa": 188.0,
    })
    result = sfi.check(
        "Intake_PreTurbo", reading, BASELINE, dqp_flags=flags
    )
    assert not result.is_sensor_fault
    assert result.is_confirmed_leak


def _get_system_state(prediction: dict | None, dqp_score: float = 100) -> str:
    """Python mirror of dashboard getSystemState() priority order."""
    if prediction is None:
        return "NONE"
    if prediction.get("Suppressed"):
        return "TRANSITIONING"
    sfi = prediction.get("Sensor_Fault_Isolation") or {}
    if sfi.get("is_sensor_fault"):
        return "SENSOR_FAULT"
    if prediction.get("Leak_Present") == 1:
        return "LEAK_DETECTED"
    dq = prediction.get("Data_Quality") or {}
    if dq.get("flags") and dqp_score < 90:
        return "DATA_CLEANED"
    return "NORMAL"


def test_unified_system_state_logic() -> None:
    """SystemState priority: Suppressed > SensorFault > Leak > DataCleaned > Normal."""
    assert _get_system_state({"Suppressed": True, "Leak_Present": 1}) == "TRANSITIONING"

    assert (
        _get_system_state({
            "Leak_Present": 0,
            "Sensor_Fault_Isolation": {"is_sensor_fault": True},
        })
        == "SENSOR_FAULT"
    )

    assert (
        _get_system_state({
            "Leak_Present": 1,
            "Sensor_Fault_Isolation": {"is_sensor_fault": False},
        })
        == "LEAK_DETECTED"
    )

    assert (
        _get_system_state(
            {
                "Leak_Present": 0,
                "Data_Quality": {"flags": [{"type": "SPIKE"}]},
            },
            dqp_score=75,
        )
        == "DATA_CLEANED"
    )

    assert _get_system_state({"Leak_Present": 0}, dqp_score=100) == "NORMAL"


def test_single_spike_not_flagged_as_fault():
    """
    One DQP SPIKE flag must NOT trigger sensor fault.
    Single electrical spike = noise, not hardware fault.
    """
    from data_quality_pipeline import SensorFlag
    from baseline_contract import SENSOR_BASELINES

    sfi = SensorFaultIsolator()
    for _ in range(10):
        sfi.update(dict(SENSOR_BASELINES))

    single_flag = [SensorFlag(
        sensor="Pre_Compressor_Pressure_kPa",
        flag_type="SPIKE",
        original_value=72.0,
        cleaned_value=99.5,
        severity="CRITICAL",
        description="Spike detected",
    )]

    result = sfi.detect_isolated_fault(
        sensor_reading=dict(SENSOR_BASELINES),
        baseline=SENSOR_BASELINES,
        dqp_flags=single_flag,
    )

    assert result is None or not result.is_sensor_fault, (
        "Single spike must NOT be flagged as hardware fault"
    )


def test_persistent_spikes_flagged_as_fault():
    """
    3 DQP SPIKE flags on the same sensor in a window
    must confirm hardware fault.
    """
    from data_quality_pipeline import SensorFlag
    from baseline_contract import SENSOR_BASELINES

    sfi = SensorFaultIsolator()
    for _ in range(10):
        sfi.update(dict(SENSOR_BASELINES))

    spike_flag = [SensorFlag(
        sensor="Pre_Compressor_Pressure_kPa",
        flag_type="SPIKE",
        original_value=72.0,
        cleaned_value=99.5,
        severity="CRITICAL",
        description="Spike",
    )]

    result = None
    for _ in range(3):
        result = sfi.detect_isolated_fault(
            sensor_reading=dict(SENSOR_BASELINES),
            baseline=SENSOR_BASELINES,
            dqp_flags=spike_flag,
        )

    assert result is not None, (
        "3 persistent spikes must return SensorFaultResult"
    )
    assert result.is_sensor_fault, (
        "3 persistent spikes must be flagged as fault"
    )
    assert result.faulty_sensor == "Pre_Compressor_Pressure_kPa"


def test_fault_clears_after_sensor_recovers():
    """
    After sensor returns to normal, persistence count
    dilutes and fault eventually clears.
    """
    from baseline_contract import SENSOR_BASELINES

    sfi = SensorFaultIsolator()
    for _ in range(10):
        sfi.update(dict(SENSOR_BASELINES))

    for _ in range(3):
        sfi._record_dqp_flag("Pre_Compressor_Pressure_kPa")
    assert sfi._is_persistent_fault("Pre_Compressor_Pressure_kPa")

    for _ in range(8):
        sfi._record_clean_reading("Pre_Compressor_Pressure_kPa")

    assert not sfi._is_persistent_fault(
        "Pre_Compressor_Pressure_kPa"
    ), "Persistent fault must clear after sensor recovers"


def test_reset_clears_persistence_counts():
    """
    reset() must clear all persistence deques.
    """
    sfi = SensorFaultIsolator()
    for _ in range(3):
        sfi._record_dqp_flag("Pre_Compressor_Pressure_kPa")

    assert sfi._is_persistent_fault("Pre_Compressor_Pressure_kPa")

    sfi.reset()

    assert not sfi._is_persistent_fault(
        "Pre_Compressor_Pressure_kPa"
    ), "reset() must clear all persistence counts"
    assert len(sfi._recent_dqp_flags) == 0, (
        "reset() must clear _recent_dqp_flags dict"
    )


def test_persistence_report_shows_correct_counts():
    """
    get_fault_persistence_report() returns
    accurate counts per sensor.
    """
    sfi = SensorFaultIsolator()

    sfi._record_dqp_flag("Pre_Compressor_Pressure_kPa")
    sfi._record_dqp_flag("Pre_Compressor_Pressure_kPa")

    report = sfi.get_fault_persistence_report()

    assert "Pre_Compressor_Pressure_kPa" in report
    assert report["Pre_Compressor_Pressure_kPa"]["recent_flag_count"] == 2
    assert not report["Pre_Compressor_Pressure_kPa"]["is_persistent"]

    sfi._record_dqp_flag("Pre_Compressor_Pressure_kPa")
    report = sfi.get_fault_persistence_report()
    assert report["Pre_Compressor_Pressure_kPa"]["is_persistent"]
