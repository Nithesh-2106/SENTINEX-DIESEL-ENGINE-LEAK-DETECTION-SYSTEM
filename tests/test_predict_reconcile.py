"""Tests for multi-head prediction reconciliation in predict.py."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from predict import _reconcile_prediction_heads  # noqa: E402


def test_no_leak_forces_normal_outputs() -> None:
    """Binary no-leak must not surface leak location or pause action."""
    present, loc, sev, act = _reconcile_prediction_heads(
        0,
        "Intake_PreTurbo",
        "Moderate",
        "Pause_Test_Inspect_Component",
    )
    assert present == 0
    assert loc == "None"
    assert sev == "None"
    assert act == "Continue_Testing"


def test_leak_with_location_kept() -> None:
    present, loc, sev, act = _reconcile_prediction_heads(
        1,
        "EGR_Leak",
        "Moderate",
        "Pause_Test_Inspect_Component",
    )
    assert present == 1
    assert loc == "EGR_Leak"
    assert sev == "Moderate"
    assert act == "Pause_Test_Inspect_Component"


def test_leak_without_location_downgraded() -> None:
    """Binary leak + location None is not actionable — treat as normal."""
    present, loc, sev, act = _reconcile_prediction_heads(
        1,
        "None",
        "None",
        "Continue_Testing",
    )
    assert present == 0
    assert loc == "None"
    assert act == "Continue_Testing"
