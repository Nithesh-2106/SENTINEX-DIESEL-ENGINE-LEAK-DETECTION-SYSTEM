"""
Data Quality Pipeline — Production Implementation
=================================================
Handles real-world sensor data quality problems before ML inference:
  1. Sensor spikes (electrical interference)
  2. Sensor drift (calibration degradation — flagged only)
  3. Missing values (disconnection / null readings)
  4. High-frequency noise (vibration / EMI)
"""

from __future__ import annotations

import logging
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# ── Cascade groups — multi-sensor deviations preserved for ML/SFI ────
CASCADE_SENSOR_GROUPS = [
    [
        "Pre_Compressor_Pressure_kPa",
        "Post_Compressor_Pressure_kPa",
        "Boost_Pressure_kPa",
        "Intake_Manifold_Pressure_kPa",
    ],
    [
        "Exhaust_Manifold_Pressure_kPa",
        "Pre_Turbine_Pressure_kPa",
        "Post_Turbine_Pressure_kPa",
        "Turbine_Expansion_Ratio",
    ],
    [
        "Post_CAC_Pressure_kPa",
        "CAC_Pressure_Drop_kPa",
        "Post_CAC_Temp_C",
        "Intake_Manifold_Pressure_kPa",
    ],
    [
        "EGR_Flow_Rate_kgph",
        "Intake_Manifold_Temp_C",
        "Intake_Mass_Balance_Error_kgph",
    ],
    [
        "Post_DOC_Pressure_kPa",
        "Post_DPF_Pressure_kPa",
        "Post_SCR_Pressure_kPa",
        "Post_Turbine_Pressure_kPa",
    ],
]

# ── Physical bounds for all instrumented channels ────────────────────

SENSOR_PHYSICAL_BOUNDS: Dict[str, Tuple[float, float]] = {
    "Intake_Ambient_Pressure_kPa": (85.0, 115.0),
    "Pre_Compressor_Pressure_kPa": (70.0, 115.0),
    "Post_Compressor_Pressure_kPa": (100.0, 350.0),
    "Post_CAC_Pressure_kPa": (95.0, 340.0),
    "Intake_Manifold_Pressure_kPa": (90.0, 335.0),
    "Boost_Pressure_kPa": (0.0, 250.0),
    "Exhaust_Manifold_Pressure_kPa": (100.0, 400.0),
    "Pre_Turbine_Pressure_kPa": (100.0, 380.0),
    "Post_Turbine_Pressure_kPa": (85.0, 200.0),
    "Post_DOC_Pressure_kPa": (85.0, 195.0),
    "Post_DPF_Pressure_kPa": (85.0, 190.0),
    "Post_SCR_Pressure_kPa": (85.0, 185.0),
    "Tailpipe_BackPressure_kPa": (85.0, 115.0),
    "Ambient_Pressure_kPa": (85.0, 115.0),
    "Pre_Compressor_Temp_C": (10.0, 80.0),
    "Post_Compressor_Temp_C": (80.0, 280.0),
    "Post_CAC_Temp_C": (20.0, 120.0),
    "Intake_Manifold_Temp_C": (20.0, 120.0),
    "Exhaust_Manifold_Temp_C": (400.0, 900.0),
    "Pre_Turbine_Temp_C": (400.0, 850.0),
    "Post_Turbine_Temp_C": (250.0, 650.0),
    "Post_DOC_Temp_C": (250.0, 650.0),
    "Post_DPF_Temp_C": (200.0, 600.0),
    "Post_SCR_Temp_C": (150.0, 550.0),
    "Engine_Coolant_Temp_C": (60.0, 110.0),
    "Ambient_Temp_C": (-10.0, 55.0),
    "MAF_Sensor_Reading_kgph": (200.0, 1500.0),
    "EGR_Flow_Rate_kgph": (0.0, 200.0),
    "Fuel_Flow_Rate_kgph": (5.0, 120.0),
    "Engine_Speed_Actual_RPM": (600.0, 2500.0),
    "Engine_Speed_Setpoint_RPM": (600.0, 2500.0),
    "Turbocharger_Speed_RPM": (30000.0, 150000.0),
    "Compressor_Pressure_Ratio": (1.0, 4.0),
    "Turbine_Expansion_Ratio": (1.0, 4.0),
    "CAC_Pressure_Drop_kPa": (0.0, 60.0),
    "DPF_Delta_Pressure_kPa": (0.0, 30.0),
    "Intake_Temp_Rise_Across_CAC_C": (-200.0, 0.0),
    "Intake_Mass_Balance_Error_kgph": (-50.0, 100.0),
    "Engine_Load_Actual_Pct": (0.0, 105.0),
    "Engine_Load_Setpoint_Pct": (0.0, 105.0),
    "Ambient_Humidity_Pct": (0.0, 100.0),
    "Engine_Oil_Pressure_bar": (1.0, 10.0),
}

DRIFT_CRITICAL_SENSORS: List[str] = [
    "Pre_Compressor_Pressure_kPa",
    "Post_Compressor_Pressure_kPa",
    "Post_CAC_Pressure_kPa",
    "Intake_Manifold_Pressure_kPa",
    "Exhaust_Manifold_Pressure_kPa",
    "Pre_Turbine_Pressure_kPa",
    "Post_Turbine_Pressure_kPa",
    "EGR_Flow_Rate_kgph",
    "Boost_Pressure_kPa",
    "Turbocharger_Speed_RPM",
    "MAF_Sensor_Reading_kgph",
    "Turbine_Expansion_Ratio",
    "Compressor_Pressure_Ratio",
]

# Reference normal reading for self-tests and warm-up
NORMAL_READING: Dict[str, float] = {
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


@dataclass
class SensorFlag:
    """Records a data quality event for one sensor."""

    sensor: str
    flag_type: str
    original_value: float
    cleaned_value: float
    severity: str
    description: str


@dataclass
class DQPResult:
    """Complete result from one Data Quality Pipeline pass."""

    cleaned_reading: Dict[str, float]
    original_reading: Dict[str, float]
    flags: List[SensorFlag] = field(default_factory=list)
    data_quality_score: float = 100.0
    is_usable: bool = True
    summary: str = "Clean"


class DataQualityPipeline:
    """
    Real-time data quality pipeline for diesel engine test cell readings.

    Five stages: bounds → imputation → spike removal → HF smoothing → drift flag.
    Stateful — instantiate once and reuse across readings.
    """

    def __init__(
        self,
        window_size: int = 20,
        spike_threshold_std: float = 4.0,
        drift_window: int = 10,
        drift_threshold_pct: float = 3.0,
        smoothing_alpha: float = 0.3,
        min_history: int = 3,
        critical_flag_limit: int = 5,
        min_spike_deviation_pct: float = 2.0,
    ) -> None:
        self.window_size = window_size
        self.spike_threshold_std = spike_threshold_std
        self.drift_window = drift_window
        self.drift_threshold_pct = drift_threshold_pct
        self.smoothing_alpha = smoothing_alpha
        self.min_history = min_history
        self.critical_flag_limit = critical_flag_limit
        self.min_spike_deviation_pct = min_spike_deviation_pct

        self.history: Deque[Dict[str, float]] = deque(maxlen=window_size)
        self._ema_state: Dict[str, float] = {}
        self._drift_buffer: Dict[str, Deque[float]] = {
            s: deque(maxlen=drift_window) for s in DRIFT_CRITICAL_SENSORS
        }

        self.total_readings_processed = 0
        self.total_flags_raised = 0

        logger.info(
            "DataQualityPipeline initialised | window=%s | spike_std=%s | drift_pct=%s%%",
            window_size,
            spike_threshold_std,
            drift_threshold_pct,
        )

    def process(self, reading: Dict[str, float]) -> DQPResult:
        """Run all cleaning stages on one sensor reading."""
        self.total_readings_processed += 1
        original = dict(reading)
        cleaned = dict(reading)
        flags: List[SensorFlag] = []

        cleaned, flags = self._check_bounds(cleaned, flags)
        cleaned, flags = self._impute_missing(cleaned, flags)
        pre_spike = dict(cleaned)
        cleaned, flags = self._remove_spikes(cleaned, flags)
        cleaned, flags = self._smooth_hf_noise(cleaned, flags)
        flags = self._detect_drift(cleaned, flags)

        self.history.append(dict(cleaned))

        # Drift tracked on pre-spike signal so gradual trends are not erased
        for sensor in DRIFT_CRITICAL_SENSORS:
            if sensor in pre_spike:
                self._drift_buffer[sensor].append(float(pre_spike[sensor]))

        score = self._compute_quality_score(flags)
        is_usable = self._is_usable(flags)
        summary = self._build_summary(flags, score)
        self.total_flags_raised += len(flags)

        return DQPResult(
            cleaned_reading=cleaned,
            original_reading=original,
            flags=flags,
            data_quality_score=score,
            is_usable=is_usable,
            summary=summary,
        )

    def reset(self) -> None:
        """Clear history and internal state (call on scenario / engine change)."""
        self.history.clear()
        self._ema_state.clear()
        for buf in self._drift_buffer.values():
            buf.clear()
        logger.info("DataQualityPipeline reset.")

    def get_stats(self) -> Dict[str, float]:
        """Return pipeline statistics for monitoring dashboards."""
        return {
            "total_readings_processed": self.total_readings_processed,
            "total_flags_raised": self.total_flags_raised,
            "history_length": len(self.history),
            "flag_rate_pct": round(
                (self.total_flags_raised / max(1, self.total_readings_processed)) * 100,
                2,
            ),
        }

    def _check_bounds(
        self,
        reading: Dict[str, float],
        flags: List[SensorFlag],
    ) -> Tuple[Dict[str, float], List[SensorFlag]]:
        for sensor, (lo, hi) in SENSOR_PHYSICAL_BOUNDS.items():
            if sensor not in reading:
                continue
            val = reading[sensor]
            if val is None or (isinstance(val, float) and np.isnan(val)):
                continue
            val_f = float(val)
            if val_f < lo or val_f > hi:
                imputed = self._impute_from_history(sensor, val_f)
                flags.append(
                    SensorFlag(
                        sensor=sensor,
                        flag_type="BOUNDS_VIOLATION",
                        original_value=val_f,
                        cleaned_value=imputed,
                        severity="CRITICAL",
                        description=(
                            f"Value {val_f:.2f} outside physical bounds "
                            f"[{lo}, {hi}]. Replaced with {imputed:.2f}."
                        ),
                    )
                )
                reading[sensor] = imputed
                logger.warning(
                    "BOUNDS VIOLATION: %s = %.2f -> %.2f",
                    sensor,
                    val_f,
                    imputed,
                )
        return reading, flags

    def _impute_missing(
        self,
        reading: Dict[str, float],
        flags: List[SensorFlag],
    ) -> Tuple[Dict[str, float], List[SensorFlag]]:
        for sensor in list(reading.keys()):
            val = reading[sensor]
            is_missing = val is None or (
                isinstance(val, float) and np.isnan(val)
            )
            is_zero_invalid = (
                val == 0.0
                and sensor in SENSOR_PHYSICAL_BOUNDS
                and SENSOR_PHYSICAL_BOUNDS[sensor][0] > 0
            )
            if is_missing or is_zero_invalid:
                imputed = self._impute_from_history(sensor, None)
                flags.append(
                    SensorFlag(
                        sensor=sensor,
                        flag_type="MISSING",
                        original_value=float("nan"),
                        cleaned_value=imputed,
                        severity="WARNING",
                        description=(
                            f"Missing/null value detected. "
                            f"Imputed from recent history: {imputed:.3f}."
                        ),
                    )
                )
                reading[sensor] = imputed
        return reading, flags

    def _get_reference_baseline(self) -> Dict[str, float]:
        """Static reference baseline for cascade detection."""
        from baseline_contract import SENSOR_BASELINES

        return SENSOR_BASELINES

    def _is_cascade_deviation(
        self,
        sensor: str,
        reading: dict,
        baseline: dict,
    ) -> bool:
        """
        True when this sensor's deviation is part of a multi-sensor
        cascade — must not be removed by spike/HF cleaning.
        """
        for group in CASCADE_SENSOR_GROUPS:
            if sensor not in group:
                continue
            deviating_count = 0
            for s in group:
                if s == sensor or s not in reading:
                    continue
                actual = float(reading.get(s, 0))
                expected = float(baseline.get(s, actual))
                if expected == 0:
                    continue
                dev_pct = abs((actual - expected) / expected * 100)
                if dev_pct > 3.0:
                    deviating_count += 1
            if deviating_count >= 2:
                return True
        return False

    def _remove_spikes(
        self,
        reading: Dict[str, float],
        flags: List[SensorFlag],
    ) -> Tuple[Dict[str, float], List[SensorFlag]]:
        if len(self.history) < self.min_history:
            return reading, flags

        candidates: List[Dict[str, float]] = []

        for sensor in SENSOR_PHYSICAL_BOUNDS:
            if sensor not in reading:
                continue
            val = float(reading[sensor])
            history_vals = [
                float(h[sensor])
                for h in self.history
                if sensor in h
                and h[sensor] is not None
                and not np.isnan(float(h[sensor]))
            ]
            if len(history_vals) < self.min_history:
                continue

            rolling_mean = float(np.mean(history_vals))
            rolling_std = float(np.std(history_vals))
            if rolling_std < 1e-6:
                rolling_std = max(abs(rolling_mean) * 0.02, 1e-4)

            z_score = abs(val - rolling_mean) / rolling_std
            relative_dev_pct = (
                abs(val - rolling_mean) / max(abs(rolling_mean), 1e-6)
            ) * 100.0
            if (
                z_score > self.spike_threshold_std
                and relative_dev_pct >= self.min_spike_deviation_pct
            ):
                candidates.append(
                    {
                        "sensor": sensor,
                        "val": val,
                        "rolling_mean": rolling_mean,
                        "z_score": z_score,
                    }
                )

        # Multiple simultaneous deviations = physical cascade (genuine leak),
        # not isolated sensor noise. Preserve values for downstream ML/SFI.
        coordinated = len(candidates) >= 2

        for cand in candidates:
            sensor = cand["sensor"]
            val = cand["val"]
            rolling_mean = cand["rolling_mean"]
            z_score = cand["z_score"]

            ref_baseline = self._get_reference_baseline()
            if coordinated or self._is_cascade_deviation(
                sensor, reading, ref_baseline
            ):
                flags.append(
                    SensorFlag(
                        sensor=sensor,
                        flag_type="CASCADE_PATTERN",
                        original_value=val,
                        cleaned_value=val,
                        severity="WARNING",
                        description=(
                            f"Coordinated deviation: z-score={z_score:.1f}. "
                            f"Value {val:.3f} preserved — likely leak cascade "
                            f"({len(candidates)} sensors shifting together)."
                        ),
                    )
                )
                logger.info(
                    "CASCADE: %s = %.3f preserved (z=%.1f, %d sensors)",
                    sensor,
                    val,
                    z_score,
                    len(candidates),
                )
                continue

            severity = (
                "CRITICAL"
                if z_score > self.spike_threshold_std * 2
                else "WARNING"
            )
            flags.append(
                SensorFlag(
                    sensor=sensor,
                    flag_type="SPIKE",
                    original_value=val,
                    cleaned_value=rolling_mean,
                    severity=severity,
                    description=(
                        f"Spike detected: z-score={z_score:.1f} "
                        f"(threshold={self.spike_threshold_std}). "
                        f"Value {val:.3f} -> rolling mean {rolling_mean:.3f}."
                    ),
                )
            )
            reading[sensor] = rolling_mean
            logger.warning(
                "SPIKE: %s = %.3f (z=%.1f) -> %.3f",
                sensor,
                val,
                z_score,
                rolling_mean,
            )
        return reading, flags

    def _smooth_hf_noise(
        self,
        reading: Dict[str, float],
        flags: List[SensorFlag],
    ) -> Tuple[Dict[str, float], List[SensorFlag]]:
        if len(self.history) < self.min_history:
            return reading, flags

        cascade_sensors = {
            f.sensor for f in flags if f.flag_type == "CASCADE_PATTERN"
        }

        ref_baseline = self._get_reference_baseline()

        for sensor in SENSOR_PHYSICAL_BOUNDS:
            if sensor in cascade_sensors:
                continue
            if sensor not in reading:
                continue
            if self._is_cascade_deviation(sensor, reading, ref_baseline):
                continue
            val = float(reading[sensor])
            if sensor not in self._ema_state:
                self._ema_state[sensor] = val
                continue

            ema_prev = self._ema_state[sensor]
            ema_new = (
                self.smoothing_alpha * val
                + (1.0 - self.smoothing_alpha) * ema_prev
            )
            deviation_pct = abs(val - ema_new) / max(abs(ema_new), 1e-6) * 100.0

            if deviation_pct > 1.0:
                flags.append(
                    SensorFlag(
                        sensor=sensor,
                        flag_type="HF_NOISE",
                        original_value=val,
                        cleaned_value=ema_new,
                        severity="INFO",
                        description=(
                            f"HF noise smoothed: {val:.3f} -> {ema_new:.3f} "
                            f"(EMA alpha={self.smoothing_alpha}, "
                            f"dev={deviation_pct:.1f}%)"
                        ),
                    )
                )
                reading[sensor] = ema_new

            self._ema_state[sensor] = ema_new

        return reading, flags

    def _detect_drift(
        self,
        reading: Dict[str, float],
        flags: List[SensorFlag],
    ) -> List[SensorFlag]:
        del reading  # drift flags only — values are not modified
        for sensor in DRIFT_CRITICAL_SENSORS:
            buf = self._drift_buffer[sensor]
            if len(buf) < self.drift_window:
                continue

            values = list(buf)
            diffs = [values[i + 1] - values[i] for i in range(len(values) - 1)]
            is_monotone_up = all(d >= 0 for d in diffs)
            is_monotone_down = all(d <= 0 for d in diffs)
            if not (is_monotone_up or is_monotone_down):
                continue

            total_change_pct = abs(
                (values[-1] - values[0]) / max(abs(values[0]), 1e-6)
            ) * 100.0
            if total_change_pct < self.drift_threshold_pct:
                continue

            direction = "upward" if is_monotone_up else "downward"
            flags.append(
                SensorFlag(
                    sensor=sensor,
                    flag_type="DRIFT",
                    original_value=values[0],
                    cleaned_value=values[-1],
                    severity="WARNING",
                    description=(
                        f"Sensor drift detected: {direction} trend over "
                        f"{self.drift_window} readings. Total change: "
                        f"{total_change_pct:.1f}%. Recommend sensor inspection."
                    ),
                )
            )
            logger.warning(
                "DRIFT: %s — %s %.1f%% over %s readings",
                sensor,
                direction,
                total_change_pct,
                self.drift_window,
            )
        return flags

    def _impute_from_history(
        self,
        sensor: str,
        current_val: Optional[float],
    ) -> float:
        history_vals = [
            float(h[sensor])
            for h in self.history
            if sensor in h
            and h[sensor] is not None
            and not np.isnan(float(h[sensor]))
            and float(h[sensor]) != 0.0
        ]
        recent = history_vals[-5:] if history_vals else []
        if recent:
            return float(np.median(recent))
        if sensor in SENSOR_PHYSICAL_BOUNDS:
            lo, hi = SENSOR_PHYSICAL_BOUNDS[sensor]
            return (lo + hi) / 2.0
        return float(current_val) if current_val is not None else 0.0

    def _compute_quality_score(self, flags: List[SensorFlag]) -> float:
        score = 100.0
        for flag in flags:
            if flag.flag_type == "BOUNDS_VIOLATION":
                score -= 20.0
            elif flag.flag_type == "MISSING":
                score -= 10.0
            elif flag.flag_type == "SPIKE":
                score -= 25.0 if flag.severity == "CRITICAL" else 15.0
            elif flag.flag_type == "DRIFT":
                score -= 5.0
            elif flag.flag_type == "HF_NOISE":
                score -= 2.0
        return max(0.0, round(score, 1))

    def _is_usable(self, flags: List[SensorFlag]) -> bool:
        critical_count = sum(1 for f in flags if f.severity == "CRITICAL")
        return critical_count < self.critical_flag_limit

    def _build_summary(self, flags: List[SensorFlag], score: float) -> str:
        if not flags:
            return f"Clean (score: {score:.0f}/100)"
        type_counts: Dict[str, int] = {}
        for f in flags:
            type_counts[f.flag_type] = type_counts.get(f.flag_type, 0) + 1
        parts = [f"{v}x {k}" for k, v in type_counts.items()]
        return f"Flagged: {', '.join(parts)} (score: {score:.0f}/100)"


if __name__ == "__main__":
    import copy

    logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
    np.random.seed(42)

    dqp = DataQualityPipeline(window_size=20)

    print("=" * 65)
    print("  DATA QUALITY PIPELINE — VERIFICATION TESTS")
    print("=" * 65)

    print("\n[TEST 1] Clean readings (building history)...")
    result = None
    for _ in range(15):
        r = copy.deepcopy(NORMAL_READING)
        for k in list(r.keys()):
            r[k] = r[k] * (1.0 + np.random.normal(0, 0.003))
        result = dqp.process(r)

    print(f"  History built: {len(dqp.history)} readings")
    print(f"  Score: {result.data_quality_score}/100")
    print(f"  Flags: {len(result.flags)}")
    assert result.data_quality_score > 85
    print("  PASS — Clean readings score high")

    print("\n[TEST 2] Spike detection...")
    spiked = copy.deepcopy(NORMAL_READING)
    spiked["Pre_Compressor_Pressure_kPa"] = 4.2
    result = dqp.process(spiked)
    spike_flags = [
        f
        for f in result.flags
        if f.flag_type in ("SPIKE", "BOUNDS_VIOLATION")
        and f.sensor == "Pre_Compressor_Pressure_kPa"
    ]
    assert spike_flags
    assert result.cleaned_reading["Pre_Compressor_Pressure_kPa"] > 50
    print(f"  Spike detected: {spike_flags[0].description}")
    print("  PASS — Spike detected and corrected")

    print("\n[TEST 3] Missing value imputation...")
    missing = copy.deepcopy(NORMAL_READING)
    missing["EGR_Flow_Rate_kgph"] = None
    result = dqp.process(missing)
    missing_flags = [f for f in result.flags if f.flag_type == "MISSING"]
    assert missing_flags
    assert result.cleaned_reading["EGR_Flow_Rate_kgph"] > 0
    print("  PASS — Missing value imputed")

    print("\n[TEST 4] Drift detection...")
    dqp_drift = DataQualityPipeline(
        window_size=20, drift_window=8, drift_threshold_pct=2.0
    )
    for _ in range(10):
        dqp_drift.process(copy.deepcopy(NORMAL_READING))

    drift_detected = False
    for step in range(10):
        r = copy.deepcopy(NORMAL_READING)
        r["Pre_Compressor_Pressure_kPa"] = 99.5 - step * 0.4
        result = dqp_drift.process(r)
        if any(f.flag_type == "DRIFT" for f in result.flags):
            drift_detected = True
            break
    assert drift_detected
    print("  PASS — Drift detected correctly")

    print("\n[TEST 5] Quality score validation...")
    multi_flag = copy.deepcopy(NORMAL_READING)
    multi_flag["Pre_Compressor_Pressure_kPa"] = 4.2
    multi_flag["EGR_Flow_Rate_kgph"] = None
    multi_flag["Post_CAC_Pressure_kPa"] = None
    result = dqp.process(multi_flag)
    assert result.data_quality_score < 80
    print(f"  Multiple flags score: {result.data_quality_score}/100")
    print("  PASS — Score correctly penalised")

    print("\n" + "=" * 65)
    print("  ALL TESTS PASSED")
    print("=" * 65)
