"""
steady_state_guard.py — Steady-state detection guard for leak suppression
=========================================================================
Filters out leak detections during RPM/load/ambient transitions. The goal
is to avoid flagging normal ramps as leaks, per Caterpillar mentor feedback.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Tuple

import numpy as np

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class _Point:
    ts: float
    rpm: float
    load: float
    ambient_p: float
    rpm_sp: float
    load_sp: float


class SteadyStateGuard:
    """Rolling-window steady-state evaluator with step-change detection."""

    def __init__(
        self,
        window_size: int = 10,
        rpm_tolerance_pct: float = 2.0,
        load_tolerance_pct: float = 2.0,
        pressure_tolerance_pct: float = 1.5,
        min_steady_readings: int = 5,
        tracking_tolerance_pct: float = 1.0,
        setpoint_tolerance_pct: float = 1.5,
    ) -> None:
        self.window_size = int(window_size)
        self.rpm_tolerance_pct = float(rpm_tolerance_pct)
        self.load_tolerance_pct = float(load_tolerance_pct)
        self.pressure_tolerance_pct = float(pressure_tolerance_pct)
        self.min_steady_readings = int(min_steady_readings)
        self.tracking_tolerance_pct = float(tracking_tolerance_pct)
        self.setpoint_tolerance_pct = float(setpoint_tolerance_pct)

        self.history: List[_Point] = []
        self._steady_duration_readings: int = 0
        self._last_reason: str = "Insufficient history"
        self._step_change_min_fraction_of_mean: float = 0.01

    def add_reading(self, reading: Dict[str, float]) -> None:
        """Add new sensor reading to history window (keep only last window_size)."""
        ts = datetime.now(timezone.utc).timestamp()

        rpm = float(reading.get("Engine_Speed_Actual_RPM", np.nan))
        load = float(reading.get("Engine_Load_Actual_Pct", np.nan))
        amb_p = float(reading.get("Ambient_Pressure_kPa", np.nan))
        rpm_sp = float(
            reading.get("Engine_Speed_Setpoint_RPM", rpm)
        )
        load_sp = float(
            reading.get("Engine_Load_Setpoint_Pct", load)
        )

        self.history.append(
            _Point(
                ts=ts,
                rpm=rpm,
                load=load,
                ambient_p=amb_p,
                rpm_sp=rpm_sp,
                load_sp=load_sp,
            )
        )
        if len(self.history) > self.window_size:
            self.history = self.history[-self.window_size :]

    @staticmethod
    def _cv_pct(x: np.ndarray) -> float:
        """Coefficient of variation (std/mean)*100."""
        x = x.astype(float)
        x = x[np.isfinite(x)]
        if x.size == 0:
            return float("inf")
        mean = float(np.mean(x))
        if mean == 0:
            return float("inf")
        std = float(np.std(x, ddof=0))
        return (std / abs(mean)) * 100.0

    @staticmethod
    def _tracking_error_pct(setpoint: float, actual: float) -> float:
        """Percent gap between commanded setpoint and measured actual."""
        if not np.isfinite(setpoint) or not np.isfinite(actual):
            return float("inf")
        if actual == 0:
            return float("inf")
        return abs(setpoint - actual) / abs(actual) * 100.0

    @staticmethod
    def _rolling_std(x: np.ndarray) -> float:
        x = x.astype(float)
        x = x[np.isfinite(x)]
        if x.size < 2:
            return 0.0
        return float(np.std(x, ddof=0))

    def _detect_step_change(self, series: np.ndarray) -> bool:
        """Step change if consecutive delta exceeds 3×rolling std."""
        s = series.astype(float)
        s = s[np.isfinite(s)]
        if s.size < 3:
            return False
        rolling_std = self._rolling_std(s[:-1])
        delta = abs(float(s[-1] - s[-2]))
        if rolling_std == 0.0:
            # If history is perfectly flat, std=0. In that case, treat a step
            # as any jump larger than a small fraction of the mean to avoid
            # suppressing on tiny float noise.
            mean = float(np.mean(s[:-1])) if np.isfinite(np.mean(s[:-1])) else 0.0
            return delta > (abs(mean) * self._step_change_min_fraction_of_mean)
        return delta > (3.0 * rolling_std)

    def is_steady_state(self) -> Tuple[bool, str]:
        """Evaluate steady state. Returns (is_steady, reason)."""
        n = len(self.history)
        if n < self.min_steady_readings:
            self._steady_duration_readings = 0
            self._last_reason = f"Insufficient history: {n} readings (need {self.min_steady_readings})"
            return False, self._last_reason

        rpms = np.array([p.rpm for p in self.history], dtype=float)
        loads = np.array([p.load for p in self.history], dtype=float)
        rpm_sps = np.array([p.rpm_sp for p in self.history], dtype=float)
        load_sps = np.array([p.load_sp for p in self.history], dtype=float)
        ambps = np.array([p.ambient_p for p in self.history], dtype=float)

        latest = self.history[-1]
        rpm_track_pct = self._tracking_error_pct(latest.rpm_sp, latest.rpm)
        load_track_pct = self._tracking_error_pct(latest.load_sp, latest.load)

        if rpm_track_pct >= self.tracking_tolerance_pct:
            self._steady_duration_readings = 0
            self._last_reason = (
                f"RPM setpoint ramping: tracking error "
                f"{rpm_track_pct:.2f}% "
                f"(SP={latest.rpm_sp:.0f}, ACT={latest.rpm:.0f})"
            )
            return False, self._last_reason

        if load_track_pct >= self.tracking_tolerance_pct:
            self._steady_duration_readings = 0
            self._last_reason = (
                f"Load setpoint ramping: tracking error "
                f"{load_track_pct:.2f}% "
                f"(SP={latest.load_sp:.0f}%, ACT={latest.load:.0f}%)"
            )
            return False, self._last_reason

        rpm_sp_cv = self._cv_pct(rpm_sps)
        load_sp_cv = self._cv_pct(load_sps)

        if self._detect_step_change(rpm_sps):
            self._steady_duration_readings = 0
            self._last_reason = f"Setpoint step change detected in RPM at reading {n}"
            return False, self._last_reason
        if self._detect_step_change(load_sps):
            self._steady_duration_readings = 0
            self._last_reason = f"Setpoint step change detected in Load at reading {n}"
            return False, self._last_reason

        if rpm_sp_cv >= self.setpoint_tolerance_pct:
            self._steady_duration_readings = 0
            self._last_reason = (
                f"RPM setpoint transitioning: CV={rpm_sp_cv:.2f}% "
                f"(threshold {self.setpoint_tolerance_pct:.2f}%)"
            )
            return False, self._last_reason

        if load_sp_cv >= self.setpoint_tolerance_pct:
            self._steady_duration_readings = 0
            self._last_reason = (
                f"Load setpoint transitioning: CV={load_sp_cv:.2f}% "
                f"(threshold {self.setpoint_tolerance_pct:.2f}%)"
            )
            return False, self._last_reason

        rpm_cv = self._cv_pct(rpms)
        load_cv = self._cv_pct(loads)

        ambps_f = ambps[np.isfinite(ambps)]
        if ambps_f.size == 0:
            amb_range_pct = float("inf")
        else:
            amb_mean = float(np.mean(ambps_f))
            amb_range = float(np.max(ambps_f) - np.min(ambps_f))
            amb_range_pct = (amb_range / abs(amb_mean)) * 100.0 if amb_mean != 0 else float("inf")

        # Step change detection catches sudden jumps that CV may miss.
        if self._detect_step_change(rpms):
            self._steady_duration_readings = 0
            self._last_reason = f"Step change detected in RPM at reading {n}"
            return False, self._last_reason
        if self._detect_step_change(loads):
            self._steady_duration_readings = 0
            self._last_reason = f"Step change detected in Load at reading {n}"
            return False, self._last_reason

        if rpm_cv >= self.rpm_tolerance_pct:
            self._steady_duration_readings = 0
            self._last_reason = f"RPM transitioning: CV={rpm_cv:.2f}% (threshold {self.rpm_tolerance_pct:.2f}%)"
            return False, self._last_reason

        if load_cv >= self.load_tolerance_pct:
            self._steady_duration_readings = 0
            self._last_reason = f"Load changing: CV={load_cv:.2f}% (threshold {self.load_tolerance_pct:.2f}%)"
            return False, self._last_reason

        if amb_range_pct >= self.pressure_tolerance_pct:
            self._steady_duration_readings = 0
            self._last_reason = f"Ambient pressure unstable: range={amb_range_pct:.2f}% (threshold {self.pressure_tolerance_pct:.2f}%)"
            return False, self._last_reason

        self._steady_duration_readings += 1
        self._last_reason = "All parameters stable"
        return True, self._last_reason

    def get_steady_state_metrics(self) -> Dict[str, object]:
        """Return current steady-state quality metrics."""
        rpms = np.array([p.rpm for p in self.history], dtype=float) if self.history else np.array([], dtype=float)
        loads = np.array([p.load for p in self.history], dtype=float) if self.history else np.array([], dtype=float)

        is_steady, reason = self.is_steady_state()
        return {
            "is_steady": bool(is_steady),
            "reason": reason,
            "rpm_cv_pct": round(self._cv_pct(rpms), 3) if self.history else float("inf"),
            "load_cv_pct": round(self._cv_pct(loads), 3) if self.history else float("inf"),
            "readings_in_window": len(self.history),
            "steady_duration_readings": int(self._steady_duration_readings),
        }

    def reset(self) -> None:
        """Clear history — call when scenario changes."""
        self.history = []
        self._steady_duration_readings = 0
        self._last_reason = "Reset"


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
    )

    guard = SteadyStateGuard(window_size=10, min_steady_readings=5)

    stable = {
        "Engine_Speed_Actual_RPM": 1800.0,
        "Engine_Load_Actual_Pct": 75.0,
        "Ambient_Pressure_kPa": 101.3,
    }

    print("\nSTEADY STATE GUARD — stable readings\n")
    for i in range(7):
        guard.add_reading(stable)
        ok, reason = guard.is_steady_state()
        print(f"{i+1:02d} -> steady={ok} | {reason}")

    print("\nSTEADY STATE GUARD — RPM ramp\n")
    guard.reset()
    for i in range(10):
        r = dict(stable)
        r["Engine_Speed_Actual_RPM"] = 1200.0 + (i * 80.0)
        guard.add_reading(r)
        ok, reason = guard.is_steady_state()
        print(f"{i+1:02d} RPM={r['Engine_Speed_Actual_RPM']:.0f} -> steady={ok} | {reason}")

