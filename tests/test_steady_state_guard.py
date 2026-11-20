import sys
from pathlib import Path

# Ensure src/ is importable when running pytest from repo root.
ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from steady_state_guard import SteadyStateGuard  # noqa: E402


def _reading(
    rpm: float,
    load: float,
    amb_p: float = 101.3,
    rpm_sp: float | None = None,
    load_sp: float | None = None,
):
    return {
        "Engine_Speed_Actual_RPM": rpm,
        "Engine_Load_Actual_Pct": load,
        "Ambient_Pressure_kPa": amb_p,
        "Engine_Speed_Setpoint_RPM": rpm if rpm_sp is None else rpm_sp,
        "Engine_Load_Setpoint_Pct": load if load_sp is None else load_sp,
    }


def test_insufficient_history():
    g = SteadyStateGuard(window_size=10, min_steady_readings=5)
    for i in range(3):
        g.add_reading(_reading(1800, 75))
    ok, reason = g.is_steady_state()
    assert ok is False
    assert "Insufficient history" in reason


def test_stable_readings_become_steady():
    g = SteadyStateGuard(window_size=10, min_steady_readings=5)
    for i in range(6):
        g.add_reading(_reading(1800, 75))
    ok, reason = g.is_steady_state()
    assert ok is True
    assert "stable" in reason.lower()


def test_rpm_ramp_not_steady():
    g = SteadyStateGuard(window_size=10, min_steady_readings=5, rpm_tolerance_pct=2.0)
    for i in range(10):
        g.add_reading(_reading(1200 + (i * 80), 75))
    ok, reason = g.is_steady_state()
    assert ok is False
    assert "RPM" in reason


def test_step_change_detection():
    g = SteadyStateGuard(window_size=10, min_steady_readings=5)
    for i in range(6):
        g.add_reading(_reading(1800, 75))
    # abrupt jump
    g.add_reading(_reading(2200, 75))
    ok, reason = g.is_steady_state()
    assert ok is False
    assert "step change" in reason.lower()


def test_reset_clears_history():
    g = SteadyStateGuard(window_size=10, min_steady_readings=5)
    for i in range(6):
        g.add_reading(_reading(1800, 75))
    g.reset()
    ok, reason = g.is_steady_state()
    assert ok is False
    assert "Insufficient history" in reason or "Reset" in reason


def test_setpoint_ramp_not_steady_while_actual_lags():
    """Mimics dashboard 5s ramp: setpoints move, actuals lag — must stay transitioning."""
    g = SteadyStateGuard(
        window_size=10,
        min_steady_readings=5,
        tracking_tolerance_pct=1.0,
        setpoint_tolerance_pct=1.5,
    )
    for i in range(6):
        g.add_reading(_reading(1800, 75))

    # 5-second ramp: setpoint +60 RPM/tick, actual only +25 RPM/tick
    for tick in range(1, 6):
        sp = 1800 + tick * 60
        act = 1800 + tick * 25
        g.add_reading(_reading(act, 75, rpm_sp=sp, load_sp=75))
        ok, reason = g.is_steady_state()
        assert ok is False, f"tick {tick} should not be steady: {reason}"

