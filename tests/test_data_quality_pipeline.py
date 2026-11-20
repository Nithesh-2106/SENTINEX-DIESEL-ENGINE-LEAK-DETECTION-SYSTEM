"""Tests for src/data_quality_pipeline.py — all five DQP stages."""

from __future__ import annotations

import copy

import numpy as np
import pytest

from data_quality_pipeline import (
    NORMAL_READING,
    DataQualityPipeline,
)


@pytest.fixture
def warmed_dqp() -> DataQualityPipeline:
    """DQP with 15 normal readings in history."""
    dqp = DataQualityPipeline(window_size=20)
    for _ in range(15):
        r = copy.deepcopy(NORMAL_READING)
        for k in r:
            r[k] = r[k] * (1.0 + np.random.normal(0, 0.002))
        dqp.process(r)
    return dqp


def test_clean_reading_scores_high(warmed_dqp: DataQualityPipeline) -> None:
    """Clean reading with minimal noise scores > 85."""
    r = copy.deepcopy(NORMAL_READING)
    result = warmed_dqp.process(r)
    assert result.data_quality_score > 85


def test_spike_detected_and_corrected(warmed_dqp: DataQualityPipeline) -> None:
    """Impossible value (4.2 kPa pressure) is corrected."""
    r = copy.deepcopy(NORMAL_READING)
    r["Pre_Compressor_Pressure_kPa"] = 4.2
    result = warmed_dqp.process(r)
    spike_flags = [
        f
        for f in result.flags
        if f.flag_type in ("SPIKE", "BOUNDS_VIOLATION")
        and f.sensor == "Pre_Compressor_Pressure_kPa"
    ]
    assert spike_flags
    assert result.cleaned_reading["Pre_Compressor_Pressure_kPa"] > 50


def test_missing_value_imputed(warmed_dqp: DataQualityPipeline) -> None:
    """None value is replaced with history median."""
    r = copy.deepcopy(NORMAL_READING)
    r["EGR_Flow_Rate_kgph"] = None
    result = warmed_dqp.process(r)
    missing_flags = [f for f in result.flags if f.flag_type == "MISSING"]
    assert missing_flags
    assert result.cleaned_reading["EGR_Flow_Rate_kgph"] > 0


def test_bounds_violation_corrected(warmed_dqp: DataQualityPipeline) -> None:
    """Value outside physical bounds is replaced."""
    r = copy.deepcopy(NORMAL_READING)
    r["Boost_Pressure_kPa"] = 500.0
    result = warmed_dqp.process(r)
    bounds_flags = [f for f in result.flags if f.flag_type == "BOUNDS_VIOLATION"]
    assert bounds_flags
    assert result.cleaned_reading["Boost_Pressure_kPa"] <= 250.0


def test_drift_detected_not_corrected() -> None:
    """Monotonic drift is flagged but the latest value is not modified."""
    dqp = DataQualityPipeline(
        window_size=20, drift_window=8, drift_threshold_pct=2.0
    )
    for _ in range(10):
        dqp.process(copy.deepcopy(NORMAL_READING))

    drift_seen = False
    for step in range(10):
        r = copy.deepcopy(NORMAL_READING)
        r["Pre_Compressor_Pressure_kPa"] = 99.5 - step * 0.4
        result = dqp.process(r)
        drift_flags = [f for f in result.flags if f.flag_type == "DRIFT"]
        if drift_flags:
            drift_seen = True
            assert result.cleaned_reading["Pre_Compressor_Pressure_kPa"] == pytest.approx(
                99.5 - step * 0.4, rel=1e-3
            )
            break
    assert drift_seen


def test_cascade_pattern_preserved_not_spike_corrected(
    warmed_dqp: DataQualityPipeline,
) -> None:
    """Multi-sensor leak-like shifts are preserved, not reverted to rolling mean."""
    r = copy.deepcopy(NORMAL_READING)
    r.update({
        "Post_CAC_Pressure_kPa": 195.0,
        "Intake_Manifold_Pressure_kPa": 192.0,
        "Boost_Pressure_kPa": 93.7,
        "CAC_Pressure_Drop_kPa": 23.0,
    })
    result = warmed_dqp.process(r)
    cascade_flags = [f for f in result.flags if f.flag_type == "CASCADE_PATTERN"]
    assert len(cascade_flags) >= 2
    assert result.cleaned_reading["CAC_Pressure_Drop_kPa"] == pytest.approx(23.0)
    assert result.cleaned_reading["Boost_Pressure_kPa"] == pytest.approx(93.7)


def test_hf_noise_smoothed() -> None:
    """EMA reduces high-frequency oscillation when deviation exceeds 1%."""
    dqp = DataQualityPipeline()
    for _ in range(15):
        dqp.process(copy.deepcopy(NORMAL_READING))
    r = copy.deepcopy(NORMAL_READING)
    r["Post_CAC_Temp_C"] = NORMAL_READING["Post_CAC_Temp_C"] * 1.015
    result = dqp.process(r)
    hf_flags = [f for f in result.flags if f.flag_type == "HF_NOISE"]
    assert hf_flags
    assert result.cleaned_reading["Post_CAC_Temp_C"] != r["Post_CAC_Temp_C"]


def test_labels_never_modified(warmed_dqp: DataQualityPipeline) -> None:
    """DQP must never modify label/metadata columns."""
    r = copy.deepcopy(NORMAL_READING)
    r["Leak_Location"] = "EGR_Leak"
    r["Leak_Present"] = 1
    result = warmed_dqp.process(r)
    assert result.cleaned_reading["Leak_Location"] == "EGR_Leak"
    assert result.cleaned_reading["Leak_Present"] == 1


def test_quality_score_decreases_with_flags(warmed_dqp: DataQualityPipeline) -> None:
    """More flags produce a lower quality score."""
    r = copy.deepcopy(NORMAL_READING)
    r["Pre_Compressor_Pressure_kPa"] = 4.2
    r["EGR_Flow_Rate_kgph"] = None
    result = warmed_dqp.process(r)
    assert result.data_quality_score < 80


def test_is_usable_false_with_many_critical() -> None:
    """Five or more critical flags marks the reading unusable."""
    dqp = DataQualityPipeline(window_size=20, critical_flag_limit=5)
    for _ in range(5):
        dqp.process(copy.deepcopy(NORMAL_READING))

    r = copy.deepcopy(NORMAL_READING)
    for key in (
        "Pre_Compressor_Pressure_kPa",
        "Post_Compressor_Pressure_kPa",
        "Post_CAC_Pressure_kPa",
        "Intake_Manifold_Pressure_kPa",
        "Boost_Pressure_kPa",
        "Exhaust_Manifold_Pressure_kPa",
    ):
        r[key] = 4.2

    result = dqp.process(r)
    assert result.is_usable is False


def test_reset_clears_history() -> None:
    """reset() clears history and EMA state."""
    dqp = DataQualityPipeline(window_size=20)
    for _ in range(10):
        dqp.process(copy.deepcopy(NORMAL_READING))
    assert len(dqp.history) == 10
    dqp.reset()
    assert len(dqp.history) == 0
    assert not dqp._ema_state


def test_cascade_not_removed_by_dqp(warmed_dqp: DataQualityPipeline) -> None:
    """Three+ intake sensors dropping together must pass through DQP intact."""
    r = copy.deepcopy(NORMAL_READING)
    r.update({
        "Pre_Compressor_Pressure_kPa": 91.0,
        "Post_Compressor_Pressure_kPa": 195.0,
        "Boost_Pressure_kPa": 93.7,
        "Intake_Manifold_Pressure_kPa": 188.0,
    })
    result = warmed_dqp.process(r)
    assert result.cleaned_reading["Pre_Compressor_Pressure_kPa"] == pytest.approx(91.0)
    assert result.cleaned_reading["Post_Compressor_Pressure_kPa"] == pytest.approx(195.0)
    assert result.cleaned_reading["Boost_Pressure_kPa"] == pytest.approx(93.7)


def test_isolated_spike_removed_by_dqp(warmed_dqp: DataQualityPipeline) -> None:
    """Single-sensor spike is corrected — sensor fault case."""
    r = copy.deepcopy(NORMAL_READING)
    r["Pre_Compressor_Pressure_kPa"] = 72.0
    result = warmed_dqp.process(r)
    spike_flags = [f for f in result.flags if f.flag_type == "SPIKE"]
    assert spike_flags
    assert result.cleaned_reading["Pre_Compressor_Pressure_kPa"] > 90.0


def test_imputation_uses_median_not_mean() -> None:
    """Median imputation ignores a single spike in history."""
    dqp = DataQualityPipeline(window_size=20)
    for _ in range(4):
        dqp.process(copy.deepcopy(NORMAL_READING))
    spike = copy.deepcopy(NORMAL_READING)
    spike["Pre_Compressor_Pressure_kPa"] = 200.0
    dqp.process(spike)

    r = copy.deepcopy(NORMAL_READING)
    r["Pre_Compressor_Pressure_kPa"] = None
    result = dqp.process(r)
    imputed = result.cleaned_reading["Pre_Compressor_Pressure_kPa"]
    assert 95.0 < imputed < 105.0
