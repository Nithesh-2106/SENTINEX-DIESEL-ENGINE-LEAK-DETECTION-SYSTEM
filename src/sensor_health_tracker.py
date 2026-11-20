"""
Session-persistent sensor health tracking — drift, faults, calibration.
Updates on each streaming reading; resets when the session restarts.
"""

from __future__ import annotations

import random
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

OPERATING_POINT_SENSORS = frozenset({
    "Engine_Speed_Setpoint_RPM",
    "Engine_Speed_Actual_RPM",
    "Engine_Load_Setpoint_Pct",
    "Engine_Load_Actual_Pct",
})

# These are COMMANDED parameters — they change
# intentionally when test cell changes operating point.
# Drift comparison against fixed baseline is meaningless.
# SFI and SSG handle anomalies in these values instead.

# ─────────────────────────────────────────────────
# ENGINE SENSOR CONFIGS
# Single source of truth — imported from
# baseline_contract.py.
# DO NOT hardcode values here.
# ─────────────────────────────────────────────────

try:
    from src.baseline_contract import (
        SENSOR_BASELINES as _C13,
        C7_SENSOR_BASELINES as _C7,
        C15_SENSOR_BASELINES as _C15,
    )
except ImportError:
    from baseline_contract import (
        SENSOR_BASELINES as _C13,
        C7_SENSOR_BASELINES as _C7,
        C15_SENSOR_BASELINES as _C15,
    )

ENGINE_SENSOR_CONFIGS: dict[str, dict] = {
    "CAT_C13": {k: v for k, v in _C13.items() if v is not None},
    "CAT_C7": {k: v for k, v in _C7.items() if v is not None},
    "CAT_C15": {k: v for k, v in _C15.items() if v is not None},
}


def classify_sensor(sensor_key: str) -> str:
    k = sensor_key.lower()
    if any(x in k for x in ["pressure", "_kpa", "_p_"]):
        return "pressure"
    if any(x in k for x in ["temp", "_c", "_t_"]):
        return "temperature"
    if any(x in k for x in ["flow", "maf", "egr_flow"]):
        return "flow"
    if "rpm" in k or "speed" in k:
        return "speed"
    return "other"


_CAL_SEED_MAP: dict[str, int] = {}


def get_calibration_age_days(sensor_key: str, engine_id: str) -> int:
    """Deterministic simulated days since last calibration."""
    cache_key = f"{engine_id}:{sensor_key}"
    if cache_key not in _CAL_SEED_MAP:
        rng = random.Random(hash(cache_key) % (2**31))
        sensor_type = classify_sensor(sensor_key)
        schedule = {
            "pressure": 7,
            "temperature": 14,
            "flow": 7,
            "speed": 30,
            "other": 14,
        }[sensor_type]
        if rng.random() > 0.85:
            _CAL_SEED_MAP[cache_key] = schedule + rng.randint(1, 5)
        else:
            _CAL_SEED_MAP[cache_key] = rng.randint(0, schedule - 1)
    return _CAL_SEED_MAP[cache_key]


DRIFT_THRESHOLDS = {
    "OK": 2.0,
    "WATCH": 5.0,
    "FAULT": 5.0,
}

LEAK_SIGNAL_STATUS = "LEAK_SIGNAL"
# Sensor deviating because of confirmed leak
# Not a hardware fault — do not penalise

STATUS_WEIGHTS = {
    "OK": 100,
    "WATCH": 70,
    "LEAK_SIGNAL": 90,
    "STALE": 50,
    "FAULT": 0,
    "EXCLUDED": None,
}

CALIBRATION_OVERDUE_MULTIPLIER = 1.5


def _resolved_baselines(engine_id: str) -> dict[str, float]:
    """Return engine baselines from baseline_contract via ENGINE_SENSOR_CONFIGS."""
    return dict(ENGINE_SENSOR_CONFIGS.get(engine_id, ENGINE_SENSOR_CONFIGS["CAT_C13"]))


@dataclass
class SensorHealthRecord:
    sensor_key: str
    engine_id: str
    baseline: float
    sensor_type: str

    current_value: Optional[float] = None
    current_drift_pct: float = 0.0
    peak_drift_pct: float = 0.0
    rolling_drift_pct: float = 0.0

    fault_count: int = 0
    last_fault_type: Optional[str] = None
    last_fault_time: Optional[float] = None

    calibration_age_days: int = 0
    calibration_schedule_days: int = 7

    status: str = "OK"

    drift_history: deque = field(default_factory=lambda: deque(maxlen=60))
    reading_count: int = 0
    is_excluded: bool = False

    def update(self, new_value: float, sfi_fault: Optional[str] = None) -> None:
        self.current_value = new_value
        self.reading_count += 1

        if self.baseline != 0:
            drift = ((new_value - self.baseline) / abs(self.baseline)) * 100.0
        else:
            drift = 0.0

        self.current_drift_pct = round(drift, 2)
        self.drift_history.append(drift)

        if abs(drift) > abs(self.peak_drift_pct):
            self.peak_drift_pct = round(drift, 2)

        recent = list(self.drift_history)[-20:]
        self.rolling_drift_pct = round(sum(recent) / len(recent), 2)

        if sfi_fault:
            self.fault_count += 1
            self.last_fault_type = sfi_fault
            self.last_fault_time = time.time()

    def _seconds_since_fault(self) -> Optional[float]:
        if self.last_fault_time is None:
            return None
        return time.time() - self.last_fault_time

    def to_dict(self) -> dict:
        seconds_since_fault = None
        if self.last_fault_time:
            seconds_since_fault = round(time.time() - self.last_fault_time)

        return {
            "sensor_key": self.sensor_key,
            "engine_id": self.engine_id,
            "baseline": self.baseline,
            "sensor_type": self.sensor_type,
            "current_value": self.current_value,
            "current_drift_pct": self.current_drift_pct,
            "peak_drift_pct": self.peak_drift_pct,
            "rolling_drift_pct": self.rolling_drift_pct,
            "fault_count": self.fault_count,
            "last_fault_type": self.last_fault_type,
            "seconds_since_fault": seconds_since_fault,
            "calibration_age_days": self.calibration_age_days,
            "calibration_schedule_days": self.calibration_schedule_days,
            "status": self.status,
            "drift_history": list(self.drift_history),
            "reading_count": self.reading_count,
            "is_excluded": self.is_excluded,
        }


class SensorHealthTracker:
    """Session-level sensor health tracker — one instance per engine type."""

    def __init__(self, engine_id: str):
        self.engine_id = engine_id
        self.records: dict[str, SensorHealthRecord] = {}
        self._initialize_records()

    def _initialize_records(self) -> None:
        baselines = _resolved_baselines(self.engine_id)
        cal_schedule: dict[str, int] = {
            "pressure": 7,
            "temperature": 14,
            "flow": 7,
            "speed": 30,
            "other": 14,
        }

        self.records.clear()
        for sensor_key, baseline in baselines.items():
            sensor_type = classify_sensor(sensor_key)
            cal_age = get_calibration_age_days(sensor_key, self.engine_id)
            cal_days = cal_schedule.get(sensor_type, 14)

            self.records[sensor_key] = SensorHealthRecord(
                sensor_key=sensor_key,
                engine_id=self.engine_id,
                baseline=baseline,
                sensor_type=sensor_type,
                calibration_age_days=cal_age,
                calibration_schedule_days=cal_days,
                is_excluded=False,
            )

    def _compute_status(
        self,
        sensor_key: str,
        record: SensorHealthRecord,
        confirmed_leak_active: bool = False,
        leak_location: Optional[str] = None,
    ) -> str:
        if sensor_key in OPERATING_POINT_SENSORS:
            overdue_threshold = (
                record.calibration_schedule_days * CALIBRATION_OVERDUE_MULTIPLIER
            )
            if record.calibration_age_days > overdue_threshold:
                return "STALE"
            return "OK"

        if record.is_excluded:
            return "EXCLUDED"

        overdue_threshold = (
            record.calibration_schedule_days * CALIBRATION_OVERDUE_MULTIPLIER
        )
        if record.calibration_age_days > overdue_threshold:
            return "STALE"

        if (
            confirmed_leak_active
            and abs(record.rolling_drift_pct) >= DRIFT_THRESHOLDS["FAULT"]
        ):
            return LEAK_SIGNAL_STATUS

        seconds_since_fault = record._seconds_since_fault()
        if seconds_since_fault is not None and seconds_since_fault < 300:
            return "FAULT"

        if abs(record.rolling_drift_pct) >= DRIFT_THRESHOLDS["FAULT"]:
            return "FAULT"

        if abs(record.rolling_drift_pct) >= DRIFT_THRESHOLDS["OK"]:
            return "WATCH"

        return "OK"

    def update(
        self,
        readings: dict,
        sfi_faults: Optional[dict] = None,
        prediction: Optional[dict] = None,
    ) -> None:
        sfi_faults = sfi_faults or {}

        leak_present = False
        leak_confirmed = False
        leak_location = None

        if prediction is not None:
            leak_present = prediction.get("Leak_Present", 0) == 1
            sfi_data = prediction.get("Sensor_Fault_Isolation", {}) or {}
            leak_confirmed = sfi_data.get("is_confirmed_leak", False)
            leak_location = prediction.get("Leak_Location")

        confirmed_leak_active = leak_present and leak_confirmed

        for sensor_key, record in self.records.items():
            if record.is_excluded:
                continue
            value = readings.get(sensor_key)
            if value is None:
                continue
            fault = sfi_faults.get(sensor_key)

            if sensor_key in OPERATING_POINT_SENSORS:
                record.current_value = float(value)
                record.reading_count += 1
                record.status = self._compute_status(
                    sensor_key,
                    record,
                    confirmed_leak_active=confirmed_leak_active,
                    leak_location=leak_location,
                )
                continue

            record.update(float(value), fault)
            record.status = self._compute_status(
                sensor_key,
                record,
                confirmed_leak_active=confirmed_leak_active,
                leak_location=leak_location,
            )

    def get_summary(self) -> dict:
        all_records = {
            k: v.to_dict()
            for k, v in self.records.items()
            if not v.is_excluded
        }

        status_counts = {
            "OK": 0,
            "WATCH": 0,
            "FAULT": 0,
            "STALE": 0,
            LEAK_SIGNAL_STATUS: 0,
        }
        for r in all_records.values():
            s = r["status"]
            if s in status_counts:
                status_counts[s] += 1

        total = len(all_records)
        if total == 0:
            health_score = 100
        else:
            weighted_sum = 0
            for r in all_records.values():
                weight = STATUS_WEIGHTS.get(r["status"])
                if weight is not None:
                    weighted_sum += weight
            health_score = round(weighted_sum / total)

        return {
            "engine_id": self.engine_id,
            "health_score": health_score,
            "status_counts": status_counts,
            "total_sensors": total,
            "sensors": all_records,
        }

    def reset(self) -> None:
        self._initialize_records()


_trackers: dict[str, SensorHealthTracker] = {}


def get_tracker(engine_id: str) -> SensorHealthTracker:
    if engine_id not in _trackers:
        _trackers[engine_id] = SensorHealthTracker(engine_id)
    return _trackers[engine_id]


def reset_tracker(engine_id: str) -> None:
    if engine_id in _trackers:
        _trackers[engine_id].reset()


def reset_all_trackers() -> None:
    for tracker in _trackers.values():
        tracker.reset()
