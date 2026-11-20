"""
Engine Configuration Registry

Stores physics constants for each supported Caterpillar engine family.
BaselineEngine and SFI use these values for engine-specific reference baselines.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class EngineConfig:
    """Complete physics configuration for one engine family."""

    engine_id: str
    display_name: str
    displacement_L: float
    power_range_kw: str
    application: str

    RPM_REF: float
    LOAD_REF: float
    P_REF_AMBIENT: float

    MAF_REF: float
    EGR_FRACTION: float

    K1: float
    CPR_REF: float
    T_REF_RISE: float
    RPM_REF_TURBO: float

    T_BASE_EXHAUST: float
    TER_REF: float

    has_scr: bool
    has_egr: bool
    has_dpf: bool

    bounds_override: Optional[dict] = None


ENGINE_REGISTRY: Dict[str, EngineConfig] = {
    "CAT_C7": EngineConfig(
        engine_id="CAT_C7",
        display_name="CAT C7 — 7.2L",
        displacement_L=7.2,
        power_range_kw="168–224 kW",
        application="Light equipment / Generators",
        RPM_REF=2000.0,
        LOAD_REF=75.0,
        P_REF_AMBIENT=101.3,
        MAF_REF=520.0,
        EGR_FRACTION=0.0780,
        K1=1.4933,
        CPR_REF=2.08,
        T_REF_RISE=115.0,
        RPM_REF_TURBO=82000.0,
        T_BASE_EXHAUST=853.3,
        TER_REF=1.94,
        has_scr=False,
        has_egr=True,
        has_dpf=True,
    ),
    "CAT_C13": EngineConfig(
        engine_id="CAT_C13",
        display_name="CAT C13 — 12.5L",
        displacement_L=12.5,
        power_range_kw="287–388 kW",
        application="Medium trucks / Construction",
        RPM_REF=1800.0,
        LOAD_REF=75.0,
        P_REF_AMBIENT=101.3,
        MAF_REF=720.0,
        EGR_FRACTION=0.0806,
        K1=1.5867,
        CPR_REF=2.19,
        T_REF_RISE=130.0,
        RPM_REF_TURBO=92000.0,
        T_BASE_EXHAUST=906.7,
        TER_REF=2.01,
        has_scr=True,
        has_egr=True,
        has_dpf=True,
    ),
    "CAT_C15": EngineConfig(
        engine_id="CAT_C15",
        display_name="CAT C15 — 15.2L",
        displacement_L=15.2,
        power_range_kw="354–433 kW",
        application="Heavy trucks / Large construction",
        RPM_REF=1800.0,
        LOAD_REF=75.0,
        P_REF_AMBIENT=101.3,
        MAF_REF=865.0,
        EGR_FRACTION=0.0820,
        K1=1.6533,
        CPR_REF=2.26,
        T_REF_RISE=142.0,
        RPM_REF_TURBO=98000.0,
        T_BASE_EXHAUST=946.7,
        TER_REF=2.08,
        has_scr=True,
        has_egr=True,
        has_dpf=True,
    ),
}

DEFAULT_ENGINE = "CAT_C13"


def get_engine(engine_id: str) -> EngineConfig:
    """Return engine config; fall back to C13 for unknown IDs."""
    if engine_id not in ENGINE_REGISTRY:
        logger.warning(
            "Unknown engine '%s' — falling back to %s.",
            engine_id,
            DEFAULT_ENGINE,
        )
        return ENGINE_REGISTRY[DEFAULT_ENGINE]
    return ENGINE_REGISTRY[engine_id]


def get_all_engines() -> List[dict]:
    """Return engine list for API / dashboard."""
    return [
        {
            "engine_id": cfg.engine_id,
            "display_name": cfg.display_name,
            "displacement_L": cfg.displacement_L,
            "power_range_kw": cfg.power_range_kw,
            "application": cfg.application,
            "rpm_ref": cfg.RPM_REF,
            "maf_ref": cfg.MAF_REF,
            "has_scr": cfg.has_scr,
            "has_egr": cfg.has_egr,
        }
        for cfg in ENGINE_REGISTRY.values()
    ]


def compute_engine_baselines(engine_id: str) -> Dict[str, Optional[float]]:
    """Compute static sensor baselines at reference operating conditions."""
    cfg = get_engine(engine_id)

    cpr = 1 + cfg.K1 * ((cfg.RPM_REF / cfg.RPM_REF) ** 2) * (cfg.LOAD_REF / 100)

    p_ambient = cfg.P_REF_AMBIENT
    p_pre_comp = p_ambient * 0.982
    p_post_comp = p_pre_comp * cpr
    p_post_cac = p_post_comp * 0.977
    p_intake_man = p_post_cac * 0.991
    boost = p_post_comp - p_ambient

    t_post_comp = 32.0 + (cfg.T_REF_RISE * (cpr - 1) / (cfg.CPR_REF - 1))
    t_post_cac = 32.0 + ((t_post_comp - 32.0) * 0.18)
    turbo_rpm = cfg.RPM_REF_TURBO

    maf = cfg.MAF_REF
    egr_flow = maf * cfg.EGR_FRACTION

    p_exh_man = p_post_comp * 1.055
    t_exh_man = cfg.T_BASE_EXHAUST * (cfg.LOAD_REF / 100.0)
    p_pre_turb = p_exh_man * 0.978
    p_post_turb = p_pre_turb / cfg.TER_REF
    t_post_turb = t_exh_man * 0.706
    p_post_doc = p_post_turb * 0.978
    p_post_dpf = p_post_doc * 0.969
    p_post_scr = p_post_dpf * 0.972
    p_tailpipe = p_ambient * 1.007

    ter = p_pre_turb / p_post_turb
    cac_drop = p_post_comp - p_post_cac
    dpf_delta = p_post_doc - p_post_dpf
    temp_rise_cac = t_post_cac - t_post_comp
    mass_bal_err = maf - (p_intake_man / 0.296)

    baselines: Dict[str, Optional[float]] = {
        "Engine_Speed_Setpoint_RPM": cfg.RPM_REF,
        "Engine_Load_Setpoint_Pct": cfg.LOAD_REF,
        "Engine_Speed_Actual_RPM": cfg.RPM_REF,
        "Engine_Load_Actual_Pct": cfg.LOAD_REF,
        "Fuel_Flow_Rate_kgph": round(maf * 0.0583, 2),
        "Engine_Coolant_Temp_C": 88.0,
        "Engine_Oil_Pressure_bar": 4.2,
        "Ambient_Temp_C": 32.0,
        "Ambient_Pressure_kPa": p_ambient,
        "Ambient_Humidity_Pct": 68.0,
        "Intake_Ambient_Pressure_kPa": round(p_ambient, 3),
        "MAF_Sensor_Reading_kgph": round(maf, 3),
        "Pre_Compressor_Pressure_kPa": round(p_pre_comp, 3),
        "Pre_Compressor_Temp_C": 38.0,
        "Post_Compressor_Pressure_kPa": round(p_post_comp, 3),
        "Post_Compressor_Temp_C": round(t_post_comp, 2),
        "Post_CAC_Pressure_kPa": round(p_post_cac, 3),
        "Post_CAC_Temp_C": round(t_post_cac, 2),
        "Intake_Manifold_Pressure_kPa": round(p_intake_man, 3),
        "Intake_Manifold_Temp_C": 55.0,
        "Turbocharger_Speed_RPM": round(turbo_rpm, 0),
        "Boost_Pressure_kPa": round(boost, 3),
        "Exhaust_Manifold_Pressure_kPa": round(p_exh_man, 3),
        "Exhaust_Manifold_Temp_C": round(t_exh_man, 2),
        "Pre_Turbine_Pressure_kPa": round(p_pre_turb, 3),
        "Pre_Turbine_Temp_C": round(t_exh_man * 0.985, 2),
        "Post_Turbine_Pressure_kPa": round(p_post_turb, 3),
        "Post_Turbine_Temp_C": round(t_post_turb, 2),
        "Post_DOC_Pressure_kPa": round(p_post_doc, 3),
        "Post_DOC_Temp_C": round(t_post_turb * 1.021, 2),
        "Post_DPF_Pressure_kPa": round(p_post_dpf, 3),
        "Post_DPF_Temp_C": round(t_post_turb * 0.979, 2),
        "Post_SCR_Pressure_kPa": round(p_post_scr, 3),
        "Post_SCR_Temp_C": round(t_post_turb * 0.875, 2),
        "Tailpipe_BackPressure_kPa": round(p_tailpipe, 3),
        "EGR_Flow_Rate_kgph": round(egr_flow, 3),
        "Intake_Mass_Balance_Error_kgph": round(mass_bal_err, 3),
        "Compressor_Pressure_Ratio": round(cpr, 4),
        "Turbine_Expansion_Ratio": round(ter, 4),
        "CAC_Pressure_Drop_kPa": round(cac_drop, 3),
        "DPF_Delta_Pressure_kPa": round(dpf_delta, 3),
        "Intake_Temp_Rise_Across_CAC_C": round(temp_rise_cac, 3),
    }

    if not cfg.has_scr:
        baselines["Post_SCR_Pressure_kPa"] = None
        baselines["Post_SCR_Temp_C"] = None

    return baselines


def resolve_pipeline_baselines(engine_id: str) -> Dict[str, float]:
    """Delegate to baseline_contract for a single import surface."""
    from baseline_contract import resolve_pipeline_baselines as _resolve

    return _resolve(engine_id)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")

    print("=" * 65)
    print("  ENGINE CONFIG — VERIFICATION")
    print("=" * 65)

    for eid in ["CAT_C7", "CAT_C13", "CAT_C15"]:
        cfg = get_engine(eid)
        baseline = compute_engine_baselines(eid)
        print(f"\n{cfg.display_name}")
        print(f"  MAF ref:            {cfg.MAF_REF} kg/h")
        print(f"  CPR ref:            {cfg.CPR_REF}")
        print(f"  Turbo RPM ref:      {cfg.RPM_REF_TURBO}")
        print(f"  Exhaust temp ref:   {cfg.T_BASE_EXHAUST}°C")
        print(f"  Has SCR:            {cfg.has_scr}")
        print(f"\n  Key baselines:")
        print(f"  Pre_Compressor_P:   {baseline['Pre_Compressor_Pressure_kPa']} kPa")
        print(f"  Post_Compressor_P:  {baseline['Post_Compressor_Pressure_kPa']} kPa")
        print(f"  Exhaust_Manifold_T: {baseline['Exhaust_Manifold_Temp_C']} °C")
        print(f"  MAF:                {baseline['MAF_Sensor_Reading_kgph']} kg/h")
        print(f"  Boost:              {baseline['Boost_Pressure_kPa']} kPa")

    b7 = compute_engine_baselines("CAT_C7")
    b13 = compute_engine_baselines("CAT_C13")
    b15 = compute_engine_baselines("CAT_C15")

    assert b7["MAF_Sensor_Reading_kgph"] < b13["MAF_Sensor_Reading_kgph"] < b15[
        "MAF_Sensor_Reading_kgph"
    ]
    assert b7["Post_Compressor_Pressure_kPa"] < b13["Post_Compressor_Pressure_kPa"] < b15[
        "Post_Compressor_Pressure_kPa"
    ]
    assert b7["Exhaust_Manifold_Temp_C"] < b13["Exhaust_Manifold_Temp_C"] < b15[
        "Exhaust_Manifold_Temp_C"
    ]
    assert b7["Post_SCR_Pressure_kPa"] is None
    assert b13["Post_SCR_Pressure_kPa"] is not None

    print("\n" + "=" * 65)
    print("  ALL ASSERTIONS PASSED")
    print("=" * 65)
