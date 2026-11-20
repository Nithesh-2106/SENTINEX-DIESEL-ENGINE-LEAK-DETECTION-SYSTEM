"""Diagnose multi-engine scenario predictions against live API."""
from __future__ import annotations

import json
import urllib.request

API = "http://127.0.0.1:8000/predict"

# Mirror dashboard/src/simulator.js ENGINE_BASELINES + SCENARIO_DEVIATIONS
CAT_C13_BASE = {
    "Engine_Speed_Setpoint_RPM": 1800.0,
    "Engine_Load_Setpoint_Pct": 75.0,
    "Engine_Speed_Actual_RPM": 1800.19,
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
    "Post_Compressor_Temp_C": 167.9,
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
    "Post_Turbine_Temp_C": 480.2,
    "Post_DOC_Pressure_kPa": 109.5,
    "Post_DOC_Temp_C": 490.0,
    "Post_DPF_Pressure_kPa": 106.0,
    "Post_DPF_Temp_C": 469.9,
    "Post_SCR_Pressure_kPa": 103.5,
    "Post_SCR_Temp_C": 420.1,
    "Tailpipe_BackPressure_kPa": 102.0,
    "EGR_Flow_Rate_kgph": 58.0,
    "Intake_Mass_Balance_Error_kgph": 7.4,
    "Compressor_Pressure_Ratio": 2.19,
    "Turbine_Expansion_Ratio": 2.01,
    "CAC_Pressure_Drop_kPa": 5.0,
    "DPF_Delta_Pressure_kPa": 3.5,
    "Intake_Temp_Rise_Across_CAC_C": -116.0,
}

ENGINE_BASELINES = {
    "CAT_C7": {
        **CAT_C13_BASE,
        "Engine_Speed_Setpoint_RPM": 2000.0,
        "Engine_Speed_Actual_RPM": 2000.0,
        "MAF_Sensor_Reading_kgph": 520.0,
        "Pre_Compressor_Pressure_kPa": 97.6,
        "Post_Compressor_Pressure_kPa": 203.0,
        "Post_CAC_Pressure_kPa": 198.3,
        "Intake_Manifold_Pressure_kPa": 196.4,
        "Boost_Pressure_kPa": 101.7,
        "Turbocharger_Speed_RPM": 82000.0,
        "Exhaust_Manifold_Pressure_kPa": 214.2,
        "Exhaust_Manifold_Temp_C": 640.0,
        "Pre_Turbine_Pressure_kPa": 209.5,
        "Pre_Turbine_Temp_C": 630.0,
        "Post_Turbine_Pressure_kPa": 108.0,
        "Post_Turbine_Temp_C": 451.8,
        "Post_DOC_Pressure_kPa": 105.6,
        "Post_DPF_Pressure_kPa": 102.3,
        "Post_SCR_Pressure_kPa": 102.3,
        "Post_SCR_Temp_C": 442.0,
        "EGR_Flow_Rate_kgph": 40.6,
        "Fuel_Flow_Rate_kgph": 30.3,
        "Compressor_Pressure_Ratio": 2.08,
        "Turbine_Expansion_Ratio": 1.94,
        "CAC_Pressure_Drop_kPa": 4.7,
        "Intake_Mass_Balance_Error_kgph": 6.2,
    },
    "CAT_C13": dict(CAT_C13_BASE),
    "CAT_C15": {
        **CAT_C13_BASE,
        "MAF_Sensor_Reading_kgph": 865.0,
        "Pre_Compressor_Pressure_kPa": 101.5,
        "Post_Compressor_Pressure_kPa": 229.4,
        "Post_CAC_Pressure_kPa": 224.1,
        "Intake_Manifold_Pressure_kPa": 221.9,
        "Boost_Pressure_kPa": 128.1,
        "Turbocharger_Speed_RPM": 98000.0,
        "Exhaust_Manifold_Pressure_kPa": 242.0,
        "Exhaust_Manifold_Temp_C": 710.0,
        "Pre_Turbine_Pressure_kPa": 236.7,
        "Pre_Turbine_Temp_C": 699.0,
        "Post_Turbine_Pressure_kPa": 113.8,
        "Post_Turbine_Temp_C": 501.3,
        "Post_DOC_Pressure_kPa": 111.3,
        "Post_DPF_Pressure_kPa": 107.9,
        "Post_SCR_Pressure_kPa": 104.8,
        "Post_SCR_Temp_C": 438.6,
        "EGR_Flow_Rate_kgph": 71.0,
        "Fuel_Flow_Rate_kgph": 50.4,
        "Compressor_Pressure_Ratio": 2.26,
        "Turbine_Expansion_Ratio": 2.08,
        "CAC_Pressure_Drop_kPa": 5.3,
        "Intake_Mass_Balance_Error_kgph": 8.9,
    },
}

SCENARIO_DEVIATIONS = {
    "normal": {},
    "intake_preturbo": {
        "Pre_Compressor_Pressure_kPa": -0.085,
        "Post_Compressor_Pressure_kPa": -0.106,
        "Post_Compressor_Temp_C": -0.06,
        "Post_CAC_Pressure_kPa": -0.108,
        "Intake_Manifold_Pressure_kPa": -0.109,
        "Turbocharger_Speed_RPM": -0.054,
        "Boost_Pressure_kPa": -0.197,
    },
    "intake_cac": {
        "Post_CAC_Pressure_kPa": -0.085,
        "Post_CAC_Temp_C": 0.115,
        "Intake_Manifold_Pressure_kPa": -0.09,
        "Intake_Manifold_Temp_C": 0.109,
    },
    "exhaust_preturbine": {
        "Exhaust_Manifold_Pressure_kPa": -0.139,
        "Exhaust_Manifold_Temp_C": 0.059,
        "Pre_Turbine_Pressure_kPa": -0.156,
        "Post_Turbine_Pressure_kPa": -0.036,
        "Post_Turbine_Temp_C": -0.042,
        "Turbine_Expansion_Ratio": -0.125,
        "Post_Compressor_Pressure_kPa": -0.059,
        "Boost_Pressure_kPa": -0.111,
        "Turbocharger_Speed_RPM": -0.043,
    },
    "exhaust_postturbine": {
        "Post_Turbine_Pressure_kPa": -0.071,
        "Post_Turbine_Temp_C": -0.073,
        "Post_DOC_Pressure_kPa": -0.073,
        "Post_DPF_Pressure_kPa": -0.061,
        "Post_SCR_Pressure_kPa": -0.053,
    },
    "egr_leak": {
        "EGR_Flow_Rate_kgph": -0.345,
        "Exhaust_Manifold_Pressure_kPa": -0.026,
        "Intake_Manifold_Temp_C": 0.073,
    },
    "cac_direct_leak": {
        "Post_CAC_Pressure_kPa": -0.099,
        "Post_CAC_Temp_C": 0.192,
        "Intake_Manifold_Pressure_kPa": -0.102,
        "Intake_Manifold_Temp_C": 0.145,
    },
    "minor_intake_leak": {
        "Pre_Compressor_Pressure_kPa": -0.029,
        "Post_Compressor_Pressure_kPa": -0.039,
        "Post_CAC_Pressure_kPa": -0.04,
        "Intake_Manifold_Pressure_kPa": -0.038,
        "Boost_Pressure_kPa": -0.07,
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
    "sensor_fault_demo": (0, "None"),  # sensor fault, not leak
}


def make_reading(engine_id: str, scenario: str) -> dict:
    base = dict(ENGINE_BASELINES[engine_id])
    devs = SCENARIO_DEVIATIONS[scenario]
    out = dict(base)
    for k, pct in devs.items():
        if k == "_abs":
            continue
        if k in base and base[k] is not None:
            out[k] = base[k] * (1 + pct)
    for k, v in devs.get("_abs", {}).items():
        out[k] = v
    return out


def predict(engine_id: str, scenario: str, reading: dict) -> dict:
    payload = {
        **reading,
        "engine_id": engine_id,
        "demo_scenario": scenario,
    }
    req = urllib.request.Request(
        API,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def warm_up(engine_id: str, scenario: str, n: int = 8) -> None:
    reading = make_reading(engine_id, scenario)
    for _ in range(n):
        predict(engine_id, scenario, reading)


def main() -> None:
    failures = []
    for engine_id in ("CAT_C7", "CAT_C13", "CAT_C15"):
        for scenario, (exp_leak, exp_loc) in EXPECTED.items():
            warm_up(engine_id, scenario)
            reading = make_reading(engine_id, scenario)
            result = predict(engine_id, scenario, reading)
            sfi = result.get("Sensor_Fault_Isolation") or {}
            got_leak = result["Leak_Present"]
            got_loc = result["Leak_Location"]
            sensor_fault = sfi.get("is_sensor_fault", False)
            ok = True
            if scenario == "sensor_fault_demo":
                if not sensor_fault and got_leak == 1:
                    ok = False
            elif got_leak != exp_leak or (exp_leak == 1 and got_loc != exp_loc):
                ok = False
            elif sensor_fault:
                ok = False
            status = "OK" if ok else "FAIL"
            line = (
                f"{status} {engine_id:8} {scenario:22} "
                f"leak={got_leak} loc={got_loc:22} "
                f"sfi_fault={sensor_fault}"
            )
            print(line)
            if not ok:
                failures.append(line)
    print(f"\n{len(failures)} failures")
    for f in failures:
        print(" ", f)


if __name__ == "__main__":
    main()
