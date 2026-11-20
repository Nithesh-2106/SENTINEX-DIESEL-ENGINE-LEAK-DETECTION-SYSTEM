"""
Stable multi-leak display order for simulator scenarios.

When simulator noise causes per-label probabilities to flip between ticks,
pin primary/secondary to the dataset combo order for the active demo scenario.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from multilabel_targets import LEAK_LOCATIONS

# (primary_location, secondary_location) — matches dashboard MULTI_LEAK_SCENARIOS
MULTI_SCENARIO_ORDER: Dict[str, Tuple[str, str]] = {
    "intake_preturbo_egr": ("Intake_PreTurbo", "EGR_Leak"),
    "intake_postturbo_egr": ("Intake_PostTurbo_CAC", "EGR_Leak"),
    "cac_egr_combined": ("CAC_Direct_Leak", "EGR_Leak"),
    "exhaust_post_egr": ("Exhaust_PostTurbine", "EGR_Leak"),
    "exhaust_post_intake_pre": ("Exhaust_PostTurbine", "Intake_PreTurbo"),
    "exhaust_post_cac": ("Exhaust_PostTurbine", "CAC_Direct_Leak"),
    "minor_intake_egr": ("Minor_Intake_Leak", "EGR_Leak"),
}


def order_active_labels(
    active_labels: List[str],
    demo_scenario: Optional[str] = None,
) -> List[str]:
    """Return a stable display order for active leak locations."""
    if not active_labels:
        return []

    pinned = MULTI_SCENARIO_ORDER.get(demo_scenario or "")
    if pinned and all(loc in active_labels for loc in pinned):
        return [loc for loc in pinned if loc in active_labels]

    rank = {loc: i for i, loc in enumerate(LEAK_LOCATIONS)}
    return sorted(active_labels, key=lambda loc: rank.get(loc, 999))


def stabilize_multi_leak_result(
    ml_result: Dict,
    demo_scenario: Optional[str] = None,
) -> Dict:
    """
    Pin primary/secondary for known multi-leak simulator scenarios.

    Only reorders when both expected labels are active in the model output.
    """
    if not ml_result.get("Is_Multi_Leak"):
        return ml_result

    pinned = MULTI_SCENARIO_ORDER.get(demo_scenario or "")
    if not pinned:
        return ml_result

    primary, secondary = pinned
    active_set = set(ml_result.get("Active_Labels") or [])
    if primary not in active_set or secondary not in active_set:
        return ml_result

    label_probs = ml_result.get("Label_Probabilities") or {}
    out = dict(ml_result)
    out["Leak_Location"] = primary
    out["Secondary_Leak"] = secondary
    out["Active_Labels"] = [primary, secondary]
    out["Confidence_Score"] = round(
        float(label_probs.get(primary, out.get("Confidence_Score", 0.9))),
        4,
    )

    multi_block = dict(out.get("multi_leak") or {})
    multi_block["is_multi_leak"] = True
    multi_block["primary"] = primary
    multi_block["secondary"] = [
        {"scenario": secondary, "probability": float(label_probs.get(secondary, 0.85))}
    ]
    out["multi_leak"] = multi_block
    return out
