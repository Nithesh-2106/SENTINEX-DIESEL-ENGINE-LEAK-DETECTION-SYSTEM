"""Tests for src/engine_config.py and multi-engine baseline support."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from baseline_contract import resolve_pipeline_baselines  # noqa: E402
from baseline_engine import BaselineEngine, FEATURE_COLUMNS  # noqa: E402
from engine_config import (  # noqa: E402
    DEFAULT_ENGINE,
    compute_engine_baselines,
    get_all_engines,
    get_engine,
)


def test_all_three_engines_exist() -> None:
    engines = {e["engine_id"] for e in get_all_engines()}
    assert engines == {"CAT_C7", "CAT_C13", "CAT_C15"}


def test_c15_maf_greater_than_c13() -> None:
    b13 = resolve_pipeline_baselines("CAT_C13")
    b15 = resolve_pipeline_baselines("CAT_C15")
    assert b15["MAF_Sensor_Reading_kgph"] > b13["MAF_Sensor_Reading_kgph"]


def test_c7_maf_less_than_c13() -> None:
    b7 = resolve_pipeline_baselines("CAT_C7")
    b13 = resolve_pipeline_baselines("CAT_C13")
    assert b7["MAF_Sensor_Reading_kgph"] < b13["MAF_Sensor_Reading_kgph"]


def test_baselines_ordered_c7_c13_c15() -> None:
    b7 = resolve_pipeline_baselines("CAT_C7")
    b13 = resolve_pipeline_baselines("CAT_C13")
    b15 = resolve_pipeline_baselines("CAT_C15")
    assert b7["Post_Compressor_Pressure_kPa"] < b13["Post_Compressor_Pressure_kPa"] < b15[
        "Post_Compressor_Pressure_kPa"
    ]
    assert b7["MAF_Sensor_Reading_kgph"] < b13["MAF_Sensor_Reading_kgph"] < b15[
        "MAF_Sensor_Reading_kgph"
    ]
    assert b7["Exhaust_Manifold_Temp_C"] < b13["Exhaust_Manifold_Temp_C"] < b15[
        "Exhaust_Manifold_Temp_C"
    ]


def test_translate_normal_reading_to_c13_frame() -> None:
    from baseline_contract import translate_reading_to_c13_frame

    c7 = resolve_pipeline_baselines("CAT_C7")
    translated = translate_reading_to_c13_frame(c7, "CAT_C7")
    c13 = resolve_pipeline_baselines("CAT_C13")
    for key in c13:
        assert abs(translated[key] - c13[key]) < 0.05, key


def test_translate_intake_leak_preserves_deviation_pct() -> None:
    from baseline_contract import translate_reading_to_c13_frame

    pct = -0.085
    for engine_id in ("CAT_C7", "CAT_C15"):
        base = resolve_pipeline_baselines(engine_id)
        leaked = dict(base)
        leaked["Pre_Compressor_Pressure_kPa"] = base["Pre_Compressor_Pressure_kPa"] * (
            1 + pct
        )
        translated = translate_reading_to_c13_frame(leaked, engine_id)
        c13_base = resolve_pipeline_baselines("CAT_C13")["Pre_Compressor_Pressure_kPa"]
        expected = c13_base * (1 + pct)
        assert abs(translated["Pre_Compressor_Pressure_kPa"] - expected) < 0.1


def test_c7_has_no_scr() -> None:
    raw = compute_engine_baselines("CAT_C7")
    assert raw["Post_SCR_Pressure_kPa"] is None
    assert get_engine("CAT_C7").has_scr is False


def test_c13_c15_have_scr() -> None:
    assert get_engine("CAT_C13").has_scr is True
    assert get_engine("CAT_C15").has_scr is True
    assert compute_engine_baselines("CAT_C13")["Post_SCR_Pressure_kPa"] is not None


def test_baseline_keys_match_42_features() -> None:
    for engine_id in ("CAT_C7", "CAT_C13", "CAT_C15"):
        baselines = compute_engine_baselines(engine_id)
        assert set(baselines.keys()) == set(FEATURE_COLUMNS)


def test_switch_engine_updates_constants() -> None:
    be = BaselineEngine("CAT_C7")
    assert be.current_engine == "CAT_C7"
    assert be.ref.RPM_REF == 2000.0
    be.switch_engine("CAT_C15")
    assert be.current_engine == "CAT_C15"
    assert be.ref.MAF_REF == 865.0


def test_unknown_engine_falls_back_to_c13() -> None:
    cfg = get_engine("NOT_REAL")
    assert cfg.engine_id == DEFAULT_ENGINE


def test_leak_patterns_consistent_across_engines() -> None:
    pct = -0.085
    for engine_id in ("CAT_C7", "CAT_C13", "CAT_C15"):
        base = resolve_pipeline_baselines(engine_id)
        leaked = base["Pre_Compressor_Pressure_kPa"] * (1 + pct)
        dev_pct = (
            (leaked - base["Pre_Compressor_Pressure_kPa"])
            / base["Pre_Compressor_Pressure_kPa"]
            * 100
        )
        assert abs(dev_pct - (-8.5)) < 0.01
