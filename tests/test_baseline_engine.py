import math
import sys
from pathlib import Path

import numpy as np

# Ensure src/ is importable when running pytest from repo root.
ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from baseline_engine import BaselineEngine, FEATURE_COLUMNS  # noqa: E402


def test_reference_self_deviation_zero():
    be = BaselineEngine()
    r = be.ref
    baseline = be.compute_baseline(
        rpm=r.RPM_REF,
        load_pct=r.LOAD_REF,
        ambient_pressure_kpa=r.P_REF_AMBIENT,
        ambient_temp_c=r.T_REF_AMBIENT,
    )
    dev = be.compute_deviation(baseline, baseline)
    finite = [abs(v) for v in dev.values() if np.isfinite(v)]
    assert max(finite) == 0.0


def test_baseline_has_all_42_features():
    be = BaselineEngine()
    baseline = be.compute_baseline(rpm=1800, load_pct=75, ambient_pressure_kpa=101.3, ambient_temp_c=32)
    assert set(baseline.keys()) == set(FEATURE_COLUMNS)


def test_operating_point_shift_changes_pressures_and_maf():
    be = BaselineEngine()
    ref = be.compute_baseline(rpm=1800, load_pct=75, ambient_pressure_kpa=101.3, ambient_temp_c=32)
    off = be.compute_baseline(rpm=1200, load_pct=50, ambient_pressure_kpa=101.3, ambient_temp_c=32)

    assert off["MAF_Sensor_Reading_kgph"] < ref["MAF_Sensor_Reading_kgph"]
    assert off["Turbocharger_Speed_RPM"] < ref["Turbocharger_Speed_RPM"]
    assert off["Post_Compressor_Pressure_kPa"] < ref["Post_Compressor_Pressure_kPa"]


def test_high_ambient_temp_increases_compressor_temps():
    be = BaselineEngine()
    cool = be.compute_baseline(rpm=1800, load_pct=75, ambient_pressure_kpa=101.3, ambient_temp_c=25)
    hot = be.compute_baseline(rpm=1800, load_pct=75, ambient_pressure_kpa=101.3, ambient_temp_c=45)
    assert hot["Post_Compressor_Temp_C"] > cool["Post_Compressor_Temp_C"]
    assert hot["Post_CAC_Temp_C"] > cool["Post_CAC_Temp_C"]


def test_leak_like_reading_flags_anomalies():
    be = BaselineEngine()
    baseline = be.compute_baseline(rpm=1800, load_pct=75, ambient_pressure_kpa=101.3, ambient_temp_c=32)

    leak = dict(baseline)
    leak["Pre_Compressor_Pressure_kPa"] *= 0.92
    leak["Post_Compressor_Pressure_kPa"] *= 0.90
    leak["Intake_Manifold_Pressure_kPa"] *= 0.90

    anomalies = be.get_anomalous_sensors(leak, baseline, threshold_pct=2.0)
    sensors = [a["sensor"] for a in anomalies]
    assert "Pre_Compressor_Pressure_kPa" in sensors
    assert "Post_Compressor_Pressure_kPa" in sensors
    assert "Intake_Manifold_Pressure_kPa" in sensors

