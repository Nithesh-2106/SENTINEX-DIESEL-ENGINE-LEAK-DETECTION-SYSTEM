"""
Root Cause Analysis engine — physics-accurate diesel engine leak diagnosis.

Mirrors dashboard/src/utils/rootCauseEngine.js for backend / API use.
"""

from __future__ import annotations

import time
from copy import deepcopy
from typing import Any

RCA_KNOWLEDGE_BASE: dict[str, list[dict[str, Any]]] = {
    "Intake_PreTurbo": [
        {
            "id": "loose_vclamp_inlet",
            "label": "Loose V-clamp at turbo inlet",
            "baseProbability": 0.60,
            "physicalReasoning": "Proportional pressure drop with no temperature rise indicates a mechanical gap at a connection point, not a thermal crack",
            "inspectAction": "Check V-clamp torque at turbocharger air inlet",
            "tool": "Torque wrench — 25 Nm",
            "visualSign": "Look for air hiss sound, oil mist around clamp",
        },
        {
            "id": "cracked_intake_pipe",
            "label": "Cracked intake pipe near bend",
            "baseProbability": 0.25,
            "physicalReasoning": "Hairline cracks develop at pipe bends under heat cycling — unlikely without a temperature rise signature",
            "inspectAction": "Visual inspection of all pipe bends, dye penetrant test",
            "tool": "Dye penetrant kit",
            "visualSign": "Hairline cracks, discolouration near bend apex",
        },
        {
            "id": "failed_rubber_boot",
            "label": "Failed rubber boot or connector",
            "baseProbability": 0.15,
            "physicalReasoning": "Aged rubber loses elasticity and develops micro-gaps — consistent with mechanical gap and no thermal signature",
            "inspectAction": "Squeeze-test all rubber boot sections in intake path",
            "tool": "None — manual inspection",
            "visualSign": "Surface cracking, hardening, visible gap at bead",
        },
    ],
    "Intake_PostTurbo_CAC": [
        {
            "id": "cac_end_tank_crack",
            "label": "CAC end tank crack",
            "baseProbability": 0.50,
            "physicalReasoning": "Large CAC pressure drop with boost drop indicates pressurised charge air escaping at the CAC housing",
            "inspectAction": "Pressure test CAC assembly at 200 kPa, look for coolant mixing in intake",
            "tool": "Pressure test kit — 200 kPa",
            "visualSign": "Coolant smell in intake air, air bubbles in coolant reservoir",
        },
        {
            "id": "loose_cac_outlet_clamp",
            "label": "Loose CAC outlet hose clamp",
            "baseProbability": 0.35,
            "physicalReasoning": "Moderate pressure drop at CAC outlet suggests a partial seal failure at the hose-to-manifold connection",
            "inspectAction": "Torque check on CAC outlet hose clamp, inspect hose bead seating",
            "tool": "Torque wrench — 10 Nm",
            "visualSign": "Hose slightly off-centre on pipe bead",
        },
        {
            "id": "cac_internal_tube_failure",
            "label": "CAC internal tube failure",
            "baseProbability": 0.15,
            "physicalReasoning": "Internal tube fracture allows charge air to mix with coolant inside the core",
            "inspectAction": "Borescope inspection of CAC internal tubes, check coolant for exhaust contamination",
            "tool": "Borescope",
            "visualSign": "Coolant discolouration, milky residue in intake",
        },
    ],
    "Exhaust_PreTurbine": [
        {
            "id": "blown_exhaust_gasket",
            "label": "Blown exhaust manifold gasket",
            "baseProbability": 0.55,
            "physicalReasoning": "Pressure drop WITH temperature rise means hot combustion gas is escaping before reaching the turbine",
            "inspectAction": "Inspect gasket face between cylinder head and exhaust manifold on all cylinders",
            "tool": "Feeler gauge, UV dye if needed",
            "visualSign": "Carbon deposits around gasket edge, uneven surface contact",
        },
        {
            "id": "cracked_exhaust_manifold",
            "label": "Cracked exhaust manifold",
            "baseProbability": 0.30,
            "physicalReasoning": "Thermal cycling causes cracks — often localised to one cylinder with uneven temperature distribution",
            "inspectAction": "Thermal camera scan across entire manifold surface, dye penetrant on suspect areas",
            "tool": "Thermal camera, dye penetrant kit",
            "visualSign": "Hot spot on thermal image, carbon streak along crack line",
        },
        {
            "id": "loose_manifold_bolt",
            "label": "Loose exhaust manifold bolt",
            "baseProbability": 0.15,
            "physicalReasoning": "Bolt loosening creates a gap that opens and closes with thermal expansion",
            "inspectAction": "Torque all exhaust manifold bolts to specification",
            "tool": "Torque wrench — 45 Nm",
            "visualSign": "Carbon soot track around loose bolt, slight manifold movement",
        },
    ],
    "Exhaust_PostTurbine": [
        {
            "id": "cracked_flex_pipe",
            "label": "Cracked flex pipe or bellows after turbine",
            "baseProbability": 0.45,
            "physicalReasoning": "Post-turbine pressure drop with temperature drop indicates expanding gas cooling as it escapes through a crack",
            "inspectAction": "Apply soapy water along entire flex pipe and bellows section while engine runs",
            "tool": "Soapy water spray bottle",
            "visualSign": "Bubbling at crack, slight soot downstream of leak point",
        },
        {
            "id": "failed_turbo_outlet_gasket",
            "label": "Failed turbo outlet gasket",
            "baseProbability": 0.40,
            "physicalReasoning": "Gasket failure at turbine housing to downpipe flange face is a common wear point on high-cycle engines",
            "inspectAction": "Retorque turbine outlet flange bolts, inspect gasket condition",
            "tool": "Torque wrench — 35 Nm",
            "visualSign": "Carbon ring around flange face, soot deposits on housing",
        },
        {
            "id": "loose_vband_turbine_outlet",
            "label": "Loose V-band clamp at turbine outlet",
            "baseProbability": 0.15,
            "physicalReasoning": "V-band clamps can back off from vibration over long test cycles — typical of minor deviations",
            "inspectAction": "Inspect and retorque V-band clamp at turbine outlet",
            "tool": "Torque wrench — 20 Nm",
            "visualSign": "Clamp slightly rotated from original position",
        },
    ],
    "EGR_Leak": [
        {
            "id": "egr_pipe_gasket_failure",
            "label": "Failed EGR pipe gasket or seal",
            "baseProbability": 0.55,
            "physicalReasoning": "EGR flow drop with rising mass balance error means recirculated exhaust is escaping before reaching intake manifold",
            "inspectAction": "Apply soapy water along all EGR pipe joints and connections while engine runs",
            "tool": "Soapy water spray bottle",
            "visualSign": "Bubbling at joint, soot staining on EGR pipe exterior",
        },
        {
            "id": "cracked_egr_cooler",
            "label": "Cracked EGR cooler",
            "baseProbability": 0.30,
            "physicalReasoning": "EGR cooler cracks allow exhaust gas to mix with coolant — detectable by coolant temperature deviation",
            "inspectAction": "Pressure test EGR cooler at 150 kPa, smell coolant reservoir for exhaust odour",
            "tool": "Pressure test kit — 150 kPa",
            "visualSign": "White smoke from coolant overflow, exhaust smell in coolant",
        },
        {
            "id": "egr_valve_seating_issue",
            "label": "EGR valve seating failure",
            "baseProbability": 0.15,
            "physicalReasoning": "Valve seat wear or carbon buildup causes intermittent flow rather than steady reduction",
            "inspectAction": "Check EGR valve position sensor feedback, inspect valve seat for carbon deposits",
            "tool": "Diagnostic scanner for valve position",
            "visualSign": "Erratic EGR flow readings, carbon deposits on valve face",
        },
    ],
    "CAC_Direct_Leak": [
        {
            "id": "cac_core_tube_fracture",
            "label": "CAC core tube fracture",
            "baseProbability": 0.50,
            "physicalReasoning": "CAC pressure drop jumping dramatically means charge air is bypassing across the CAC core — internal tube fracture",
            "inspectAction": "Pressure test CAC at 250 kPa, look for air bubbles in coolant circuit",
            "tool": "Pressure test kit — 250 kPa",
            "visualSign": "Air bubbles in coolant reservoir, unusual coolant loss",
        },
        {
            "id": "cac_end_tank_weld_crack",
            "label": "CAC end tank weld crack",
            "baseProbability": 0.35,
            "physicalReasoning": "Weld seams on aluminium end tanks are fatigue failure points under pressure cycling",
            "inspectAction": "Inspect all weld seams on both CAC end tanks, dye penetrant on seams",
            "tool": "Dye penetrant kit",
            "visualSign": "Fine crack along weld line, slight coolant seep at weld",
        },
        {
            "id": "loose_cac_inlet_connection",
            "label": "Loose CAC inlet connection",
            "baseProbability": 0.15,
            "physicalReasoning": "Partially recovers under light load — connection gap opens and closes with pressure differential changes",
            "inspectAction": "Inspect CAC inlet hose clamp torque and hose seating",
            "tool": "Torque wrench — 10 Nm",
            "visualSign": "Hose movement under load, slight hiss from inlet",
        },
    ],
    "Minor_Intake_Leak": [
        {
            "id": "distributed_clamp_looseness",
            "label": "Multiple loose clamps (distributed)",
            "baseProbability": 0.45,
            "physicalReasoning": "Small uniform drops across ALL intake sensors with no single dominant sensor means systemic small gaps at multiple clamp points",
            "inspectAction": "Walk the entire intake path from airbox to intake manifold, check every clamp and connection sequentially",
            "tool": "Torque wrench — check spec per clamp",
            "visualSign": "No single obvious point — listen for multiple small hiss sounds",
        },
        {
            "id": "aged_rubber_intake_ducting",
            "label": "Aged or hardened rubber intake ducting",
            "baseProbability": 0.35,
            "physicalReasoning": "Rubber intake sections harden over time, developing multiple micro-gaps along their length",
            "inspectAction": "Squeeze test every rubber intake section — stiff sections need replacement",
            "tool": "None — manual squeeze test",
            "visualSign": "Surface crazing, hairline cracks on bends, hardness when squeezed",
        },
        {
            "id": "airbox_filter_housing_seal",
            "label": "Airbox or filter housing seal degradation",
            "baseProbability": 0.20,
            "physicalReasoning": "If MAF reading diverges slightly from Intake_Ambient_P, air is entering after the MAF",
            "inspectAction": "Inspect airbox lid gasket condition and filter housing seal",
            "tool": "None — visual inspection",
            "visualSign": "Compressed or missing gasket material, lid not fully sealed",
        },
    ],
}

APPROX_BASELINES = {
    "Pre_Compressor_Pressure_kPa": 99.5,
    "Post_Compressor_Pressure_kPa": 218.0,
    "Post_Compressor_Temp_C": 120.0,
    "Post_CAC_Temp_C": 52.0,
    "Exhaust_Manifold_Temp_C": 680.0,
    "Exhaust_Manifold_Pressure_kPa": 230.0,
    "Pre_Turbine_Temp_C": 650.0,
    "Post_Turbine_Pressure_kPa": 108.0,
    "Post_Turbine_Temp_C": 420.0,
    "MAF_Sensor_Reading_kgph": 720.0,
    "Turbocharger_Speed_RPM": 92000.0,
    "EGR_Flow_Rate_kgph": 58.0,
    "CAC_Pressure_Drop_kPa": 5.0,
    "Boost_Pressure_kPa": 111.7,
    "Post_CAC_Pressure_kPa": 213.0,
    "Engine_Coolant_Temp_C": 89.0,
    "EGR_Cooler_Outlet_Temp_C": 180.0,
}

INTAKE_SCENARIOS = {"Intake_PreTurbo", "Intake_PostTurbo_CAC", "Minor_Intake_Leak"}

KNOWN_LEAK_SCENARIOS = {
    "Intake_PreTurbo",
    "Intake_PostTurbo_CAC",
    "Exhaust_PreTurbine",
    "Exhaust_PostTurbine",
    "EGR_Leak",
    "CAC_Direct_Leak",
    "Minor_Intake_Leak",
}

EXHAUST_TEMP_SENSORS = {
    "Exhaust_Manifold_Temp_C",
    "Pre_Turbine_Temp_C",
    "Post_Turbine_Temp_C",
    "Exhaust_Manifold_Temp_Bank1_C",
    "Exhaust_Manifold_Temp_Bank2_C",
}

CASCADE_EXPLANATIONS = {
    "Intake_PreTurbo": (
        "Physical cascade: Gap in intake duct → atmospheric air escapes before entering compressor → "
        "less air mass reaches turbocharger inlet → Pre_Compressor_Pressure drops → turbocharger compressor "
        "has less air to compress → boost output drops proportionally → intake manifold receives less "
        "pressurised air → all downstream pressures and temperatures drop proportionally."
    ),
    "Intake_PostTurbo_CAC": (
        "Physical cascade: Gap in charge-air path between compressor and intake manifold → pressurised air "
        "(2× ambient) escapes violently → CAC pressure differential spikes because less air exits the CAC "
        "than enters → boost pressure drops → intake manifold starved of pressurised charge → power output "
        "reduced. The pre-compressor side is unaffected."
    ),
    "Exhaust_PreTurbine": (
        "Physical cascade: Gap in exhaust manifold or gasket → hot combustion gas (680°C) escapes before "
        "reaching turbine → exhaust manifold pressure drops → turbine receives less gas energy → turbine "
        "spins slower → compressor produces less boost → intake side pressures drop as secondary effect. "
        "Temperature RISES at leak point (opposite of intake leaks)."
    ),
    "Exhaust_PostTurbine": (
        "Physical cascade: Gap in exhaust pipe after turbine → exhaust gas expands through gap and COOLS "
        "(adiabatic expansion) → post-turbine pressure and temperature both drop. The turbocharger and "
        "entire engine intake/boost system is UNAFFECTED — this leak is on the outlet side only. "
        "Engine performance continues normally."
    ),
    "EGR_Leak": (
        "Physical cascade: Gap in EGR circuit → recirculated exhaust gas escapes to atmosphere instead of "
        "reaching intake manifold → EGR flow rate drops → intake mass balance error increases → combustion "
        "runs slightly leaner → exhaust temperature rises marginally. Boost pressure system is largely "
        "unaffected since leak is in the recirculation path."
    ),
    "CAC_Direct_Leak": (
        "Physical cascade: Internal CAC tube fractures → compressed charge air crosses from the high-pressure "
        "air side to the coolant side → CAC pressure drop rises dramatically → less pressurised air reaches "
        "intake manifold → boost drops → in severe cases, coolant contamination in intake can cause hydro-lock risk."
    ),
    "Minor_Intake_Leak": (
        "Physical cascade: Multiple small gaps at connection points throughout the intake path → small amounts "
        "of air escape at each gap → cumulative effect creates uniform small pressure drop across all intake "
        "sensors → no single sensor shows dominant deviation because no single failure point exists."
    ),
    "Normal": None,
}


def _build_deviation_map(top5: list[dict] | None) -> dict[str, float]:
    out: dict[str, float] = {}
    if not top5:
        return out
    for entry in top5:
        if entry and entry.get("sensor") is not None:
            out[entry["sensor"]] = float(entry.get("deviation_pct") or 0)
    return out


def _get_deviation(sensor: str, deviation_map: dict[str, float], live: dict | None) -> float | None:
    if sensor in deviation_map:
        return deviation_map[sensor]
    actual = (live or {}).get(sensor)
    baseline = APPROX_BASELINES.get(sensor)
    if actual is None or baseline is None or baseline == 0:
        return None
    return ((float(actual) - baseline) / abs(baseline)) * 100


def _clone_causes(location: str) -> list[dict]:
    template = RCA_KNOWLEDGE_BASE.get(location, [])
    return [{**c, "probability": c["baseProbability"], "disambiguationReasons": []} for c in template]


def _normalise(causes: list[dict]) -> list[dict]:
    total = sum(c["probability"] for c in causes)
    if total <= 0:
        return causes
    for c in causes:
        c["probability"] /= total
    return causes


def _dedupe_disambiguation(rules: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for rule in rules:
        label = rule.get("label", "")
        if label in seen:
            continue
        seen.add(label)
        out.append(rule)
    return out


def _redistribute_removed(causes: list[dict], removed: float, predicate, rule_label: str) -> None:
    targets = [c for c in causes if predicate(c)]
    if not targets or removed <= 0:
        return
    share = removed / len(targets)
    for c in targets:
        c["probability"] += share
        c["disambiguationReasons"].append(rule_label)


def build_cascade_explanation(leak_location: str, _shap_top5: list | None = None) -> str | None:
    return CASCADE_EXPLANATIONS.get(leak_location)


def build_shap_pattern_summary(leak_location: str, shap_top5: list | None, _live_readings: dict | None = None) -> str:
    if not shap_top5:
        return "Insufficient sensor data for pattern analysis."

    sorted_by_dev = sorted(shap_top5, key=lambda s: abs(float(s.get("deviation_pct") or 0)), reverse=True)
    primary = sorted_by_dev[0]
    secondary = sorted_by_dev[1] if len(sorted_by_dev) > 1 else None
    primary_dir = "dropped" if float(primary.get("deviation_pct") or 0) < 0 else "risen"
    primary_abs = abs(float(primary.get("deviation_pct") or 0))

    if leak_location == "Intake_PreTurbo":
        pre = next((s for s in shap_top5 if s.get("sensor") == "Pre_Compressor_Pressure_kPa"), None)
        post = next((s for s in shap_top5 if s.get("sensor") == "Post_Compressor_Pressure_kPa"), None)
        post_temp = next((s for s in shap_top5 if s.get("sensor") == "Post_Compressor_Temp_C"), None)
        if pre and post:
            amp = abs(float(post["deviation_pct"])) - abs(float(pre["deviation_pct"]))
            temp_note = ""
            if post_temp and float(post_temp["deviation_pct"]) < 0:
                temp_note = (
                    f" Post-compressor temperature has also dropped "
                    f"{abs(float(post_temp['deviation_pct'])):.1f}% — less compression heat confirms reduced air mass entering the turbo."
                )
            return (
                f"Pre-compressor pressure has dropped {abs(float(pre['deviation_pct'])):.1f}% "
                f"({float(pre['your_value']):.1f} vs baseline {float(pre['normal_baseline']):.1f} kPa), "
                f"with post-compressor pressure dropping a further {abs(float(post['deviation_pct'])):.1f}%. "
                f"The {amp:.1f}% amplification across the turbocharger — where outlet pressure drops more than inlet — "
                f"is the physical signature of a mechanical gap in the pre-turbo intake path. "
                f"The turbocharger is operating correctly but receiving insufficient inlet air.{temp_note}"
            )
        sec = f", with {secondary['sensor'].replace('_', ' ')} also deviating {abs(float(secondary['deviation_pct'])):.1f}%" if secondary else ""
        return f"{primary['sensor'].replace('_', ' ')} has {primary_dir} {primary_abs:.1f}%{sec}. The pattern indicates reduced airflow in the pre-turbo intake path."

    if leak_location == "Intake_PostTurbo_CAC":
        cac = next((s for s in shap_top5 if s.get("sensor") == "CAC_Pressure_Drop_kPa"), None)
        boost = next((s for s in shap_top5 if s.get("sensor") == "Boost_Pressure_kPa"), None)
        if cac:
            boost_note = ""
            if boost:
                boost_note = f" Boost pressure has dropped {abs(float(boost['deviation_pct'])):.1f}%, confirming less pressurised air is reaching the engine."
            return (
                f"CAC pressure drop has risen {abs(float(cac['deviation_pct'])):.1f}% above normal "
                f"({float(cac['your_value']):.1f} vs baseline {float(cac['normal_baseline']):.1f} kPa), "
                f"indicating pressurised charge air is escaping between the turbocharger compressor outlet and the intake manifold."
                f"{boost_note} The compressor inlet sensors are stable, confirming the leak is on the high-pressure charge-air side (post-compressor), not upstream."
            )
        return f"Charge air pressure anomaly detected downstream of the turbocharger. {primary['sensor'].replace('_', ' ')} has deviated {primary_abs:.1f}%, suggesting a pressurised air leak on the charge-air path."

    if leak_location == "Exhaust_PreTurbine":
        exh_p = next((s for s in shap_top5 if s.get("sensor") == "Exhaust_Manifold_Pressure_kPa"), None)
        exh_t = next((s for s in shap_top5 if s.get("sensor") == "Exhaust_Manifold_Temp_C"), None)
        if exh_p and exh_t:
            temp_dir = "risen" if float(exh_t["deviation_pct"]) > 0 else "dropped"
            return (
                f"Exhaust manifold pressure has dropped {abs(float(exh_p['deviation_pct'])):.1f}% while manifold "
                f"temperature has {temp_dir} {abs(float(exh_t['deviation_pct'])):.1f}%. This simultaneous pressure loss "
                f"and temperature {temp_dir} is the definitive physical signature of an exhaust manifold leak — hot combustion "
                f"gas is escaping before reaching the turbocharger turbine. The turbine is receiving less exhaust energy, "
                f"explaining the reduction in boost pressure. This is unambiguously an exhaust-side leak, not an intake leak."
            )
        return f"Exhaust manifold sensors show {primary_abs:.1f}% deviation in {primary['sensor'].replace('_', ' ')}. The pattern suggests exhaust gas escaping upstream of the turbocharger turbine."

    if leak_location == "Exhaust_PostTurbine":
        pt_p = next((s for s in shap_top5 if s.get("sensor") == "Post_Turbine_Pressure_kPa"), None)
        pt_t = next((s for s in shap_top5 if s.get("sensor") == "Post_Turbine_Temp_C"), None)
        if pt_p and pt_t:
            return (
                f"Post-turbine pressure has dropped {abs(float(pt_p['deviation_pct'])):.1f}% and post-turbine temperature "
                f"has dropped {abs(float(pt_t['deviation_pct'])):.1f}%. The temperature DROP (not rise) distinguishes this "
                f"from pre-turbine exhaust leaks — gas expanding through a post-turbine gap undergoes adiabatic cooling. "
                f"Engine performance sensors (boost, manifold pressure, MAF) are normal, confirming this leak is on the exhaust outlet side and not affecting engine air supply."
            )
        return f"Post-turbine sensors show {primary_abs:.1f}% deviation. The pattern indicates exhaust gas escaping downstream of the turbocharger, with engine performance largely unaffected."

    if leak_location == "EGR_Leak":
        egr = next((s for s in shap_top5 if s.get("sensor") == "EGR_Flow_Rate_kgph"), None)
        if egr:
            return (
                f"EGR flow rate has dropped {abs(float(egr['deviation_pct'])):.1f}% "
                f"({float(egr['your_value']):.1f} vs baseline {float(egr['normal_baseline']):.1f} kg/h). "
                f"This EGR flow reduction is occurring independently of boost pressure — boost pressure sensors are relatively stable, "
                f"confirming the EGR circuit itself is the source of the fault (not a cascade consequence of a boost-side leak). "
                f"Recirculated exhaust gas is escaping somewhere between the exhaust manifold and the intake manifold."
            )
        return f"EGR circuit sensors show significant deviation. {primary_abs:.1f}% drop in {primary['sensor'].replace('_', ' ')} indicates recirculated exhaust gas escaping the EGR circuit."

    if leak_location == "CAC_Direct_Leak":
        cac = next((s for s in shap_top5 if s.get("sensor") == "CAC_Pressure_Drop_kPa"), None)
        if cac:
            return (
                f"CAC internal pressure drop has risen dramatically from a normal ~5 kPa to {float(cac['your_value']):.1f} kPa — "
                f"a {abs(float(cac['deviation_pct'])):.0f}% increase. This large internal pressure drop indicates charge air is crossing "
                f"through the CAC core rather than flowing through it normally. An internal tube fracture creates a crossflow path from the "
                f"hot charge-air side to the coolant side, causing this characteristic large delta-P spike. Unlike an external CAC connection failure, this is an internal structural failure of the core."
            )
        return "CAC internal pressure differential has risen dramatically, indicating an internal CAC core failure allowing charge air to bypass through the core structure."

    if leak_location == "Minor_Intake_Leak":
        deviations = [float(s.get("deviation_pct") or 0) for s in shap_top5]
        neg = [d for d in deviations if d < 0]
        mean_dev = sum(deviations) / len(deviations)
        min_neg = min(neg) if neg else 0
        max_neg = max(neg) if neg else 0
        return (
            f"All monitored intake path sensors show a uniform {abs(mean_dev):.1f}% reduction with no single dominant sensor "
            f"(ranging {abs(min_neg):.1f}% to {abs(max_neg):.1f}%). This distributed pattern — where multiple sensors deviate equally "
            f"rather than one sensor deviating dramatically — is the signature of air escaping at multiple small gaps along the intake path, rather than one large single-point failure."
        )

    sec = f", with {secondary['sensor'].replace('_', ' ')} also deviating {abs(float(secondary['deviation_pct'])):.1f}%" if secondary else ""
    return f"{primary['sensor'].replace('_', ' ')} has {primary_dir} {primary_abs:.1f}%{sec}. Additional sensors confirm anomalous readings across the monitored air path."


def compute_rca(prediction: dict, live_readings: dict | None) -> dict:
    leak_present = prediction.get("Leak_Present")
    leak_location = prediction.get("Leak_Location") or "None"
    severity = prediction.get("Leak_Severity") or "None"
    top5 = prediction.get("top_5_sensors_driving_prediction") or []

    if not leak_present or leak_location == "None":
        return {
            "leakLocation": "None",
            "severity": "None",
            "shapPatternSummary": "No leak detected. All sensor readings are within normal operating bounds.",
            "cascadeExplanation": None,
            "rankedCauses": [],
            "disambiguationApplied": [],
            "notes": [],
            "timestamp": int(time.time() * 1000),
        }

    deviation_map = _build_deviation_map(top5)
    causes = _clone_causes(leak_location)
    if not causes:
        is_novel = (
            leak_location not in ("None", "Normal")
            and leak_location not in KNOWN_LEAK_SCENARIOS
        )
        return {
            "leakLocation": leak_location,
            "severity": severity,
            "shapPatternSummary": f"Leak detected at {leak_location} — no knowledge base entry for this location.",
            "cascadeExplanation": build_cascade_explanation(leak_location, top5),
            "rankedCauses": [],
            "isNovelAnomaly": is_novel,
            "disambiguationApplied": [],
            "notes": [],
            "timestamp": int(time.time() * 1000),
        }

    disambiguation: list[dict] = []
    notes: list[dict] = []

    def add_info(label: str, message: str) -> None:
        disambiguation.append({"label": label, "type": "info", "message": message})

    def add_warning(label: str, message: str) -> None:
        disambiguation.append({"label": label, "type": "warning", "message": message})

    # Rule 1 — intake temp signature (exhaust sensors in SHAP top 5 only)
    if leak_location in INTAKE_SCENARIOS:
        exhaust_temp_rising = any(
            entry.get("sensor") in EXHAUST_TEMP_SENSORS
            and float(entry.get("deviation_pct") or 0) > 3
            for entry in top5
            if entry
        )
        if exhaust_temp_rising:
            add_warning(
                "exhaust_temp_rise_during_intake_leak",
                "Elevated exhaust temperature alongside intake leak signature. Two possible explanations: "
                "(1) lean combustion from air restriction causing hotter exhaust — consequence of the intake leak, OR "
                "(2) simultaneous exhaust manifold leak. Complete the primary repair first, then verify exhaust temperatures have normalised.",
            )

    # Rule 2 — no thermal signature (Intake_PreTurbo)
    if leak_location == "Intake_PreTurbo":
        post_comp_t = _get_deviation("Post_Compressor_Temp_C", deviation_map, live_readings)
        post_cac_t = _get_deviation("Post_CAC_Temp_C", deviation_map, live_readings)
        exh_t = _get_deviation("Exhaust_Manifold_Temp_C", deviation_map, live_readings)
        if (
            post_comp_t is not None and post_comp_t <= 0
            and post_cac_t is not None and post_cac_t <= 0
            and exh_t is not None and exh_t <= 2
        ):
            removed = 0.0
            for c in causes:
                if "crack" in c["id"]:
                    removed += c["probability"] * 0.60
                    c["probability"] *= 0.40
                    c["disambiguationReasons"].append("no_thermal_signature_mechanical_gap_indicated")
            clamp = next((c for c in causes if c["id"] == "loose_vclamp_inlet"), None)
            boot = next((c for c in causes if c["id"] == "failed_rubber_boot"), None)
            if clamp:
                clamp["probability"] += removed * 0.70
                clamp["disambiguationReasons"].append("no_thermal_signature_mechanical_gap_indicated")
            if boot:
                boot["probability"] += removed * 0.30
                boot["disambiguationReasons"].append("no_thermal_signature_mechanical_gap_indicated")
            _normalise(causes)
            post_val = (live_readings or {}).get("Post_Compressor_Temp_C")
            base_val = APPROX_BASELINES["Post_Compressor_Temp_C"]
            add_info(
                "no_thermal_signature_mechanical_gap_indicated",
                f"Post-compressor temperature is {post_val}°C vs baseline {base_val}°C (dropping, not rising). "
                "Thermal cracks develop from heat cycling stress and produce rising temperatures near the crack. "
                "The absence of any temperature rise strongly indicates a mechanical connection failure (loose clamp or aged boot) rather than a structural crack.",
            )

    # Rule 3 — turbo amplification
    if leak_location == "Intake_PreTurbo":
        pre_p = _get_deviation("Pre_Compressor_Pressure_kPa", deviation_map, live_readings)
        post_p = _get_deviation("Post_Compressor_Pressure_kPa", deviation_map, live_readings)
        if pre_p is not None and post_p is not None and abs(post_p) - abs(pre_p) > 2:
            add_info(
                "turbo_amplification_confirms_pre_turbo_location",
                f"Post-compressor pressure dropping more than pre-compressor pressure ({abs(post_p):.1f}% vs {abs(pre_p):.1f}%) "
                "confirms the turbocharger is functioning correctly but receiving insufficient inlet air. "
                "The turbocharger amplifies the inlet air deficit — this is expected physics for a pre-turbo intake gap.",
            )

    # Rule 4 — EGR cascade consequence
    if leak_location != "EGR_Leak":
        egr = _get_deviation("EGR_Flow_Rate_kgph", deviation_map, live_readings)
        boost = _get_deviation("Boost_Pressure_kPa", deviation_map, live_readings)
        if egr is not None and -45 <= egr <= -10 and boost is not None and boost < 0:
            add_info(
                "egr_cascade_consequence",
                f"EGR flow has reduced {abs(egr):.1f}% alongside the primary leak. This is an expected consequence — "
                "EGR recirculation uses boost pressure differential as its driving force. As boost pressure recovers after repair, "
                "EGR flow will return to normal automatically. No separate EGR inspection needed unless EGR flow remains abnormal after primary repair.",
            )

    # Rule 5 — disproportionate EGR
    if leak_location != "EGR_Leak":
        egr = _get_deviation("EGR_Flow_Rate_kgph", deviation_map, live_readings)
        boost = _get_deviation("Boost_Pressure_kPa", deviation_map, live_readings)
        if egr is not None and egr < -50 and boost is not None and boost > -15:
            add_warning(
                "egr_disproportionate_possible_secondary_failure",
                f"EGR flow has dropped {abs(egr):.1f}% while boost pressure only dropped {abs(boost):.1f}%. "
                f"This disproportionate EGR reduction suggests the EGR circuit has a separate fault in addition to the primary {leak_location} leak. "
                "After primary repair, inspect the EGR system independently.",
            )

    # Rule 6 — minor severity
    if severity == "Minor":
        removed = 0.0
        for c in causes:
            if "crack" in c["id"] or "fracture" in c["id"]:
                removed += c["probability"] * 0.70
                c["probability"] *= 0.30
                c["disambiguationReasons"].append("minor_severity_mechanical_connection_not_structural")
        mech = max(
            (c for c in causes if any(k in c["id"] for k in ("clamp", "boot", "loose", "gasket", "distributed", "rubber", "seal"))),
            key=lambda c: c["probability"],
            default=None,
        )
        if mech and removed > 0:
            mech["probability"] += removed
            mech["disambiguationReasons"].append("minor_severity_mechanical_connection_not_structural")
        _normalise(causes)
        add_info(
            "minor_severity_mechanical_connection_not_structural",
            "Minor severity deviations are inconsistent with structural cracks, which typically cause sudden moderate-to-severe failures. "
            "This pattern suggests a small mechanical gap at a connection point.",
        )

    # Rule 7 — stable turbo speed
    if leak_location in ("Intake_PreTurbo", "Minor_Intake_Leak"):
        turbo = _get_deviation("Turbocharger_Speed_RPM", deviation_map, live_readings)
        pre_p = _get_deviation("Pre_Compressor_Pressure_kPa", deviation_map, live_readings)
        if turbo is not None and -2 <= turbo <= 2 and pre_p is not None and pre_p < -5:
            rpm = (live_readings or {}).get("Turbocharger_Speed_RPM")
            base = APPROX_BASELINES["Turbocharger_Speed_RPM"]
            add_info(
                "turbo_speed_stable_moderate_gap_indicated",
                f"Turbocharger speed is stable ({rpm} RPM vs {base} RPM baseline) despite pressure deviation. "
                "The leak is creating pressure loss but not severely restricting air volume — consistent with a small-to-medium gap rather than a large structural failure.",
            )

    # Scenario-specific: Intake_PostTurbo_CAC
    if leak_location == "Intake_PostTurbo_CAC":
        cac_drop = _get_deviation("CAC_Pressure_Drop_kPa", deviation_map, live_readings)
        coolant = _get_deviation("Engine_Coolant_Temp_C", deviation_map, live_readings)
        if cac_drop is not None and cac_drop > 300:
            for c in causes:
                if c["id"] == "loose_cac_outlet_clamp":
                    c["probability"] *= 0.80
                    c["disambiguationReasons"].append("cac_large_delta_p_shift")
            for c in causes:
                if c["id"] in ("cac_end_tank_crack", "cac_internal_tube_failure"):
                    c["probability"] *= 1.10
                    c["disambiguationReasons"].append("cac_large_delta_p_shift")
            _normalise(causes)
        if coolant is not None and abs(coolant) > 3:
            for c in causes:
                if c["id"] == "cac_internal_tube_failure":
                    c["probability"] *= 1.30
                    c["disambiguationReasons"].append("coolant_deviation_internal_cac")
                elif c["id"] == "cac_end_tank_crack":
                    c["probability"] *= 0.90
        elif coolant is not None:
            for c in causes:
                if c["id"] == "cac_end_tank_crack":
                    c["probability"] *= 1.20
                    c["disambiguationReasons"].append("coolant_stable_end_tank")
        _normalise(causes)

    # Scenario-specific: Exhaust_PreTurbine
    if leak_location == "Exhaust_PreTurbine":
        exh_p = _get_deviation("Exhaust_Manifold_Pressure_kPa", deviation_map, live_readings)
        exh_t = _get_deviation("Exhaust_Manifold_Temp_C", deviation_map, live_readings)
        if exh_p is not None and exh_p < -5 and exh_t is not None and exh_t > 3:
            for c in causes:
                if c["id"] == "blown_exhaust_gasket":
                    c["probability"] *= 1.05
                    c["disambiguationReasons"].append("exhaust_p_drop_t_rise_confirmed")
            _normalise(causes)

    # Scenario-specific: Exhaust_PostTurbine
    if leak_location == "Exhaust_PostTurbine":
        if severity == "Minor":
            for c in causes:
                if c["id"] == "loose_vband_turbine_outlet":
                    c["probability"] *= 1.20
                    c["disambiguationReasons"].append("minor_post_turbine_vband")
        elif severity == "Moderate":
            for c in causes:
                if c["id"] == "cracked_flex_pipe":
                    c["probability"] *= 1.15
                    c["disambiguationReasons"].append("moderate_post_turbine_flex")
        _normalise(causes)

    # Scenario-specific: EGR_Leak
    if leak_location == "EGR_Leak":
        coolant = _get_deviation("Engine_Coolant_Temp_C", deviation_map, live_readings)
        egr_out = _get_deviation("EGR_Cooler_Outlet_Temp_C", deviation_map, live_readings)
        if (coolant is not None and abs(coolant) > 3) or (egr_out is not None and abs(egr_out) > 5):
            for c in causes:
                if c["id"] == "cracked_egr_cooler":
                    c["probability"] *= 1.35
                    c["disambiguationReasons"].append("coolant_cross_contamination_egr")
            _normalise(causes)

    _normalise(causes)
    causes.sort(key=lambda c: c["probability"], reverse=True)

    top_prob = causes[0]["probability"] if causes else 0
    is_novel = (
        leak_location not in ("None", "Normal")
        and leak_location not in KNOWN_LEAK_SCENARIOS
    )
    ranked = []
    if not is_novel:
        for idx, cause in enumerate(causes[:3], start=1):
            ranked.append({
                "rank": idx,
                "label": cause["label"],
                "probability": round(cause["probability"], 3),
                "probabilityPct": f"{round(cause['probability'] * 100)}%",
                "physicalReasoning": cause["physicalReasoning"],
                "inspectAction": cause["inspectAction"],
                "tool": cause["tool"],
                "visualSign": cause["visualSign"],
                "disambiguationReasons": list(dict.fromkeys(cause.get("disambiguationReasons", []))),
            })

    return {
        "leakLocation": leak_location,
        "severity": severity,
        "shapPatternSummary": build_shap_pattern_summary(leak_location, top5, live_readings),
        "cascadeExplanation": build_cascade_explanation(leak_location, top5),
        "rankedCauses": ranked,
        "isNovelAnomaly": is_novel,
        "disambiguationApplied": _dedupe_disambiguation(disambiguation),
        "notes": notes,
        "timestamp": int(time.time() * 1000),
    }
