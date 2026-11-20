"""
Sensor Fault Isolator — Production Implementation

Post-prediction validation layer that distinguishes
genuine leaks from faulty sensor hardware.

Logic:
  1. ML model predicts a leak location
  2. SFI retrieves the dependency map for that location
  3. SFI checks whether correlated sensors ALSO deviate
  4. If correlated sensors deviate → genuine leak
  5. If correlated sensors are normal → sensor fault

Integrated AFTER ML prediction, BEFORE final output.
"""

import logging
from collections import deque
from dataclasses import dataclass, field
from typing import Any, List, Optional

import numpy as np

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# SENSOR DEPENDENCY MAP
# ─────────────────────────────────────────────────────────────

SENSOR_DEPENDENCY_MAP = {

    "Intake_PreTurbo": {
        "primary": [
            "Pre_Compressor_Pressure_kPa",
        ],
        "primary_direction": "down",
        "correlated": [
            "Post_Compressor_Pressure_kPa",
            "Boost_Pressure_kPa",
            "Turbocharger_Speed_RPM",
            "Intake_Manifold_Pressure_kPa",
        ],
        "correlated_directions": {
            "Post_Compressor_Pressure_kPa": "down",
            "Boost_Pressure_kPa":           "down",
            "Turbocharger_Speed_RPM":       "down",
            "Intake_Manifold_Pressure_kPa": "down",
        },
        "min_correlated_deviating": 2,
        "deviation_threshold_pct":  2.0,
        "physical_explanation": (
            "Intake pre-turbo leak causes cascade: "
            "less air reaches compressor → lower boost "
            "→ lower manifold pressure → turbo slows."
        ),
    },

    "Intake_PostTurbo_CAC": {
        "primary": [
            "Post_CAC_Pressure_kPa",
        ],
        "primary_direction": "down",
        "correlated": [
            "Intake_Manifold_Pressure_kPa",
            "Boost_Pressure_kPa",
            "CAC_Pressure_Drop_kPa",
            "Post_CAC_Temp_C",
        ],
        "correlated_directions": {
            "Intake_Manifold_Pressure_kPa": "down",
            "Boost_Pressure_kPa":           "down",
            "CAC_Pressure_Drop_kPa":        "up",
            "Post_CAC_Temp_C":              "up",
        },
        "min_correlated_deviating": 2,
        "deviation_threshold_pct":  2.0,
        "physical_explanation": (
            "Post-turbo/CAC leak: post-compressor "
            "pressure stays normal but downstream "
            "pressure drops. CAC pressure drop spikes. "
            "Temperature rises (less cooling effect)."
        ),
    },

    "Exhaust_PreTurbine": {
        "primary": [
            "Exhaust_Manifold_Pressure_kPa",
        ],
        "primary_direction": "down",
        "correlated": [
            "Pre_Turbine_Pressure_kPa",
            "Turbine_Expansion_Ratio",
            "Exhaust_Manifold_Temp_C",
            "Post_Turbine_Pressure_kPa",
        ],
        "correlated_directions": {
            "Pre_Turbine_Pressure_kPa":     "down",
            "Turbine_Expansion_Ratio":      "down",
            "Exhaust_Manifold_Temp_C":      "up",
            "Post_Turbine_Pressure_kPa":    "down",
        },
        "min_correlated_deviating": 2,
        "deviation_threshold_pct":  2.0,
        "physical_explanation": (
            "Pre-turbine exhaust leak: gases escape "
            "before turbine → manifold pressure drops "
            "→ turbine gets less energy → expansion "
            "ratio drops. Temperature RISES at leak "
            "point (hotspot signature)."
        ),
    },

    "Exhaust_PostTurbine": {
        "primary": [
            "Post_Turbine_Pressure_kPa",
        ],
        "primary_direction": "down",
        "correlated": [
            "Post_DOC_Pressure_kPa",
            "Post_DPF_Pressure_kPa",
            "Post_SCR_Pressure_kPa",
            "Post_Turbine_Temp_C",
        ],
        "correlated_directions": {
            "Post_DOC_Pressure_kPa":  "down",
            "Post_DPF_Pressure_kPa":  "down",
            "Post_SCR_Pressure_kPa":  "down",
            "Post_Turbine_Temp_C":    "down",
        },
        "min_correlated_deviating": 2,
        "deviation_threshold_pct":  2.0,
        "physical_explanation": (
            "Post-turbine leak: pre-turbine sensors "
            "stay normal. Post-turbine pressure and "
            "temperature drop together as exhaust "
            "gas escapes before aftertreatment."
        ),
    },

    "EGR_Leak": {
        "primary": [
            "EGR_Flow_Rate_kgph",
        ],
        "primary_direction": "down",
        "correlated": [
            "Intake_Manifold_Temp_C",
            "Exhaust_Manifold_Pressure_kPa",
            "Intake_Mass_Balance_Error_kgph",
        ],
        "correlated_directions": {
            "Intake_Manifold_Temp_C":           "up",
            "Exhaust_Manifold_Pressure_kPa":    "down",
            "Intake_Mass_Balance_Error_kgph":   "up",
        },
        "min_correlated_deviating": 1,
        "deviation_threshold_pct":  2.0,
        "physical_explanation": (
            "EGR pipe leak: exhaust gas bypasses "
            "recirculation → EGR flow collapses. "
            "Intake manifold temp rises (less cold "
            "EGR gas mixing). Exhaust manifold "
            "pressure drops slightly."
        ),
    },

    "CAC_Direct_Leak": {
        "primary": [
            "CAC_Pressure_Drop_kPa",
        ],
        "primary_direction": "up",
        "correlated": [
            "Post_CAC_Pressure_kPa",
            "Post_CAC_Temp_C",
            "Intake_Manifold_Pressure_kPa",
            "Boost_Pressure_kPa",
        ],
        "correlated_directions": {
            "Post_CAC_Pressure_kPa":        "down",
            "Post_CAC_Temp_C":              "up",
            "Intake_Manifold_Pressure_kPa": "down",
            "Boost_Pressure_kPa":           "down",
        },
        "min_correlated_deviating": 2,
        "deviation_threshold_pct":  2.0,
        "physical_explanation": (
            "CAC body leak: compressed air escapes "
            "through cooler crack. Post-compressor "
            "pressure unchanged (leak is after it). "
            "CAC pressure drop spikes 5→26 kPa. "
            "Temp rises (less cooling). Downstream "
            "pressures drop."
        ),
    },

    "Minor_Intake_Leak": {
        "primary": [
            "Pre_Compressor_Pressure_kPa",
        ],
        "primary_direction": "down",
        "correlated": [
            "Post_Compressor_Pressure_kPa",
            "Post_CAC_Pressure_kPa",
            "Intake_Manifold_Pressure_kPa",
            "Boost_Pressure_kPa",
        ],
        "correlated_directions": {
            "Post_Compressor_Pressure_kPa": "down",
            "Post_CAC_Pressure_kPa":        "down",
            "Intake_Manifold_Pressure_kPa": "down",
            "Boost_Pressure_kPa":           "down",
        },
        "min_correlated_deviating": 2,
        "deviation_threshold_pct":  1.5,
        "physical_explanation": (
            "Minor intake leak: subtle distributed "
            "pressure drops 3-4% across all intake "
            "sensors. Lower deviation threshold used "
            "because signatures are intentionally weak "
            "(early-stage hairline crack)."
        ),
    },

    "None": {
        "primary":   [],
        "correlated": [],
        "min_correlated_deviating": 0,
        "deviation_threshold_pct":  0.0,
        "physical_explanation": "Normal operation.",
    },
}


@dataclass
class SensorFaultResult:
    """Result from one Sensor Fault Isolator check."""

    is_sensor_fault:      bool
    is_confirmed_leak:    bool
    faulty_sensor:        Optional[str]       = None
    fault_reason:         str                 = ""
    correlated_deviating: int                 = 0
    correlated_required:  int                 = 0
    deviation_details:    dict = field(default_factory=dict)
    confidence_modifier:  float               = 1.0
    fault_type:           str                 = "none"
    # How confident SFI is that this is hardware fault (not leak confidence).
    fault_confidence:     float               = 0.0


HEALTH_SENSOR_GROUPS = [
    [
        "Pre_Compressor_Pressure_kPa",
        "Post_Compressor_Pressure_kPa",
        "Post_CAC_Pressure_kPa",
        "Intake_Manifold_Pressure_kPa",
        "Boost_Pressure_kPa",
    ],
    [
        "Exhaust_Manifold_Pressure_kPa",
        "Pre_Turbine_Pressure_kPa",
        "Post_Turbine_Pressure_kPa",
        "Turbine_Expansion_Ratio",
    ],
    [
        "Post_Turbine_Pressure_kPa",
        "Post_DOC_Pressure_kPa",
        "Post_DPF_Pressure_kPa",
        "Post_SCR_Pressure_kPa",
    ],
    [
        "EGR_Flow_Rate_kgph",
        "Intake_Manifold_Temp_C",
        "Intake_Mass_Balance_Error_kgph",
    ],
]


class SensorFaultIsolator:
    """
    Post-prediction sensor fault isolation system.

    Validates whether an ML-predicted leak is physically
    consistent across correlated sensor groups, or
    whether it is caused by a single faulty sensor.
    """

    def __init__(
        self,
        deviation_threshold_override: Optional[float] = None,
    ):
        self.deviation_threshold_override = (
            deviation_threshold_override
        )
        self._reading_history: deque = deque(maxlen=20)
        self._session_baseline: dict = {}
        self._baseline_locked: bool = False
        self._sensor_divergence_count: dict = {}
        self._min_history_for_health: int = 5
        self._health_groups = HEALTH_SENSOR_GROUPS

        # ── Persistence tracking ─────────────────────────
        # Counts recent DQP flags per sensor.
        # Only flag SENSOR_FAULT when same sensor
        # flagged >= _fault_threshold times in
        # a rolling window of _fault_window readings.
        # Prevents single electrical spike triggering fault.
        self._recent_dqp_flags: dict = {}
        self._fault_window: int = 10
        self._fault_threshold: int = 3

        logger.info("SensorFaultIsolator initialised.")

    @staticmethod
    def _compute_fault_confidence(
        primary_dev_pct: float,
        correlated_deviating: int,
        correlated_required: int,
        fault_type: str = "ISOLATED_DEVIATION",
    ) -> float:
        """Score 0–1: strength of evidence that anomaly is isolated sensor fault."""
        required = max(correlated_required, 1)
        isolation = 1.0 - (correlated_deviating / required)
        magnitude = min(1.0, abs(primary_dev_pct) / 22.0)
        score = 0.70 + 0.20 * isolation + 0.10 * magnitude
        if fault_type == "DQP_PERSISTENT_FAULT":
            score = min(0.99, score + 0.10)
        elif fault_type == "HEALTH_DEGRADATION":
            score = min(0.97, score + 0.06)
        return round(min(0.99, max(0.72, score)), 4)

    def update(self, raw_reading: dict) -> None:
        """Track group divergence on raw pre-DQP readings."""
        self._reading_history.append(dict(raw_reading))

        if (
            not self._baseline_locked
            and len(self._reading_history) >= self._min_history_for_health
        ):
            self._lock_session_baseline()

        if not self._baseline_locked:
            return

        for group in self._health_groups:
            self._update_group_divergence(group, raw_reading)

    def _lock_session_baseline(self) -> None:
        """Lock session baseline from first stable readings (once only)."""
        if self._baseline_locked:
            return

        readings = list(self._reading_history)[: self._min_history_for_health]
        all_sensors = [s for group in self._health_groups for s in group]

        for sensor in all_sensors:
            vals = [
                float(r[sensor])
                for r in readings
                if sensor in r
                and r[sensor] is not None
                and not (
                    isinstance(r[sensor], float) and np.isnan(r[sensor])
                )
            ]
            if vals:
                self._session_baseline[sensor] = float(np.median(vals))

        self._baseline_locked = True
        logger.info(
            "SFI session baseline locked from "
            f"{self._min_history_for_health} readings."
        )

    def _update_group_divergence(
        self,
        group_sensors: list,
        reading: dict,
    ) -> None:
        """Increment divergence count when a sensor moves alone vs its group."""
        if not self._session_baseline:
            return

        deltas = {}
        for sensor in group_sensors:
            if sensor not in reading or sensor not in self._session_baseline:
                continue
            baseline = self._session_baseline[sensor]
            if baseline == 0:
                continue
            try:
                val = float(reading[sensor])
                deltas[sensor] = (val - baseline) / abs(baseline) * 100
            except (TypeError, ValueError):
                continue

        if len(deltas) < 2:
            return

        group_mean = float(np.mean(list(deltas.values())))

        for sensor, delta in deltas.items():
            divergence = abs(delta - group_mean)

            if sensor not in self._sensor_divergence_count:
                self._sensor_divergence_count[sensor] = 0

            if divergence > 5.0:
                self._sensor_divergence_count[sensor] += 1
            else:
                self._sensor_divergence_count[sensor] = max(
                    0,
                    self._sensor_divergence_count[sensor] - 1,
                )

    def get_health_report(self) -> dict:
        """Return sensors with active group divergence counts."""
        return {
            sensor: {
                "divergence_count": count,
                "is_suspect": count >= 3,
                "session_baseline": round(
                    self._session_baseline.get(sensor, 0),
                    2,
                ),
            }
            for sensor, count in self._sensor_divergence_count.items()
            if count > 0
        }

    def _record_dqp_flag(self, sensor: str) -> None:
        """
        Record one DQP flag occurrence for this sensor.
        Uses fixed-size deque — oldest entries drop off
        automatically after _fault_window readings.

        Call this when DQP flagged the sensor (append 1).
        """
        if sensor not in self._recent_dqp_flags:
            self._recent_dqp_flags[sensor] = deque(
                maxlen=self._fault_window
            )
        self._recent_dqp_flags[sensor].append(1)

    def _record_clean_reading(self, sensor: str) -> None:
        """
        Record one clean reading for this sensor.
        Dilutes old fault flags naturally over time.

        Call this when sensor had no DQP flag (append 0).
        """
        if sensor not in self._recent_dqp_flags:
            self._recent_dqp_flags[sensor] = deque(
                maxlen=self._fault_window
            )
        self._recent_dqp_flags[sensor].append(0)

    def _is_persistent_fault(self, sensor: str) -> bool:
        """
        Returns True only when sensor has been flagged
        by DQP >= _fault_threshold times in recent window.

        Single spike  (1/10) → False → electrical noise
        Persistent    (3/10) → True  → hardware fault

        Args:
            sensor: sensor name to check

        Returns:
            True if persistent fault confirmed
        """
        history = self._recent_dqp_flags.get(sensor)
        if not history:
            return False
        return sum(history) >= self._fault_threshold

    def get_fault_persistence_report(self) -> dict:
        """
        Returns current persistence counts per sensor.
        Used by GET /sensor-health endpoint.
        Only returns sensors with count > 0.
        """
        return {
            sensor: {
                "recent_flag_count": sum(history),
                "window_size": len(history),
                "threshold": self._fault_threshold,
                "is_persistent": (
                    sum(history) >= self._fault_threshold
                ),
            }
            for sensor, history in self._recent_dqp_flags.items()
            if sum(history) > 0
        }

    def reset(self) -> None:
        """Clear history, baseline, and divergence tracking."""
        self._reading_history.clear()
        self._session_baseline.clear()
        self._baseline_locked = False
        self._sensor_divergence_count.clear()
        self._recent_dqp_flags.clear()
        # Note: _fault_window and _fault_threshold
        # are config — do NOT reset those.
        logger.info("SensorFaultIsolator reset.")

    def _get_location_for_primary(self, sensor: str) -> Optional[str]:
        """Return leak location where sensor is the primary indicator."""
        for location, dep in SENSOR_DEPENDENCY_MAP.items():
            if sensor in dep.get("primary", []):
                return location
        return None

    def detect_isolated_fault(
        self,
        sensor_reading: dict,
        baseline: dict,
        isolation_threshold_pct: float = 2.0,
        dqp_flags: Optional[List[Any]] = None,
    ) -> Optional[SensorFaultResult]:
        """
        Detect a hardware fault when exactly one sensor deviates significantly.

        Used only when the ML model did not predict a leak — avoids misclassifying
        multi-sensor leak cascades as isolated faults.
        """
        # ── Path A: Group divergence health check ──────────────────────
        for sensor, count in self._sensor_divergence_count.items():
            if count < 5:
                continue

            location = self._get_location_for_primary(sensor)
            if not location:
                continue

            dep = SENSOR_DEPENDENCY_MAP.get(location, {})
            correlated = dep.get("correlated", [])

            correlated_diverging = [
                s
                for s in correlated
                if self._sensor_divergence_count.get(s, 0) >= 3
            ]

            if not correlated_diverging:
                required = dep.get("min_correlated_deviating", 2)
                return SensorFaultResult(
                    is_sensor_fault=True,
                    is_confirmed_leak=False,
                    faulty_sensor=sensor,
                    fault_reason=(
                        f"Sensor '{sensor}' diverging from "
                        f"its group for {count} consecutive "
                        f"readings. Session baseline: "
                        f"{self._session_baseline.get(sensor, 0):.2f}. "
                        f"Correlated sensors healthy. "
                        f"Likely hardware fault or "
                        f"sustained drift."
                    ),
                    fault_type="HEALTH_DEGRADATION",
                    correlated_deviating=0,
                    correlated_required=required,
                    confidence_modifier=0.0,
                    fault_confidence=self._compute_fault_confidence(
                        12.0, 0, required, "HEALTH_DEGRADATION"
                    ),
                )

        if dqp_flags:
            critical_flagged = [
                self._flag_sensor(f)
                for f in dqp_flags
                if self._flag_type(f) in ("BOUNDS_VIOLATION", "SPIKE")
                and self._flag_severity(f) in ("CRITICAL", "WARNING")
            ]

            for sensor in critical_flagged:
                # ── PERSISTENCE CHECK ─────────────────────
                self._record_dqp_flag(sensor)

                if not self._is_persistent_fault(sensor):
                    count = sum(
                        self._recent_dqp_flags.get(sensor, [])
                    )
                    logger.info(
                        "SFI: Transient DQP flag on "
                        "'%s' "
                        "(count=%d/"
                        "%d) — "
                        "treating as noise, not fault.",
                        sensor,
                        count,
                        self._fault_threshold,
                    )
                    continue

                location = self._get_location_for_primary(sensor)
                if not location:
                    continue

                dep = SENSOR_DEPENDENCY_MAP.get(location, {})
                correlated = dep.get("correlated", [])

                correlated_flagged = [
                    self._flag_sensor(f)
                    for f in dqp_flags
                    if self._flag_sensor(f) in correlated
                    and self._flag_severity(f) in ("CRITICAL", "WARNING")
                ]

                if not correlated_flagged:
                    count = sum(self._recent_dqp_flags[sensor])
                    required = dep.get("min_correlated_deviating", 2)
                    return SensorFaultResult(
                        is_sensor_fault=True,
                        is_confirmed_leak=False,
                        faulty_sensor=sensor,
                        fault_reason=(
                            f"Persistent DQP anomaly on "
                            f"'{sensor}': flagged "
                            f"{count}/{self._fault_window} "
                            f"recent readings. "
                            f"Correlated sensors clean. "
                            f"Hardware fault confirmed."
                        ),
                        fault_type="DQP_PERSISTENT_FAULT",
                        correlated_deviating=0,
                        correlated_required=required,
                        confidence_modifier=0.0,
                        fault_confidence=self._compute_fault_confidence(
                            20.0, 0, required, "DQP_PERSISTENT_FAULT"
                        ),
                    )

        deviation_details = self._compute_deviations(sensor_reading, baseline)

        primary_sensors: set = set()
        for dep in SENSOR_DEPENDENCY_MAP.values():
            primary_sensors.update(dep.get("primary", []))

        significant_primary = [
            sensor
            for sensor in primary_sensors
            if sensor in deviation_details
            and abs(deviation_details[sensor]["deviation_pct"])
            >= isolation_threshold_pct
        ]

        if len(significant_primary) != 1:
            return None

        faulty_sensor = significant_primary[0]
        for location, dep in SENSOR_DEPENDENCY_MAP.items():
            if location == "None":
                continue
            if faulty_sensor not in dep["primary"]:
                continue
            result = self.check(
                predicted_location=location,
                sensor_reading=sensor_reading,
                baseline=baseline,
                dqp_flags=dqp_flags,
            )
            if result.is_sensor_fault:
                return result
        return None

    def check(
        self,
        predicted_location: str,
        sensor_reading:     dict,
        baseline:           dict,
        dqp_flags:          Optional[List[Any]] = None,
    ) -> SensorFaultResult:
        """Check predicted leak against physical sensor consistency."""
        if predicted_location == "None":
            return SensorFaultResult(
                is_sensor_fault=False,
                is_confirmed_leak=False,
                fault_reason="Normal operation.",
                confidence_modifier=1.0,
            )

        if predicted_location not in SENSOR_DEPENDENCY_MAP:
            logger.warning(
                "SFI: Unknown location '%s' — skipping check.",
                predicted_location,
            )
            return SensorFaultResult(
                is_sensor_fault=False,
                is_confirmed_leak=True,
                fault_reason=(
                    "Unknown location — "
                    "no dependency map available."
                ),
                confidence_modifier=0.85,
            )

        dep = SENSOR_DEPENDENCY_MAP[predicted_location]
        threshold = (
            self.deviation_threshold_override
            or dep["deviation_threshold_pct"]
        )

        # ── DQP-DRIVEN FAULT DETECTION ───────────────────────────────
        if dqp_flags and predicted_location != "None":
            primary_sensors = dep.get("primary", [])
            correlated_sensors = dep.get("correlated", [])

            dqp_critical = [
                self._flag_sensor(f)
                for f in dqp_flags
                if self._flag_type(f) in ("BOUNDS_VIOLATION", "SPIKE")
                and self._flag_severity(f) in ("CRITICAL", "WARNING")
            ]

            primary_critical = [
                s for s in dqp_critical if s in primary_sensors
            ]
            correlated_critical = [
                s for s in dqp_critical if s in correlated_sensors
            ]

            if primary_critical and not correlated_critical:
                faulty = primary_critical[0]
                self._record_dqp_flag(faulty)

                if not self._is_persistent_fault(faulty):
                    count = sum(
                        self._recent_dqp_flags.get(faulty, [])
                    )
                    logger.info(
                        "SFI: Transient DQP flag on "
                        "'%s' "
                        "(count=%d/"
                        "%d) — "
                        "treating as noise, not fault.",
                        faulty,
                        count,
                        self._fault_threshold,
                    )
                else:
                    count = sum(self._recent_dqp_flags[faulty])
                    required = dep.get("min_correlated_deviating", 2)
                    return SensorFaultResult(
                        is_sensor_fault=True,
                        is_confirmed_leak=False,
                        faulty_sensor=faulty,
                        fault_reason=(
                            f"Persistent DQP anomaly on "
                            f"'{faulty}': flagged "
                            f"{count}/{self._fault_window} "
                            f"recent readings. "
                            f"No correlated sensors flagged. "
                            f"Hardware fault confirmed."
                        ),
                        correlated_deviating=0,
                        correlated_required=required,
                        confidence_modifier=0.0,
                        fault_type="DQP_PERSISTENT_FAULT",
                        fault_confidence=self._compute_fault_confidence(
                            20.0, 0, required, "DQP_PERSISTENT_FAULT"
                        ),
                    )

            if primary_critical and correlated_critical:
                return SensorFaultResult(
                    is_sensor_fault=True,
                    is_confirmed_leak=False,
                    faulty_sensor=primary_critical[0],
                    fault_reason=(
                        f"Multiple sensors flagged by DQP: "
                        f"{primary_critical + correlated_critical}. "
                        f"Cannot reliably determine leak vs "
                        f"multi-sensor fault. "
                        f"Recommend sensor inspection."
                    ),
                    correlated_deviating=len(correlated_critical),
                    correlated_required=dep.get(
                        "min_correlated_deviating", 2
                    ),
                    confidence_modifier=0.2,
                )

        deviation_details = self._compute_deviations(
            sensor_reading, baseline
        )

        primary_check = self._check_sensors(
            dep["primary"],
            dep["primary_direction"],
            deviation_details,
            threshold,
        )

        correlated_check = self._check_sensors(
            dep["correlated"],
            None,
            deviation_details,
            threshold,
            directions=dep.get("correlated_directions"),
        )

        n_correlated_deviating = correlated_check["deviating_count"]
        min_required = dep["min_correlated_deviating"]

        if not primary_check["any_deviating"]:
            return SensorFaultResult(
                is_sensor_fault=False,
                is_confirmed_leak=True,
                fault_reason=(
                    "Primary sensor not deviating "
                    "significantly, but model detected "
                    "pattern. Possible early-stage leak."
                ),
                correlated_deviating=n_correlated_deviating,
                correlated_required=min_required,
                deviation_details=deviation_details,
                confidence_modifier=0.75,
            )

        if n_correlated_deviating >= min_required:
            deviating_sensors = correlated_check["deviating_sensors"]
            explanation = (
                f"Confirmed leak pattern: "
                f"{len(dep['primary'])} primary + "
                f"{n_correlated_deviating} correlated "
                f"sensors deviating consistently. "
                f"Deviating: "
                f"{', '.join(deviating_sensors[:3])}. "
                f"{dep['physical_explanation']}"
            )
            return SensorFaultResult(
                is_sensor_fault=False,
                is_confirmed_leak=True,
                fault_reason=explanation,
                correlated_deviating=n_correlated_deviating,
                correlated_required=min_required,
                deviation_details=deviation_details,
                confidence_modifier=min(
                    1.0,
                    0.85 + 0.05 * n_correlated_deviating,
                ),
            )

        primary_sensor = dep["primary"][0]
        primary_dev = deviation_details.get(primary_sensor, {})

        non_deviating = [
            s for s in dep["correlated"]
            if not deviation_details.get(s, {}).get(
                "is_deviating", False
            )
        ]

        fault_reason = (
            f"Isolated sensor anomaly detected. "
            f"'{primary_sensor}' deviated "
            f"{primary_dev.get('deviation_pct', 0):.1f}% "
            f"but only {n_correlated_deviating}/"
            f"{min_required} required correlated "
            f"sensors confirm the pattern. "
            f"Normal sensors: "
            f"{', '.join(non_deviating[:3])}. "
            f"Likely hardware fault — not a leak."
        )

        logger.warning(
            "SENSOR FAULT: '%s' isolated deviation. "
            "Correlated: %d/%d.",
            primary_sensor,
            n_correlated_deviating,
            min_required,
        )

        primary_dev_pct = primary_dev.get("deviation_pct", 0.0)

        return SensorFaultResult(
            is_sensor_fault=True,
            is_confirmed_leak=False,
            faulty_sensor=primary_sensor,
            fault_reason=fault_reason,
            correlated_deviating=n_correlated_deviating,
            correlated_required=min_required,
            deviation_details=deviation_details,
            confidence_modifier=0.0,
            fault_type="ISOLATED_DEVIATION",
            fault_confidence=self._compute_fault_confidence(
                primary_dev_pct,
                n_correlated_deviating,
                min_required,
                "ISOLATED_DEVIATION",
            ),
        )

    @staticmethod
    def _flag_sensor(flag: Any) -> str:
        if hasattr(flag, "sensor"):
            return flag.sensor
        return flag.get("sensor", "")

    @staticmethod
    def _flag_type(flag: Any) -> str:
        if hasattr(flag, "flag_type"):
            return flag.flag_type
        return flag.get("type", flag.get("flag_type", ""))

    @staticmethod
    def _flag_severity(flag: Any) -> str:
        if hasattr(flag, "severity"):
            return flag.severity
        return flag.get("severity", "")

    def _compute_deviations(
        self,
        reading:  dict,
        baseline: dict,
    ) -> dict:
        """Compute percentage deviation of each sensor from baseline."""
        result = {}
        all_keys = set(reading.keys()) | set(baseline.keys())

        for sensor in all_keys:
            actual = reading.get(sensor)
            expected = baseline.get(sensor)

            if actual is None or expected is None:
                continue
            if expected == 0:
                continue

            try:
                actual = float(actual)
                expected = float(expected)
            except (TypeError, ValueError):
                continue

            dev_pct = ((actual - expected) / abs(expected)) * 100.0
            direction = (
                "up" if dev_pct > 1.0 else
                "down" if dev_pct < -1.0 else
                "flat"
            )

            result[sensor] = {
                "actual":        round(actual, 3),
                "baseline":      round(expected, 3),
                "deviation_pct": round(dev_pct, 2),
                "direction":     direction,
                "is_deviating":  abs(dev_pct) > 1.0,
            }

        return result

    def _check_sensors(
        self,
        sensors:    list,
        direction:  Optional[str],
        deviations: dict,
        threshold:  float,
        directions: Optional[dict] = None,
    ) -> dict:
        """Check a list of sensors for expected deviations."""
        deviating = []

        for sensor in sensors:
            if sensor not in deviations:
                continue

            d = deviations[sensor]
            dev_pct = d["deviation_pct"]
            direction_expected = (
                directions.get(sensor) if directions
                else direction
            )

            if abs(dev_pct) < threshold:
                continue

            if direction_expected == "down":
                if dev_pct >= 0:
                    continue
            elif direction_expected == "up":
                if dev_pct <= 0:
                    continue

            deviating.append(sensor)

        return {
            "any_deviating":     len(deviating) > 0,
            "deviating_count":   len(deviating),
            "deviating_sensors": deviating,
        }


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s | %(message)s",
    )

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

    sfi = SensorFaultIsolator()

    print("=" * 65)
    print("  SENSOR FAULT ISOLATOR — VERIFICATION TESTS")
    print("=" * 65)

    print("\n[TEST 1] Genuine Intake_PreTurbo leak...")
    genuine_leak = dict(BASELINE)
    genuine_leak.update({
        "Pre_Compressor_Pressure_kPa":   91.0,
        "Post_Compressor_Pressure_kPa": 195.0,
        "Boost_Pressure_kPa":            93.7,
        "Turbocharger_Speed_RPM":      87000.0,
        "Intake_Manifold_Pressure_kPa": 188.0,
    })
    result = sfi.check("Intake_PreTurbo", genuine_leak, BASELINE)
    assert not result.is_sensor_fault
    assert result.is_confirmed_leak
    assert result.confidence_modifier > 0.9
    print("  PASS — Genuine leak correctly confirmed")

    print("\n[TEST 2] Faulty Pre_Compressor_P sensor...")
    faulty_reading = dict(BASELINE)
    faulty_reading["Pre_Compressor_Pressure_kPa"] = 72.0
    result = sfi.check("Intake_PreTurbo", faulty_reading, BASELINE)
    assert result.is_sensor_fault
    assert not result.is_confirmed_leak
    assert result.confidence_modifier == 0.0
    assert result.faulty_sensor == "Pre_Compressor_Pressure_kPa"
    print("  PASS — Faulty sensor correctly isolated")

    print("\n[TEST 3] Genuine Exhaust_PreTurbine leak...")
    exhaust_leak = dict(BASELINE)
    exhaust_leak.update({
        "Exhaust_Manifold_Pressure_kPa": 198.0,
        "Pre_Turbine_Pressure_kPa":      190.0,
        "Turbine_Expansion_Ratio":         1.76,
        "Exhaust_Manifold_Temp_C":       720.0,
        "Post_Turbine_Pressure_kPa":     108.0,
    })
    result = sfi.check("Exhaust_PreTurbine", exhaust_leak, BASELINE)
    assert not result.is_sensor_fault
    assert result.is_confirmed_leak
    print("  PASS — Exhaust leak correctly confirmed")

    print("\n[TEST 4] Faulty Exhaust_Manifold_P sensor...")
    faulty_exhaust = dict(BASELINE)
    faulty_exhaust["Exhaust_Manifold_Pressure_kPa"] = 165.0
    result = sfi.check("Exhaust_PreTurbine", faulty_exhaust, BASELINE)
    assert result.is_sensor_fault
    assert result.faulty_sensor == "Exhaust_Manifold_Pressure_kPa"
    print("  PASS — Faulty exhaust sensor isolated")

    print("\n[TEST 5] Genuine EGR_Leak...")
    egr_leak = dict(BASELINE)
    egr_leak.update({
        "EGR_Flow_Rate_kgph":            38.0,
        "Intake_Manifold_Temp_C":        59.0,
        "Exhaust_Manifold_Pressure_kPa": 224.0,
        "Intake_Mass_Balance_Error_kgph": 15.5,
    })
    result = sfi.check("EGR_Leak", egr_leak, BASELINE)
    assert not result.is_sensor_fault
    assert result.is_confirmed_leak
    print("  PASS — EGR leak correctly confirmed")

    print("\n[TEST 6] Faulty EGR_Flow sensor...")
    faulty_egr = dict(BASELINE)
    faulty_egr["EGR_Flow_Rate_kgph"] = 5.0
    result = sfi.check("EGR_Leak", faulty_egr, BASELINE)
    assert result.is_sensor_fault
    print("  PASS — Faulty EGR sensor isolated")

    print("\n[TEST 7] Normal prediction (no check)...")
    result = sfi.check("None", BASELINE, BASELINE)
    assert not result.is_sensor_fault
    assert not result.is_confirmed_leak
    print("  PASS — Normal prediction skips check")

    print("\n[TEST 8] Genuine CAC_Direct_Leak...")
    cac_leak = dict(BASELINE)
    cac_leak.update({
        "CAC_Pressure_Drop_kPa":         26.0,
        "Post_CAC_Pressure_kPa":        192.0,
        "Post_CAC_Temp_C":               62.0,
        "Intake_Manifold_Pressure_kPa": 189.5,
        "Boost_Pressure_kPa":            90.7,
    })
    result = sfi.check("CAC_Direct_Leak", cac_leak, BASELINE)
    assert not result.is_sensor_fault
    assert result.is_confirmed_leak
    print("  PASS — CAC leak correctly confirmed")

    print("\n" + "=" * 65)
    print("  ALL 8 TESTS PASSED")
    print("=" * 65)
