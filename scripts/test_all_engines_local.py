"""Local predict_leak test for all engines/scenarios (no API)."""
from __future__ import annotations

import copy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from baseline_contract import resolve_pipeline_baselines  # noqa: E402
from data_quality_pipeline import DataQualityPipeline  # noqa: E402
from predict import predict_leak  # noqa: E402
from sensor_fault_isolator import SensorFaultIsolator  # noqa: E402
from steady_state_guard import SteadyStateGuard  # noqa: E402

SCENARIO_DEVIATIONS = {
    "normal": {},
    "intake_preturbo": {
        "Pre_Compressor_Pressure_kPa": -0.085,
        "Pre_Compressor_Temp_C": -0.015,
        "Post_Compressor_Pressure_kPa": -0.106,
        "Post_Compressor_Temp_C": -0.06,
        "Post_CAC_Pressure_kPa": -0.108,
        "Post_CAC_Temp_C": -0.038,
        "Intake_Manifold_Pressure_kPa": -0.109,
        "Turbocharger_Speed_RPM": -0.054,
        "Boost_Pressure_kPa": -0.197,
        "Intake_Mass_Balance_Error_kgph": 10.5,
        "Intake_Temp_Rise_Across_CAC_C": -0.07,
    },
    "intake_cac": {
        "Post_CAC_Pressure_kPa": -0.085,
        "Post_CAC_Temp_C": 0.115,
        "Intake_Manifold_Pressure_kPa": -0.09,
        "Intake_Manifold_Temp_C": 0.109,
        "Intake_Mass_Balance_Error_kgph": 8.5,
        "CAC_Pressure_Drop_kPa": 3.6,
        "Intake_Temp_Rise_Across_CAC_C": -0.05,
    },
    "exhaust_preturbine": {
        "Post_Compressor_Pressure_kPa": -0.059,
        "Turbocharger_Speed_RPM": -0.043,
        "Boost_Pressure_kPa": -0.111,
        "Exhaust_Manifold_Pressure_kPa": -0.139,
        "Exhaust_Manifold_Temp_C": 0.059,
        "Pre_Turbine_Pressure_kPa": -0.156,
        "Post_Turbine_Pressure_kPa": -0.036,
        "Post_Turbine_Temp_C": -0.042,
        "Intake_Mass_Balance_Error_kgph": -0.07,
        "Compressor_Pressure_Ratio": -0.059,
        "Turbine_Expansion_Ratio": -0.125,
        "CAC_Pressure_Drop_kPa": -2.6,
    },
    "exhaust_postturbine": {
        "Post_Turbine_Pressure_kPa": -0.071,
        "Post_Turbine_Temp_C": -0.073,
        "Post_DOC_Pressure_kPa": -0.073,
        "Post_DOC_Temp_C": -0.071,
        "Post_DPF_Pressure_kPa": -0.061,
        "Post_DPF_Temp_C": -0.064,
        "Post_SCR_Pressure_kPa": -0.053,
        "Post_SCR_Temp_C": -0.071,
        "Intake_Mass_Balance_Error_kgph": 0.05,
        "Turbine_Expansion_Ratio": 0.075,
        "DPF_Delta_Pressure_kPa": -0.43,
    },
    "egr_leak": {
        "Intake_Manifold_Temp_C": 0.073,
        "Exhaust_Manifold_Pressure_kPa": -0.026,
        "EGR_Flow_Rate_kgph": -0.345,
        "Intake_Mass_Balance_Error_kgph": 1.15,
    },
    "cac_direct_leak": {
        "Post_CAC_Pressure_kPa": -0.099,
        "Post_CAC_Temp_C": 0.192,
        "Intake_Manifold_Pressure_kPa": -0.102,
        "Intake_Manifold_Temp_C": 0.145,
        "Boost_Pressure_kPa": -0.13,
        "Intake_Mass_Balance_Error_kgph": 9.5,
        "CAC_Pressure_Drop_kPa": 4.2,
    },
    "minor_intake_leak": {
        "Pre_Compressor_Pressure_kPa": -0.029,
        "Post_Compressor_Pressure_kPa": -0.039,
        "Post_CAC_Pressure_kPa": -0.04,
        "Intake_Manifold_Pressure_kPa": -0.038,
        "Boost_Pressure_kPa": -0.07,
        "Intake_Mass_Balance_Error_kgph": 3.6,
    },
    "sensor_fault_demo": {"_abs": {"Pre_Compressor_Pressure_kPa": 72.0}},
}

EXPECTED = {
    "normal": (0, "None"),
    "intake_preturbo": (1, "Intake_PreTurbo"),
    "intake_cac": (1, "Intake_PostTurbo_CAC"),
    "exhaust_preturbine": (1, "Exhaust_PreTurbine"),
    "exhaust_postturbine": (1, "Exhaust_PostTurbine"),
    "egr_leak": (1, "EGR_Leak"),
    "cac_direct_leak": (1, "CAC_Direct_Leak"),
    "minor_intake_leak": (1, "Intake_PreTurbo"),
    "sensor_fault_demo": (0, "None"),
}


def make_reading(engine_id: str, scenario: str) -> dict:
    base = resolve_pipeline_baselines(engine_id)
    out = copy.deepcopy(base)
    devs = SCENARIO_DEVIATIONS[scenario]
    for k, pct in devs.items():
        if k == "_abs":
            continue
        if k in out:
            if k == "Intake_Mass_Balance_Error_kgph" and abs(pct) > 1:
                out[k] = pct
            elif k in ("CAC_Pressure_Drop_kPa", "DPF_Delta_Pressure_kPa") and abs(pct) > 1:
                out[k] = base[k] + pct
            else:
                out[k] = base[k] * (1 + pct)
    for k, v in devs.get("_abs", {}).items():
        out[k] = v
    return out


def run_case(engine_id: str, scenario: str) -> dict:
    from baseline_engine import BaselineEngine

    guard = SteadyStateGuard(window_size=10, min_steady_readings=5)
    dqp = DataQualityPipeline(window_size=20)
    sfi = SensorFaultIsolator()
    be = BaselineEngine(engine_id)
    reading = make_reading(engine_id, scenario)
    for _ in range(8):
        predict_leak(
            reading,
            guard=guard,
            baseline_engine=be,
            dqp=dqp,
            sfi=sfi,
            demo_scenario=scenario,
            engine_id=engine_id,
        )
    return predict_leak(
        reading,
        guard=guard,
        baseline_engine=be,
        dqp=dqp,
        sfi=sfi,
        demo_scenario=scenario,
        engine_id=engine_id,
    )


def main() -> None:
    failures = []
    for engine_id in ("CAT_C7", "CAT_C13", "CAT_C15"):
        for scenario, (exp_leak, exp_loc) in EXPECTED.items():
            result = run_case(engine_id, scenario)
            sfi = result.get("Sensor_Fault_Isolation") or {}
            got_leak = result["Leak_Present"]
            got_loc = result["Leak_Location"]
            sensor_fault = sfi.get("is_sensor_fault", False)
            ok = True
            if scenario == "sensor_fault_demo":
                if not sensor_fault:
                    ok = False
            elif got_leak != exp_leak or (exp_leak == 1 and got_loc != exp_loc):
                ok = False
            elif sensor_fault:
                ok = False
            status = "OK" if ok else "FAIL"
            line = (
                f"{status} {engine_id:8} {scenario:22} "
                f"leak={got_leak} loc={str(got_loc):22} sfi={sensor_fault}"
            )
            print(line)
            if not ok:
                failures.append(line)
    print(f"\n{len(failures)} failures")


if __name__ == "__main__":
    main()
