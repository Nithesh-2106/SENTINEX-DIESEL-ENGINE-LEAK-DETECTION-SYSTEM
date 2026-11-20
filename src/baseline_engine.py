"""
baseline_engine.py — Physics-based dynamic baselines for Caterpillar leak detection
===============================================================================
Provides a BaselineEngine that computes expected sensor baselines given current
operating conditions (RPM, Load, Ambient pressure, Ambient temperature).

This is used to make SHAP explanations and deviation flags *operating-point aware*
instead of comparing everything to a single hard-coded baseline at 1800 RPM / 75%.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, List, Literal, Optional

import numpy as np

logger = logging.getLogger(__name__)


DeviationSeverity = Literal["normal", "warning", "critical"]


@dataclass
class _Ref:
    """Reference constants for the baseline model (mutable per engine config)."""

    RPM_REF: float = 1800.0
    LOAD_REF: float = 75.0
    P_REF_AMBIENT: float = 101.3
    T_REF_AMBIENT: float = 32.0
    HUMIDITY_REF: float = 68.0
    MAF_REF: float = 720.0
    K1: float = 1.5867
    CPR_REF: float = 2.19
    T_REF_RISE: float = 130.0
    RPM_REF_TURBO: float = 92000.0
    T_BASE_EXHAUST: float = 906.7
    TER_REF: float = 2.01

    # Fixed component losses / ratios (design constants)
    P_PRE_COMP_FRAC: float = 0.982  # ambient → compressor inlet
    P_POST_CAC_FRAC: float = 0.977  # CAC pressure drop
    P_INTAKE_MAN_FRAC: float = 0.991  # CAC → intake manifold ducting loss
    P_EXH_MANIFOLD_FRAC: float = 1.055  # exhaust manifold pressure relative to boost region
    P_PRE_TURB_FRAC: float = 0.978
    T_POST_TURB_FRAC: float = 0.706
    P_POST_DOC_FRAC: float = 0.978
    P_POST_DPF_FRAC: float = 0.969
    P_POST_SCR_FRAC: float = 0.972
    P_TAILPIPE_FRAC: float = 1.007
    CAC_TEMP_RETAIN_FRAC: float = 0.18  # remaining temp rise after CAC
    EGR_FRAC: float = 0.0806  # EGR fraction of MAF

    # Heuristic baselines for un-modeled signals (kept consistent with prior hardcoded baselines)
    COOLANT_TEMP_REF_C: float = 88.0
    OIL_PRESSURE_REF_BAR: float = 4.2
    FUEL_FLOW_REF_KGPH: float = 42.0
    PRE_COMP_TEMP_OFFSET_C: float = 6.0  # Pre_Compressor_Temp ≈ Ambient + 6°C at reference

    # Exhaust aftertreatment temperature ratios relative to exhaust manifold at reference
    POST_DOC_TEMP_FRAC: float = 490.0 / 680.0
    POST_DPF_TEMP_FRAC: float = 470.0 / 680.0
    POST_SCR_TEMP_FRAC: float = 420.0 / 680.0

    # Misc derived conversion factor from earlier baseline logic (kept as-is)
    INTAKE_MASS_BALANCE_DIV: float = 0.296


FEATURE_COLUMNS: List[str] = [
    "Engine_Speed_Setpoint_RPM",
    "Engine_Load_Setpoint_Pct",
    "Engine_Speed_Actual_RPM",
    "Engine_Load_Actual_Pct",
    "Fuel_Flow_Rate_kgph",
    "Engine_Coolant_Temp_C",
    "Engine_Oil_Pressure_bar",
    "Ambient_Temp_C",
    "Ambient_Pressure_kPa",
    "Ambient_Humidity_Pct",
    "Intake_Ambient_Pressure_kPa",
    "MAF_Sensor_Reading_kgph",
    "Pre_Compressor_Pressure_kPa",
    "Pre_Compressor_Temp_C",
    "Post_Compressor_Pressure_kPa",
    "Post_Compressor_Temp_C",
    "Post_CAC_Pressure_kPa",
    "Post_CAC_Temp_C",
    "Intake_Manifold_Pressure_kPa",
    "Intake_Manifold_Temp_C",
    "Turbocharger_Speed_RPM",
    "Boost_Pressure_kPa",
    "Exhaust_Manifold_Pressure_kPa",
    "Exhaust_Manifold_Temp_C",
    "Pre_Turbine_Pressure_kPa",
    "Pre_Turbine_Temp_C",
    "Post_Turbine_Pressure_kPa",
    "Post_Turbine_Temp_C",
    "Post_DOC_Pressure_kPa",
    "Post_DOC_Temp_C",
    "Post_DPF_Pressure_kPa",
    "Post_DPF_Temp_C",
    "Post_SCR_Pressure_kPa",
    "Post_SCR_Temp_C",
    "Tailpipe_BackPressure_kPa",
    "EGR_Flow_Rate_kgph",
    "Intake_Mass_Balance_Error_kgph",
    "Compressor_Pressure_Ratio",
    "Turbine_Expansion_Ratio",
    "CAC_Pressure_Drop_kPa",
    "DPF_Delta_Pressure_kPa",
    "Intake_Temp_Rise_Across_CAC_C",
]


class BaselineEngine:
    """Physics-based baseline calculator for the 42 sensor features."""

    def __init__(self, engine_id: str = "CAT_C13") -> None:
        self.ref = _Ref()
        self._engine_id = engine_id
        self._apply_engine_config(engine_id)

    def _apply_engine_config(self, engine_id: str) -> None:
        """Apply engine-specific physics constants from ENGINE_REGISTRY."""
        from engine_config import get_engine

        cfg = get_engine(engine_id)
        r = self.ref
        r.RPM_REF = cfg.RPM_REF
        r.LOAD_REF = cfg.LOAD_REF
        r.P_REF_AMBIENT = cfg.P_REF_AMBIENT
        r.MAF_REF = cfg.MAF_REF
        r.K1 = cfg.K1
        r.CPR_REF = cfg.CPR_REF
        r.T_REF_RISE = cfg.T_REF_RISE
        r.RPM_REF_TURBO = cfg.RPM_REF_TURBO
        r.T_BASE_EXHAUST = cfg.T_BASE_EXHAUST
        r.TER_REF = cfg.TER_REF
        r.EGR_FRAC = cfg.EGR_FRACTION
        self._engine_id = engine_id
        logger.info("BaselineEngine configured for %s", cfg.display_name)

    def switch_engine(self, engine_id: str) -> None:
        """Switch to a different engine configuration."""
        self._apply_engine_config(engine_id)

    @property
    def current_engine(self) -> str:
        return self._engine_id

    def compute_baseline(
        self,
        rpm: float,
        load_pct: float,
        ambient_pressure_kpa: float,
        ambient_temp_c: float,
    ) -> Dict[str, float]:
        """Compute expected baseline values at the given operating point.

        Args:
            rpm: Engine speed in RPM.
            load_pct: Engine load in percent (0-100).
            ambient_pressure_kpa: Ambient pressure in kPa.
            ambient_temp_c: Ambient temperature in Celsius.

        Returns:
            Dict mapping *all 42* feature names to expected baseline values.
        """
        r = self.ref

        rpm = float(rpm)
        load_pct = float(load_pct)
        ambient_pressure_kpa = float(ambient_pressure_kpa)
        ambient_temp_c = float(ambient_temp_c)

        rpm_ratio = rpm / r.RPM_REF if r.RPM_REF else 0.0
        load_ratio = load_pct / r.LOAD_REF if r.LOAD_REF else 0.0

        # 1) Compressor Pressure Ratio (CPR) — turbo compressor work scales ~RPM^2 and load
        cpr = 1.0 + (r.K1 * (rpm_ratio**2) * (load_pct / 100.0))

        # 2) Pre-compressor pressure — inlet restriction drop
        p_pre_comp = ambient_pressure_kpa * r.P_PRE_COMP_FRAC

        # 3) Post-compressor pressure — compression raises pressure by CPR
        p_post_comp = p_pre_comp * cpr

        # 4) Post-CAC pressure — fixed pressure loss across CAC
        p_post_cac = p_post_comp * r.P_POST_CAC_FRAC

        # 5) Intake manifold pressure — small ducting loss after CAC
        p_intake_manifold = p_post_cac * r.P_INTAKE_MAN_FRAC

        # 6) Boost pressure (relative to ambient)
        boost = p_post_comp - ambient_pressure_kpa

        # 7) Post-compressor temperature — rise scales with normalized CPR rise
        t_post_comp = ambient_temp_c + (
            r.T_REF_RISE * (cpr - 1.0) / (r.CPR_REF - 1.0)
            if (r.CPR_REF - 1.0) != 0
            else 0.0
        )

        # 8) Post-CAC temperature — CAC reduces temperature rise to a fixed fraction
        t_post_cac = ambient_temp_c + ((t_post_comp - ambient_temp_c) * r.CAC_TEMP_RETAIN_FRAC)

        # 9) Turbo speed — scales with engine RPM and sqrt of pressure ratio
        turbo_rpm = r.RPM_REF_TURBO * rpm_ratio * np.sqrt(cpr / r.CPR_REF) if r.CPR_REF else 0.0

        # 10) MAF — proportional to RPM and load, adjusted by ambient pressure
        maf = (
            r.MAF_REF
            * (rpm / r.RPM_REF)
            * (load_pct / r.LOAD_REF)
            * (ambient_pressure_kpa / r.P_REF_AMBIENT)
            if (r.RPM_REF and r.LOAD_REF and r.P_REF_AMBIENT)
            else 0.0
        )

        # 11) Exhaust manifold pressure — slight multiple of boosted region pressure
        p_exh_manifold = p_post_comp * r.P_EXH_MANIFOLD_FRAC

        # 12) Exhaust manifold temperature — increases with load and weakly with RPM
        t_exh_manifold = r.T_BASE_EXHAUST * (load_pct / 100.0) * (rpm_ratio ** 0.15)

        # 13) Pre-turbine pressure — small loss from manifold to turbine inlet
        p_pre_turbine = p_exh_manifold * r.P_PRE_TURB_FRAC

        # 14) Post-turbine pressure — expansion by reference TER
        p_post_turbine = p_pre_turbine / r.TER_REF if r.TER_REF else 0.0

        # 15) Post-turbine temperature — turbine expansion cools exhaust
        t_post_turbine = t_exh_manifold * r.T_POST_TURB_FRAC

        # 16) Post-DOC pressure — aftertreatment pressure drops
        p_post_doc = p_post_turbine * r.P_POST_DOC_FRAC
        # 17) Post-DPF pressure
        p_post_dpf = p_post_doc * r.P_POST_DPF_FRAC
        # 18) Post-SCR pressure
        p_post_scr = p_post_dpf * r.P_POST_SCR_FRAC

        # 19) Tailpipe backpressure — slight above ambient
        p_tailpipe = ambient_pressure_kpa * r.P_TAILPIPE_FRAC

        # 20) EGR flow — fraction of intake air mass flow
        egr = maf * r.EGR_FRAC

        # 21) Turbine Expansion Ratio (TER) — computed from pressures
        ter = (p_pre_turbine / p_post_turbine) if p_post_turbine else r.TER_REF

        # 22) CPR actual — computed from pressures
        cpr_actual = (p_post_comp / p_pre_comp) if p_pre_comp else cpr

        # 23) CAC pressure drop — absolute delta
        cac_drop = p_post_comp - p_post_cac

        # 24) DPF delta pressure — absolute delta across DPF
        dpf_delta = p_post_doc - p_post_dpf

        # 25) Intake temp rise across CAC
        temp_rise_cac = t_post_cac - t_post_comp

        # 26) Intake mass balance error — legacy derived heuristic (kept consistent)
        mass_balance = maf - (p_intake_manifold / r.INTAKE_MASS_BALANCE_DIV)

        # Remaining sensors not explicitly governed by equations are set using
        # stable heuristics consistent with the prior static baseline.
        fuel_flow = r.FUEL_FLOW_REF_KGPH * (rpm / r.RPM_REF) * (load_pct / r.LOAD_REF) if (r.RPM_REF and r.LOAD_REF) else r.FUEL_FLOW_REF_KGPH
        coolant_temp = r.COOLANT_TEMP_REF_C
        oil_pressure = r.OIL_PRESSURE_REF_BAR * (rpm_ratio**0.2) if rpm_ratio > 0 else r.OIL_PRESSURE_REF_BAR

        pre_comp_temp = ambient_temp_c + r.PRE_COMP_TEMP_OFFSET_C
        intake_manifold_temp = t_post_cac + 3.0  # small soak/ducting rise; stable heuristic

        post_doc_temp = t_exh_manifold * r.POST_DOC_TEMP_FRAC
        post_dpf_temp = t_exh_manifold * r.POST_DPF_TEMP_FRAC
        post_scr_temp = t_exh_manifold * r.POST_SCR_TEMP_FRAC

        baseline: Dict[str, float] = {
            "Engine_Speed_Setpoint_RPM": rpm,
            "Engine_Load_Setpoint_Pct": load_pct,
            "Engine_Speed_Actual_RPM": rpm,
            "Engine_Load_Actual_Pct": load_pct,
            "Fuel_Flow_Rate_kgph": float(fuel_flow),
            "Engine_Coolant_Temp_C": float(coolant_temp),
            "Engine_Oil_Pressure_bar": float(oil_pressure),
            "Ambient_Temp_C": ambient_temp_c,
            "Ambient_Pressure_kPa": ambient_pressure_kpa,
            "Ambient_Humidity_Pct": r.HUMIDITY_REF,
            "Intake_Ambient_Pressure_kPa": ambient_pressure_kpa,
            "MAF_Sensor_Reading_kgph": float(maf),
            "Pre_Compressor_Pressure_kPa": float(p_pre_comp),
            "Pre_Compressor_Temp_C": float(pre_comp_temp),
            "Post_Compressor_Pressure_kPa": float(p_post_comp),
            "Post_Compressor_Temp_C": float(t_post_comp),
            "Post_CAC_Pressure_kPa": float(p_post_cac),
            "Post_CAC_Temp_C": float(t_post_cac),
            "Intake_Manifold_Pressure_kPa": float(p_intake_manifold),
            "Intake_Manifold_Temp_C": float(intake_manifold_temp),
            "Turbocharger_Speed_RPM": float(turbo_rpm),
            "Boost_Pressure_kPa": float(boost),
            "Exhaust_Manifold_Pressure_kPa": float(p_exh_manifold),
            "Exhaust_Manifold_Temp_C": float(t_exh_manifold),
            "Pre_Turbine_Pressure_kPa": float(p_pre_turbine),
            "Pre_Turbine_Temp_C": float(t_exh_manifold),  # turbine inlet temp approx manifold temp
            "Post_Turbine_Pressure_kPa": float(p_post_turbine),
            "Post_Turbine_Temp_C": float(t_post_turbine),
            "Post_DOC_Pressure_kPa": float(p_post_doc),
            "Post_DOC_Temp_C": float(post_doc_temp),
            "Post_DPF_Pressure_kPa": float(p_post_dpf),
            "Post_DPF_Temp_C": float(post_dpf_temp),
            "Post_SCR_Pressure_kPa": float(p_post_scr),
            "Post_SCR_Temp_C": float(post_scr_temp),
            "Tailpipe_BackPressure_kPa": float(p_tailpipe),
            "EGR_Flow_Rate_kgph": float(egr),
            "Intake_Mass_Balance_Error_kgph": float(mass_balance),
            "Compressor_Pressure_Ratio": float(cpr_actual),
            "Turbine_Expansion_Ratio": float(ter),
            "CAC_Pressure_Drop_kPa": float(cac_drop),
            "DPF_Delta_Pressure_kPa": float(dpf_delta),
            "Intake_Temp_Rise_Across_CAC_C": float(temp_rise_cac),
        }

        # Ensure completeness and stable contracts: all 42 keys always present.
        missing = [k for k in FEATURE_COLUMNS if k not in baseline]
        if missing:
            raise RuntimeError(f"BaselineEngine missing {len(missing)} feature(s): {missing}")

        return baseline

    def compute_deviation(self, actual_reading: Dict[str, float], baseline: Dict[str, float]) -> Dict[str, float]:
        """Compute % deviation of actual vs baseline for each sensor.

        Positive = above baseline, Negative = below baseline.
        """
        deviations: Dict[str, float] = {}
        for k in FEATURE_COLUMNS:
            a = float(actual_reading.get(k, np.nan))
            b = float(baseline.get(k, np.nan))
            if not np.isfinite(a) or not np.isfinite(b) or b == 0:
                deviations[k] = float("nan")
            else:
                deviations[k] = ((a - b) / abs(b)) * 100.0
        return deviations

    def classify_deviation(self, deviation_pct: float) -> DeviationSeverity:
        """Classify deviation severity by absolute deviation thresholds."""
        if not np.isfinite(deviation_pct):
            return "warning"
        x = abs(float(deviation_pct))
        if x < 2.0:
            return "normal"
        if x < 8.0:
            return "warning"
        return "critical"

    def get_anomalous_sensors(
        self,
        actual_reading: Dict[str, float],
        baseline: Dict[str, float],
        threshold_pct: float = 2.0,
    ) -> List[Dict[str, object]]:
        """Return sensors deviating beyond threshold, sorted by abs deviation descending."""
        devs = self.compute_deviation(actual_reading, baseline)
        out: List[Dict[str, object]] = []
        thr = float(threshold_pct)
        for k, dev in devs.items():
            if not np.isfinite(dev):
                continue
            if abs(dev) >= thr:
                out.append(
                    {
                        "sensor": k,
                        "actual": float(actual_reading[k]),
                        "baseline": float(baseline[k]),
                        "deviation_pct": round(float(dev), 2),
                        "severity": self.classify_deviation(float(dev)),
                    }
                )
        out.sort(key=lambda x: abs(float(x["deviation_pct"])), reverse=True)

        # EGR leak pattern: large EGR flow drop while core intake pressures stay near baseline
        intake_pressure_keys = (
            "Pre_Compressor_Pressure_kPa",
            "Post_Compressor_Pressure_kPa",
            "Post_CAC_Pressure_kPa",
            "Intake_Manifold_Pressure_kPa",
        )
        egr_dev = devs.get("EGR_Flow_Rate_kgph")
        if egr_dev is not None and np.isfinite(egr_dev) and abs(float(egr_dev)) > 20.0:
            intake_near_normal = True
            for ik in intake_pressure_keys:
                d = devs.get(ik)
                if not np.isfinite(d) or abs(float(d)) >= 3.0:
                    intake_near_normal = False
                    break
            if intake_near_normal:
                for item in out:
                    if item["sensor"] == "EGR_Flow_Rate_kgph":
                        item["annotation"] = "EGR_LEAK_PATTERN_DETECTED"

        return out


def _fmt(x: Optional[float]) -> str:
    if x is None or not np.isfinite(x):
        return "—"
    return f"{x:8.2f}"


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
    )

    be = BaselineEngine()
    r = be.ref

    # 1) Reference conditions: deviations should be ~0 if we compare baseline to itself.
    baseline_ref = be.compute_baseline(
        rpm=r.RPM_REF,
        load_pct=r.LOAD_REF,
        ambient_pressure_kpa=r.P_REF_AMBIENT,
        ambient_temp_c=r.T_REF_AMBIENT,
    )
    dev_ref = be.compute_deviation(baseline_ref, baseline_ref)
    max_abs = np.nanmax([abs(v) for v in dev_ref.values() if np.isfinite(v)])
    logger.info("Reference self-deviation max abs = %.6f%% (should be 0)", max_abs)

    # C13 reference-point calibration check (1800 RPM, 75% load, 101.3 kPa, 32°C)
    ref_check = be.compute_baseline(
        rpm=1800.0,
        load_pct=75.0,
        ambient_pressure_kpa=101.3,
        ambient_temp_c=32.0,
    )
    assert abs(ref_check["Post_Compressor_Pressure_kPa"] - 218.0) < 1.0
    assert abs(ref_check["Post_CAC_Pressure_kPa"] - 213.0) < 1.0
    assert abs(ref_check["Exhaust_Manifold_Temp_C"] - 680.0) < 1.0
    assert abs(ref_check["MAF_Sensor_Reading_kgph"] - 720.0) < 1.0
    print(
        "\nC13 reference calibration @ 1800 RPM / 75% load:\n"
        f"  Post_Compressor_P:  {ref_check['Post_Compressor_Pressure_kPa']:.1f} kPa\n"
        f"  Post_CAC_P:         {ref_check['Post_CAC_Pressure_kPa']:.1f} kPa\n"
        f"  Exhaust_Manifold_T: {ref_check['Exhaust_Manifold_Temp_C']:.1f} °C\n"
        f"  MAF:                {ref_check['MAF_Sensor_Reading_kgph']:.1f} kg/h"
    )

    # 2) Off-reference operating point: baselines shift with RPM/load.
    baseline_off = be.compute_baseline(
        rpm=1400.0,
        load_pct=60.0,
        ambient_pressure_kpa=100.0,
        ambient_temp_c=35.0,
    )
    logger.info("Off-reference: CPR=%.3f, Boost=%.2f kPa, Turbo=%.0f RPM",
                baseline_off["Compressor_Pressure_Ratio"],
                baseline_off["Boost_Pressure_kPa"],
                baseline_off["Turbocharger_Speed_RPM"])

    # 3) Simulated leak reading: inject a pre-turbo intake leak signature (pressure drops).
    leak_like = dict(baseline_ref)
    leak_like["Pre_Compressor_Pressure_kPa"] *= 0.92
    leak_like["Post_Compressor_Pressure_kPa"] *= 0.90
    leak_like["Post_CAC_Pressure_kPa"] *= 0.90
    leak_like["Intake_Manifold_Pressure_kPa"] *= 0.90
    anomalies = be.get_anomalous_sensors(leak_like, baseline_ref, threshold_pct=2.0)

    print("\nPHYSICS BASELINE COMPARISON (Reference vs Leak-like)\n")
    print(f"{'Sensor':40s} | {'Expected':>10s} | {'Actual':>10s} | {'Dev%':>8s} | Severity")
    print("-" * 86)
    for row in anomalies[:12]:
        s = str(row["sensor"])
        exp = float(row["baseline"])
        act = float(row["actual"])
        dev = float(row["deviation_pct"])
        sev = str(row["severity"])
        print(f"{s:40s} | {_fmt(exp)} | {_fmt(act)} | {dev:8.2f} | {sev}")

