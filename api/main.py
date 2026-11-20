"""
main.py — FastAPI REST API for Caterpillar Leak Detection
=========================================================
Wraps predict_leak() and explain_prediction() as HTTP endpoints
so the system can be called from dashboards, test cell monitoring
software, or any integration.

Run:
    cd caterpillar_leak_detection
    uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
"""
# pyright: reportMissingImports=false

import logging
import os
import smtplib
import sys
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Any, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# ── Ensure src/ is importable from api/ ──────────────────────────────
SRC_DIR = str(Path(__file__).resolve().parent.parent / "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

try:
    from predict import predict_leak  # type: ignore
except ImportError as e:
    raise ImportError(f"Cannot import predict module. Ensure src/predict.py exists: {e}")

try:
    from sensor_health_tracker import (  # type: ignore
        get_tracker,
        reset_tracker,
        reset_all_trackers,
    )
except ImportError as e:
    raise ImportError(
        f"Cannot import sensor_health_tracker. Ensure src/sensor_health_tracker.py exists: {e}"
    )

try:
    from api.schemas import PredictionResponse, SensorInput, ChatRequest, ValidationDemoResponse, ReportEmailRequest  # pyright: ignore[reportAttributeAccessIssue]
except ModuleNotFoundError:
    from schemas import PredictionResponse, SensorInput, ChatRequest, ValidationDemoResponse, ReportEmailRequest  # pyright: ignore[reportAttributeAccessIssue]

logger = logging.getLogger("caterpillar_api")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)

try:
    from dotenv import load_dotenv as _load_dotenv

    _load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

# ── Lifespan: warm-load the model on startup ─────────────────────────

@asynccontextmanager
async def lifespan(application: FastAPI):
    """Pre-load the ML model so the first real request isn't slow."""
    logger.info("Loading model on startup (warm-up)...")
    try:
        # Initialize dynamic baseline + steady-state guard for real-time serving.
        try:
            from steady_state_guard import SteadyStateGuard  # type: ignore
            from baseline_engine import BaselineEngine  # type: ignore
            from data_quality_pipeline import DataQualityPipeline  # type: ignore
            from sensor_fault_isolator import SensorFaultIsolator  # type: ignore
        except Exception as import_err:
            logger.error("Could not import pipeline modules: %s", import_err)
            SteadyStateGuard = None  # type: ignore[assignment]
            BaselineEngine = None  # type: ignore[assignment]
            DataQualityPipeline = None  # type: ignore[assignment]
            SensorFaultIsolator = None  # type: ignore[assignment]

        application.state.steady_state_guard = (
            SteadyStateGuard(
                window_size=10,
                rpm_tolerance_pct=2.0,
                load_tolerance_pct=2.0,
                min_steady_readings=5,
                tracking_tolerance_pct=3.0,   # was 1.0 — too strict, caused TRANSITIONING forever
                setpoint_tolerance_pct=2.5,   # was 1.5 — relaxed to match real governor droop
            )
            if SteadyStateGuard is not None
            else None
        )
        application.state.baseline_engine = BaselineEngine() if BaselineEngine is not None else None
        application.state.data_quality_pipeline = (
            DataQualityPipeline(
                window_size=20,
                spike_threshold_std=4.0,
                drift_window=10,
                drift_threshold_pct=3.0,
                smoothing_alpha=0.3,
                min_history=3,
                critical_flag_limit=5,
            )
            if DataQualityPipeline is not None
            else None
        )
        application.state.sensor_fault_isolator = (
            SensorFaultIsolator() if SensorFaultIsolator is not None else None
        )

        from predict import _load_scaler, _load_xgb_for_shap
        from inference import load_models

        load_models()
        _load_scaler()
        _load_xgb_for_shap()
        
        # 2. Warm up the prediction pipeline
        from data_quality_pipeline import NORMAL_READING
        
        dummy = SensorInput(**NORMAL_READING).model_dump()
        predict_leak(
            dummy,
            guard=None, # Bypass guard so the prediction pipeline fully executes
            baseline_engine=application.state.baseline_engine,
            dqp=application.state.data_quality_pipeline,
            sfi=application.state.sensor_fault_isolator,
        )
        logger.info("Model loaded and ready.")
    except Exception as e:
        logger.error("Model warm-up failed: %s", e)
        
    yield


# ── App ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="Caterpillar Diesel Engine Leak Detection API",
    description=(
        "Real-time intake and exhaust leak detection for diesel engine "
        "test cells. Caterpillar Tech Challenge 2026."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    from api.user_admin import chat_router as chat_router
    from api.user_admin import router as user_admin_router
except ModuleNotFoundError:
    from user_admin import chat_router as chat_router
    from user_admin import router as user_admin_router

app.include_router(user_admin_router)
app.include_router(chat_router)


# ── Endpoints ────────────────────────────────────────────────────────

_last_scenario: Dict[str, Any] = {"value": None}
_active_engine: Dict[str, Any] = {"value": "CAT_C13"}


def _reset_stateful_pipeline(guard, dqp, sfi) -> None:
    if guard is not None:
        guard.reset()
    if dqp is not None:
        dqp.reset()
    if sfi is not None:
        sfi.reset()


def _prewarm_guard(guard, sensor_dict: dict) -> None:
    """Pre-fill the guard history so it clears on the very next reading.

    Dashboard scenario buttons are intentional lab configurations, not real
    engine transients. After a scenario/engine switch we seed the guard with
    (min_steady_readings - 1) copies of the incoming reading so the window
    is already populated with stable, zero-CV data. The next real tick
    sees a full window and the guard returns is_steady=True immediately.
    """
    if guard is None:
        return
    n = max(1, guard.min_steady_readings - 1)
    for _ in range(n):
        guard.add_reading(sensor_dict)
    logger.info("Guard pre-warmed with %d seed readings.", n)


@app.get("/health", tags=["System"])
async def health_check():
    """Return API health status. Used by monitoring systems."""
    try:
        from predict import get_model_selection_metadata
        sel = get_model_selection_metadata()
        model_name = sel.get("active_model_name", "XGBoost")
    except Exception:
        model_name = "XGBoost"
    return {"status": "ok", "model": model_name, "version": "1.0.0"}


@app.get("/report/email-config", tags=["Report"])
async def report_email_config():
    """Whether SMTP is configured for session report delivery."""
    try:
        from api.report_email import smtp_public_config
    except ModuleNotFoundError:
        from report_email import smtp_public_config
    return smtp_public_config()


@app.post("/report/send-email", tags=["Report"])
async def report_send_email(payload: ReportEmailRequest):
    """Send session report PDF + summary to a recipient via SMTP."""
    try:
        from api.report_email import send_report_email, smtp_configured
    except ModuleNotFoundError:
        from report_email import send_report_email, smtp_configured

    if not smtp_configured():
        raise HTTPException(
            status_code=503,
            detail=(
                "SMTP not configured. Set SMTP_HOST, SMTP_FROM, SMTP_USER, and "
                "SMTP_PASSWORD in the project .env file (see .env.example)."
            ),
        )
    try:
        result = send_report_email(
            to_email=payload.to_email,
            subject=payload.subject,
            body_text=payload.body_text,
            pdf_base64=payload.pdf_base64,
            pdf_filename=payload.pdf_filename,
            sender_name=payload.sender_name,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except smtplib.SMTPException as exc:
        logger.exception("SMTP send failed")
        raise HTTPException(status_code=502, detail=f"SMTP delivery failed: {exc}") from exc
    except Exception as exc:
        logger.exception("Report email failed")
        raise HTTPException(status_code=500, detail="Failed to send report email") from exc


@app.get("/model-selection", tags=["Prediction"])
async def get_model_selection():
    """Return active production model and test-set accuracy comparison."""
    try:
        from predict import get_model_selection_metadata
        return get_model_selection_metadata()
    except Exception as e:
        logger.error("Model selection lookup failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post(
    "/predict",
    response_model=PredictionResponse,
    tags=["Prediction"],
    summary="Predict leak from 42 sensor readings with SHAP explanation",
)
def predict(sensor_input: SensorInput):
    """Run the ML model on a single set of sensor measurements.

    Returns leak presence, location, severity, recommended action,
    confidence score, and the top 5 sensors that most influenced
    the Leak_Location decision (SHAP explainability built-in).
    """
    logger.info("Prediction request received.")
    try:
        sensor_dict = sensor_input.model_dump()
        demo_scenario = sensor_dict.pop("demo_scenario", None)
        requested_engine = sensor_dict.pop("engine_id", "CAT_C13") or "CAT_C13"

        current_scenario = demo_scenario if demo_scenario else "normal"
        guard = getattr(app.state, "steady_state_guard", None)
        dqp = getattr(app.state, "data_quality_pipeline", None)
        sfi = getattr(app.state, "sensor_fault_isolator", None)
        baseline_engine = getattr(app.state, "baseline_engine", None)

        scenario_changed = current_scenario != _last_scenario["value"]
        engine_changed = requested_engine != _active_engine["value"]

        if scenario_changed:
            _reset_stateful_pipeline(guard, dqp, sfi)
            reset_tracker(requested_engine)
            _last_scenario["value"] = current_scenario
            logger.info(
                "Scenario changed to '%s' — all stateful components reset.",
                current_scenario,
            )
            _prewarm_guard(guard, sensor_dict)

        if engine_changed:
            if baseline_engine is not None:
                baseline_engine.switch_engine(requested_engine)
            _reset_stateful_pipeline(guard, dqp, sfi)
            reset_tracker(requested_engine)
            _active_engine["value"] = requested_engine
            logger.info(
                "Engine switched to '%s' — all stateful components reset.",
                requested_engine,
            )
            _prewarm_guard(guard, sensor_dict)

        # Manual sensor input is a one-shot lab reading — seed SSG so ML/SFI run
        # immediately instead of suppressing for insufficient guard history.
        if current_scenario == "manual_input" and guard is not None:
            guard.reset()
            _prewarm_guard(guard, sensor_dict)

        result = predict_leak(
            sensor_dict,
            guard=guard,
            baseline_engine=baseline_engine,
            dqp=dqp,
            sfi=sfi,
            demo_scenario=demo_scenario,
            engine_id=requested_engine,
        )

        sfi_faults: Dict[str, str] = {}
        sfi_meta = result.get("Sensor_Fault_Isolation") or {}
        if isinstance(sfi_meta, dict) and sfi_meta.get("faulty_sensor"):
            faulty = sfi_meta["faulty_sensor"]
            sfi_faults[faulty] = (
                sfi_meta.get("fault_reason")
                or sfi_meta.get("fault_type")
                or "SFI"
            )

        tracker = get_tracker(requested_engine)
        tracker.update(
            readings=sensor_dict,
            sfi_faults=sfi_faults,
            prediction=result,
        )

        logger.info(
            "Prediction: Leak=%d  Location=%s  Confidence=%.4f",
            result["Leak_Present"],
            result["Leak_Location"],
            result["Confidence_Score"],
        )
        return PredictionResponse(**result)
    except Exception as e:
        logger.error("Prediction failed: %s", e)
        raise HTTPException(status_code=422, detail=str(e))


@app.get("/sensor-health", tags=["System"])
async def get_sensor_health():
    """Return per-sensor divergence health from correlation tracking."""
    sfi = getattr(app.state, "sensor_fault_isolator", None)
    if sfi is None:
        return {
            "sensor_health": {},
            "baseline_locked": False,
            "history_length": 0,
            "description": "Sensor fault isolator not initialised.",
        }

    return {
        "sensor_health": sfi.get_health_report(),
        "fault_persistence": sfi.get_fault_persistence_report(),
        "baseline_locked": sfi._baseline_locked,
        "history_length": len(sfi._reading_history),
    }


@app.get("/sensor-health/{engine_id}", tags=["System"])
async def get_sensor_health_by_engine(engine_id: str):
    """
    Returns current sensor health summary for an engine.
    Called by frontend every 2 seconds when health dashboard is active.
    """
    valid_engines = ["CAT_C7", "CAT_C13", "CAT_C15"]
    if engine_id not in valid_engines:
        return {"error": f"Unknown engine: {engine_id}"}

    tracker = get_tracker(engine_id)
    return tracker.get_summary()


@app.post("/sensor-health/reset/{engine_id}", tags=["System"])
async def reset_sensor_health(engine_id: str):
    """Resets sensor health history for an engine when streaming restarts."""
    valid_engines = ["CAT_C7", "CAT_C13", "CAT_C15"]
    if engine_id not in valid_engines:
        return {"error": f"Unknown engine: {engine_id}"}

    reset_tracker(engine_id)
    return {"status": "reset", "engine_id": engine_id}


@app.get("/engines", tags=["Reference"])
async def list_engines():
    """Return all available engine configurations."""
    from engine_config import get_all_engines  # type: ignore

    return {
        "engines": get_all_engines(),
        "active_engine": _active_engine["value"],
    }


@app.get("/engine-baseline", tags=["Reference"])
async def get_engine_baseline(engine_id: str = "CAT_C13"):
    """Return physics-computed sensor baselines for an engine."""
    from baseline_contract import resolve_pipeline_baselines  # type: ignore
    from engine_config import compute_engine_baselines, get_engine  # type: ignore

    cfg = get_engine(engine_id)
    baselines = compute_engine_baselines(engine_id)
    pipeline_baselines = resolve_pipeline_baselines(engine_id)
    return {
        "engine_id": engine_id,
        "display_name": cfg.display_name,
        "baselines": baselines,
        "pipeline_baselines": pipeline_baselines,
        "has_scr": cfg.has_scr,
        "description": (
            f"Expected sensor values for {cfg.display_name} at "
            f"{cfg.RPM_REF:.0f} RPM, {cfg.LOAD_REF:.0f}% load, "
            f"101.3 kPa ambient."
        ),
    }


@app.post("/engine/switch", tags=["Reference"])
async def switch_engine(engine_id: str):
    """Switch active engine and reset stateful pipeline components."""
    from baseline_contract import resolve_pipeline_baselines  # type: ignore
    from engine_config import ENGINE_REGISTRY  # type: ignore

    if engine_id not in ENGINE_REGISTRY:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unknown engine '{engine_id}'. "
                f"Valid: {list(ENGINE_REGISTRY.keys())}"
            ),
        )

    baseline_engine = getattr(app.state, "baseline_engine", None)
    guard = getattr(app.state, "steady_state_guard", None)
    dqp = getattr(app.state, "data_quality_pipeline", None)
    sfi = getattr(app.state, "sensor_fault_isolator", None)

    if baseline_engine is not None:
        baseline_engine.switch_engine(engine_id)
    _reset_stateful_pipeline(guard, dqp, sfi)
    _active_engine["value"] = engine_id

    new_baselines = resolve_pipeline_baselines(engine_id)
    c13_baselines = resolve_pipeline_baselines("CAT_C13")

    logger.info("Engine switched to '%s'", engine_id)
    return {
        "success": True,
        "engine_id": engine_id,
        "key_changes": {
            "MAF_ref_kgph": new_baselines["MAF_Sensor_Reading_kgph"],
            "Post_Compressor_P_kPa": new_baselines["Post_Compressor_Pressure_kPa"],
            "Exhaust_Manifold_T_C": new_baselines["Exhaust_Manifold_Temp_C"],
            "Boost_P_kPa": new_baselines["Boost_Pressure_kPa"],
            "Turbo_RPM": new_baselines["Turbocharger_Speed_RPM"],
            "previous_MAF_ref_kgph": c13_baselines["MAF_Sensor_Reading_kgph"],
            "previous_Boost_P_kPa": c13_baselines["Boost_Pressure_kPa"],
        },
    }


@app.post(
    "/validation-demo/run",
    response_model=ValidationDemoResponse,
    tags=["Reference"],
    summary="Run clean validation demo (15 scenarios: 8 single + 7 multi-leak)",
)
async def run_validation_demo():
    """
    Predict on 15 representative clean readings — one per single-leak scenario
    (including normal) plus one per multi-leak combination. Intended for
    judge-facing live demos.
    """
    try:
        from validate_scenarios import run_clean_validation_demo  # type: ignore
    except ImportError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Validation module unavailable: {e}",
        ) from e

    try:
        return run_clean_validation_demo()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        logger.exception("Validation demo failed")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get(
    "/scenarios",
    response_model=List[dict],
    tags=["Reference"],
    summary="List all leak scenario definitions",
)
async def get_scenarios():
    """Return all leak scenario definitions (8 scenarios including normal).

    Static reference data — useful for frontend dashboards and
    documentation.
    """
    return [
        {
            "scenario": "Normal",
            "leak_present": 0,
            "description": (
                "Engine operating within normal parameters. "
                "No leak detected."
            ),
            "recommended_action": "Continue_Testing",
        },
        {
            "scenario": "Intake_PreTurbo",
            "leak_present": 1,
            "description": (
                "Air leak between airflow meter and turbocharger "
                "compressor inlet. Pre-compressor pressure drops "
                "while MAF reads normal."
            ),
            "recommended_action": "Pause_Test_Inspect_Component",
        },
        {
            "scenario": "Intake_PostCAC",
            "leak_present": 1,
            "description": (
                "Leak in the charge air cooler outlet piping or "
                "intake manifold connections. Boost pressure is "
                "reduced downstream of the CAC."
            ),
            "recommended_action": "Pause_Test_Inspect_Component",
        },
        {
            "scenario": "Exhaust_PreTurbine",
            "leak_present": 1,
            "description": (
                "Exhaust gas leak between the exhaust manifold "
                "and turbine inlet. Pre-turbine pressure drops "
                "and exhaust manifold temperature rises."
            ),
            "recommended_action": "Stop_Test_Immediate_Repair",
        },
        {
            "scenario": "Exhaust_PostDPF",
            "leak_present": 1,
            "description": (
                "Leak downstream of the diesel particulate filter. "
                "Post-DPF and post-SCR pressures are lower than "
                "expected; back-pressure decreases."
            ),
            "recommended_action": "Schedule_Maintenance",
        },
        {
            "scenario": "EGR_Leak",
            "leak_present": 1,
            "description": (
                "EGR pipe crack — exhaust gas escapes before reaching intake manifold. "
                "Primary signature: EGR flow rate drops ~34% while intake pressures "
                "remain near normal."
            ),
            "primary_sensor": "EGR_Flow_Rate_kgph",
            "recommended_action": "Pause_Test_Inspect_Component",
        },
        {
            "scenario": "CAC_Direct_Leak",
            "leak_present": 1,
            "description": (
                "Charge Air Cooler body crack — compressed air escapes from cooler. "
                "Primary signature: CAC pressure drop spikes from 5 kPa to ~26 kPa while "
                "post-compressor pressure stays normal."
            ),
            "primary_sensor": "CAC_Pressure_Drop_kPa",
            "recommended_action": "Pause_Test_Inspect_Component",
        },
        {
            "scenario": "Minor_Intake_Leak",
            "leak_present": 1,
            "description": (
                "Hairline crack in intake pre-turbo section — early stage subtle leak. "
                "Signature: all intake pressures drop ~3–4% consistently. "
                "Tests early detection capability."
            ),
            "primary_sensor": "Pre_Compressor_Pressure_kPa",
            "recommended_action": "Flag_and_Monitor",
        },
    ]


@app.get(
    "/steady-state",
    tags=["System"],
    summary="Get current steady-state guard metrics",
)
async def steady_state_status():
    guard = getattr(app.state, "steady_state_guard", None)
    if guard is None:
        return {
            "is_steady": True,
            "reason": "SteadyStateGuard not initialized",
            "rpm_cv_pct": 0.0,
            "load_cv_pct": 0.0,
            "readings_in_window": 0,
            "steady_duration_readings": 0,
        }
    return guard.get_steady_state_metrics()


@app.get("/data-quality", tags=["System"], summary="Data quality pipeline statistics")
async def get_data_quality():
    """Return real-time DQP statistics for dashboard monitoring."""
    dqp = getattr(app.state, "data_quality_pipeline", None)
    if dqp is None:
        return {
            "pipeline_stats": {
                "total_readings_processed": 0,
                "total_flags_raised": 0,
                "history_length": 0,
                "flag_rate_pct": 0.0,
            },
            "description": "DataQualityPipeline not initialized",
        }
    return {
        "pipeline_stats": dqp.get_stats(),
        "description": (
            "Real-time sensor data quality monitoring. "
            "Tracks spikes, drift, missing values, and HF noise "
            "across all 42 sensor channels."
        ),
    }


@app.get("/sensor-fault-map", tags=["Reference"], summary="Sensor dependency map for fault isolation")
async def get_sensor_fault_map():
    """
    Returns the sensor dependency map used by the Sensor Fault Isolator.
    Shows which sensors must deviate together to confirm a genuine leak
    vs an isolated sensor fault.
    """
    from sensor_fault_isolator import SENSOR_DEPENDENCY_MAP  # type: ignore

    return {
        "description": (
            "Sensor dependency map used by the "
            "Sensor Fault Isolator. For each leak "
            "location, shows which sensors must "
            "deviate together to confirm a genuine "
            "leak vs isolated sensor fault."
        ),
        "scenarios": {
            location: {
                "primary_sensors": dep["primary"],
                "correlated_sensors": dep["correlated"],
                "min_correlated": dep["min_correlated_deviating"],
                "deviation_threshold_pct": dep["deviation_threshold_pct"],
                "physical_explanation": dep["physical_explanation"],
            }
            for location, dep in SENSOR_DEPENDENCY_MAP.items()
            if location != "None"
        },
    }


@app.post("/data-quality/reset", tags=["System"], summary="Reset DQP and steady-state history")
async def reset_data_quality():
    """Reset pipeline state when scenario or engine configuration changes."""
    dqp = getattr(app.state, "data_quality_pipeline", None)
    guard = getattr(app.state, "steady_state_guard", None)
    if dqp is not None:
        dqp.reset()
    if guard is not None and hasattr(guard, "reset"):
        guard.reset()
    return {"status": "reset", "message": "DQP and steady-state guard cleared."}


@app.get(
    "/baseline",
    tags=["Reference"],
    summary="Compute physics-based baseline for an operating point",
)
async def baseline_query(rpm: float, load: float, ambient_pressure: float, ambient_temp: float):
    engine = getattr(app.state, "baseline_engine", None)
    if engine is None:
        raise HTTPException(status_code=503, detail="BaselineEngine not initialized")
    return engine.compute_baseline(
        rpm=float(rpm),
        load_pct=float(load),
        ambient_pressure_kpa=float(ambient_pressure),
        ambient_temp_c=float(ambient_temp),
    )


# ── /chat endpoint ──────────────────────────────────────────────────────────
# Load .env so ANTHROPIC_API_KEY is available when running locally.
try:
    from dotenv import load_dotenv as _load_dotenv
    _load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass  # python-dotenv not installed — rely on shell env


SYSTEM_PROMPT = """You are ARIA — the AI explanation layer for SENTINEX, an AI-powered 
diesel engine leak detection platform. Tagline: SENTINEX detects. ARIA explains.

You are embedded inside a live diagnostic dashboard monitoring a CAT diesel 
engine test cell (Caterpillar Tech Challenge 2026, PS3).

YOUR IDENTITY:
You are ARIA, a senior engine diagnostics copilot with deep expertise in 
diesel engine air path physics, turbocharger systems, EGR circuits, and 
aftertreatment systems. You translate SENTINEX ML outputs (leak predictions, 
SHAP, RCA, federated learning metrics) into clear field-engineer guidance. 
Speak like a practical field engineer — clear, direct, no jargon unless the 
engineer already uses it. Be concise. Engineers want answers, not essays. 
Maximum 200 words unless detail is explicitly requested.

ENGINE AIR PATH:
INTAKE: Outside Air → MAF Sensor → Turbocharger Compressor → 
        Charge Air Cooler (CAC) → Intake Manifold → Engine
EXHAUST: Engine → Exhaust Manifold → Turbocharger Turbine → 
         DOC → DPF → SCR → Tailpipe
EGR: Exhaust Manifold → EGR Cooler → Intake Manifold

THE 8 MONITORED LEAK SCENARIOS:
0: Normal — no leak
1: Intake_PreTurbo — upstream of compressor — Moderate
2: Intake_PostTurbo_CAC — between compressor and CAC — Moderate
3: Exhaust_PreTurbine — exhaust manifold area — Moderate
4: Exhaust_PostTurbine — downstream of turbine — Minor
5: EGR_Leak — EGR circuit — Moderate
6: CAC_Direct_Leak — inside CAC — Moderate
7: Minor_Intake_Leak — distributed small intake drop — Minor

MULTI-LEAK SCENARIOS (two independent failure modes simultaneously):
When Is_Multi_Leak is true or Active_Leak_Details has 2+ entries, you MUST:
- Explain BOTH leaks separately — do not collapse into a single diagnosis
- Use the PRIMARY location for the highest-probability / first-listed leak
- Use the SECONDARY location for the co-occurring independent failure
- Provide separate RCA, SHAP drivers, and inspection steps for EACH leak
- Note these are physically independent — both require inspection
- EGR cascade rules still apply per-leak: EGR drop during intake/exhaust leak
  at another location is a consequence, not automatic co-failure
Common combos: Intake+CAC+EGR, Exhaust Post+Intake Pre, Exhaust Post+CAC Direct, etc.

C13 NORMAL BASELINES (1800 RPM, 75% load):
Pre_Compressor_Pressure_kPa: 99.5
Post_Compressor_Pressure_kPa: 218.0
Post_CAC_Pressure_kPa: 213.0
Boost_Pressure_kPa: 111.7
Exhaust_Manifold_Pressure_kPa: 230.0
Exhaust_Manifold_Temp_C: 680.0
EGR_Flow_Rate_kgph: 58.0
CAC_Pressure_Drop_kPa: 5.0
Turbocharger_Speed_RPM: 92000

SHAP vs ROOT CAUSE:
SHAP answers: Which sensors are deviating and by how much?
Root Cause answers: Why are those sensors deviating physically?
SHAP is data-level. Root Cause is engineering-level diagnosis.
When asked why a leak happened, use the RCA block in the context, 
not the SHAP values.

RCA KNOWLEDGE — PHYSICALLY CORRECT RULES:

SHAP vs ROOT CAUSE distinction:
  SHAP answers: "Which sensors are deviating and by how much?"
  RCA answers: "Why are those sensors deviating physically?"
  They are different questions requiring different answers.

CRITICAL RULE — EGR during non-EGR leaks:
  If EGR flow drops during an intake or exhaust leak prediction,
  this is a NORMAL PHYSICAL CONSEQUENCE, not a co-failure.
  EGR recirculation uses boost pressure differential as its
  driving force. When boost drops, EGR drops proportionally.
  NEVER tell an engineer to inspect the EGR circuit as a
  primary concern when the primary leak is intake or exhaust.
  ONLY flag EGR as a secondary concern if EGR drops more
  than 50% while boost drops less than 15% — that
  disproportionate drop indicates a genuine EGR fault.

TEMPERATURE RULES FOR SCENARIO IDENTIFICATION:
  Temperatures DROPPING throughout the air path:
    → Intake leak (less compression work = less heat)
  Temperatures RISING in exhaust sensors:
    → Exhaust pre-turbine leak (hot gas escaping)
  Temperatures DROPPING in post-turbine sensors:
    → Exhaust post-turbine leak (gas expanding = cooling)
  Temperatures STABLE with flow reduction:
    → EGR leak (EGR circuit isolated from main air path)

TURBOCHARGER AMPLIFICATION:
  For pre-turbo intake leaks, post-compressor pressure
  always drops MORE than pre-compressor pressure.
  This is physics — the turbo multiplies the air deficit.
  If a judge asks why both drop, explain this amplification.
  It is NOT evidence of turbocharger failure.

PROBABILITY REASONING when answering judge questions:
  Loose clamp/boot: high probability when NO temperature anomaly
  Structural crack: lower probability without temperature anomaly
    because cracks develop from thermal stress (heat cycling)
    and should leave a thermal signature
  Minor severity: almost never a crack — cracks don't partially fail
  Moderate severity without temp rise: clamp or boot

When asked "why is [cause] at [X]%?":
  Explain the specific sensor pattern that drove that probability.
  Reference actual deviation percentages from the context.
  Explain which disambiguation rules fired and why.
  Never just say "based on the model" — explain the physics.

7-STAGE PIPELINE:
Stage 1 DQP: 5-stage sensor cleaning — bounds check, null imputation, 
  spike detection (Z>4σ), EMA smoothing (α=0.3), drift detection. 
  CASCADE PROTECTION prevents cleaning genuine multi-sensor leak signatures.
Stage 2 SSG: Suppresses detection during RPM/load transitions. 
  RPM CV <2%, Load CV <2%. Prevents false alarms during engine changes.
Stage 3 XGBoost + SHAP: 300 estimators, lr=0.05, max_depth=6. 
  MultiOutput — predicts Leak_Present, Location, Severity, Action 
  simultaneously. SHAP TreeExplainer gives exact feature attributions.
Stage 4 SHAP: Top 5 sensors with deviation % and interpretation.
Stage 5 SFI: 3 mechanisms — health divergence tracking (session baseline 
  locked at start, never changes), DQP flag integration, physics cascade 
  check. Distinguishes real leaks from sensor hardware faults.
Stage 6 Dynamic Baseline: Physics equations compute expected values at 
  any RPM/load/ambient. K1=1.5867, T_BASE_EXHAUST=906.7°C calibrated.
Stage 7 FastAPI + React: REST endpoints + real-time streaming dashboard.

MULTI-ENGINE SUPPORT:
C7: 7.2L, 168-224 kW, 2000 RPM ref, MAF 520 kg/h, No SCR
C13: 12.5L, 287-388 kW, 1800 RPM ref, MAF 720 kg/h, Full AFT
C15: 15.2L, 354-433 kW, 1800 RPM ref, MAF 865 kg/h, Full AFT
Non-C13 engines use translate_to_c13_frame() before ML inference.

THRESHOLD MODES:
Safety τ=0.25: catches 99%+ leaks — for emissions certification runs
Efficiency τ=0.65: 3.2% false alarm rate — routine endurance testing

COMPETITION CONTEXT:
Caterpillar Tech Challenge 2026, PS3. TOP 10 national finalists from 
1500+ teams. Grand Finale 26 June 2026, Caterpillar India Bengaluru.
Problem solved: test cell leaks cause 1 day to 1 week downtime, 
previously 100% manual detection. This system automates it with 
zero new hardware, pure software on existing sensor channels.

RESPONSE FORMATTING (MANDATORY):
You are rendering inside a React chat UI that parses GitHub-Flavored Markdown.
Use this EXACT structure for EVERY answer (no exceptions):

## Verdict
**[One sentence — the direct answer. Bold the critical word.]**

## Key Points
- [Bullet 1 — one idea, include sensor values in backticks like `93.8 kPa`]
- [Bullet 2]
- [Bullet 3 — max 4 bullets total]

## Recommended Action
- [1–2 specific next steps for the test cell operator]

FORMATTING RULES:
- Max 120 words for operational questions (leaks, sensors, actions).
- Max 200 words only if user explicitly asks for deep detail or pipeline explanation.
- NO opening fluff ("Sure", "Great question", "Let me explain").
- NO long paragraphs — bullets only after the Verdict line.
- Use `##` headings exactly as shown (Verdict, Key Points, Recommended Action).
- Bold **critical terms** and wrap sensor values in backticks.
- Leave a blank line between sections.

MERMAID DIAGRAMS (only when user asks about pipeline / 7-stage / process flow):
```mermaid
flowchart LR
    A["Stage 1"] --> B["Stage 2"]
```
Always double-quote node labels. No special characters inside labels.

RESPONSE LENGTH & STYLE:
- Summarized, scannable, engineer-friendly.
- Each bullet = one fact or one action.
- Lead with the Verdict — answer the question in the first line.

CONTENT RULES:
- For RCA questions: give ranked causes with %, inspect step, tool needed.
- For SHAP questions: explain each sensor deviation physically.
- NEVER write "The system is currently paused" or mention the streaming state.
- For inspect steps: be specific — which joint, which torque spec, which visual sign.
- If no live state is available, answer from general engineering knowledge and state that clearly.
- Never guess sensor values — use only numbers from the live context block above.

FEDERATED LEARNING TAB — KEY METRICS EXPLANATION:

When a judge asks about the -0.35pp delta or "why is the global
model worse than local":
  "The -0.35pp figure compares the global model to each facility's
  performance on its OWN local test data. This comparison is
  misleading in isolation. The correct FL metric is cross-facility
  performance — how well does a single facility's model perform
  on data from OTHER facilities? Before federation, the best
  single-facility model achieves [X]% on combined cross-facility
  data. After federation, the global model achieves [Y]% on the
  same data. The improvement is +[Z]pp. This is the FL benefit —
  it makes the model robust across all facility conditions, not
  just the one it was trained on."

When a judge asks "all three models show 100% — is that real":
  "The simulated facility datasets are derived from the same
  physics-consistent C13 dataset with facility-specific
  transformations (altitude pressure scaling, humidity factors,
  scenario rebalancing). All three models achieve high accuracy
  on their own data because the core leak signatures are
  physics-consistent across facilities. The cross-facility
  challenge is not signature recognition — it is handling
  facility-specific ambient condition differences (Pune's
  altitude-shifted baselines vs Hosur's humidity-inflated
  readings). This is accurately reflected in the cross-facility
  metric, not the local metric."
"""

def build_dynamic_context(request: "ChatRequest") -> str:  # type: ignore[name-defined]
    """Builds the live state context block injected before each message."""

    lines = ["=" * 50]
    lines.append("CURRENT LIVE SYSTEM STATE")
    lines.append("=" * 50)

    p = request.current_prediction

    if not p:
        lines.append("System State: NOT STREAMING (engine paused or data feed stopped)")
        lines.append("Live sensor data is not available at this moment.")
        # Still include live readings if available even without prediction
        if request.live_readings:
            r = request.live_readings
            lines.append("")
            lines.append("LAST KNOWN LIVE SENSOR READINGS:")
            key_sensors = [
                ("Pre_Compressor_Pressure_kPa", 99.5),
                ("Post_Compressor_Pressure_kPa", 218.0),
                ("Boost_Pressure_kPa", 111.7),
                ("CAC_Pressure_Drop_kPa", 5.0),
                ("Exhaust_Manifold_Pressure_kPa", 230.0),
                ("Exhaust_Manifold_Temp_C", 680.0),
                ("EGR_Flow_Rate_kgph", 58.0),
                ("Turbocharger_Speed_RPM", 92000),
            ]
            for sensor, normal in key_sensors:
                val = r.get(sensor)
                if val is not None:
                    try:
                        dev = ((float(val) - normal) / normal) * 100
                        lines.append(f"  {sensor}: {float(val):.1f} (normal: {normal}, dev: {dev:+.1f}%)")
                    except (TypeError, ValueError):
                        lines.append(f"  {sensor}: {val}")
    else:
        # System state
        if p.get("Suppressed"):
            state = "TRANSITIONING"
        elif (p.get("Sensor_Fault_Isolation") or {}).get("is_sensor_fault"):
            state = "SENSOR_FAULT"
        elif p.get("Leak_Present") == 1:
            if p.get("Is_Multi_Leak") or (p.get("Multi_Pattern") or {}).get("is_multi_leak"):
                state = "MULTI_LEAK_DETECTED"
            else:
                state = "LEAK_DETECTED"
        elif (p.get("Data_Quality") or {}).get("score", 100) < 90:
            state = "DATA_CLEANED"
        else:
            state = "NORMAL"

        lines.append(f"Engine: {request.engine_id}")
        lines.append(f"System State: {state}")
        lines.append(f"Suppressed: {p.get('Suppressed', False)}")
        if p.get("Suppression_Reason"):
            lines.append(f"Suppression Reason: {p['Suppression_Reason']}")

        lines.append("")
        lines.append("PREDICTION:")
        lines.append(f"  Leak Present: {p.get('Leak_Present', 0)}")
        lines.append(f"  Leak Location: {p.get('Leak_Location', 'None')}")
        lines.append(f"  Severity: {p.get('Leak_Severity', 'None')}")
        lines.append(f"  Recommended Action: {p.get('Recommended_Action', 'Continue_Testing')}")
        lines.append(f"  Confidence: {p.get('Confidence_Score', 0) * 100:.2f}%")

    if p:
        # SHAP top 5
        shap_sensors = p.get("top_5_sensors_driving_prediction", [])
        if shap_sensors:
            lines.append("")
            lines.append("SHAP — TOP 5 SENSORS:")
            for i, s in enumerate(shap_sensors, 1):
                lines.append(
                    f"  {i}. {s.get('sensor', 'Unknown')}: value={s.get('your_value', 0):.1f}, "
                    f"baseline={s.get('normal_baseline', 0):.1f}, "
                    f"deviation={s.get('deviation_pct', 0):+.1f}%, "
                    f"SHAP impact={s.get('shap_impact', 0):.3f}"
                )
                lines.append(f"     Interpretation: {s.get('interpretation', 'N/A')}")

        # Key live readings (if streaming, otherwise already handled above)
        if request.live_readings:
            r = request.live_readings
            lines.append("")
            lines.append("KEY LIVE SENSOR READINGS:")
            key_sensors = [
                ("Pre_Compressor_Pressure_kPa", 99.5),
                ("Post_Compressor_Pressure_kPa", 218.0),
                ("Boost_Pressure_kPa", 111.7),
                ("CAC_Pressure_Drop_kPa", 5.0),
                ("Exhaust_Manifold_Pressure_kPa", 230.0),
                ("Exhaust_Manifold_Temp_C", 680.0),
                ("EGR_Flow_Rate_kgph", 58.0),
                ("Turbocharger_Speed_RPM", 92000),
            ]
            for sensor, normal in key_sensors:
                val = r.get(sensor)
                if val is not None:
                    dev = ((val - normal) / normal) * 100
                    lines.append(f"  {sensor}: {val:.1f} (normal: {normal}, dev: {dev:+.1f}%)")

        # DQP
        dqp = p.get("Data_Quality", {})
        if dqp:
            lines.append("")
            lines.append(
                f"DATA QUALITY: score={dqp.get('score', 100)}/100, "
                f"usable={dqp.get('is_usable', True)}"
            )
            if dqp.get("summary"):
                lines.append(f"  Flags: {dqp['summary']}")

        # SFI
        sfi = p.get("Sensor_Fault_Isolation", {})
        if sfi:
            lines.append("")
            lines.append("SENSOR FAULT ISOLATION:")
            lines.append(f"  Is Sensor Fault: {sfi.get('is_sensor_fault', False)}")
            lines.append(f"  Is Confirmed Leak: {sfi.get('is_confirmed_leak', False)}")
            lines.append(
                f"  Correlated Deviating: {sfi.get('correlated_deviating', 0)} "
                f"/ Required: {sfi.get('correlated_required', 2)}"
            )
            if sfi.get("fault_reason"):
                lines.append(f"  Fault Reason: {sfi['fault_reason']}")

        # Multi-label leak details (unified RF multilabel pipeline)
        multi = p.get("Multi_Pattern", {})
        active_details = p.get("Active_Leak_Details") or multi.get("active_leak_details") or []
        if p.get("Is_Multi_Leak") or (multi.get("is_multi_leak") and len(active_details) >= 2):
            lines.append("")
            lines.append("=== MULTI-LEAK DETECTED ===")
            lines.append(
                "LLM INSTRUCTION: Two independent failure modes are active. "
                "Address PRIMARY and SECONDARY separately with distinct RCA and inspection."
            )
            if multi.get("combo_label"):
                lines.append(f"  Combo: {multi.get('combo_label')}")
            lines.append(f"  Primary:   {multi.get('primary_location') or p.get('Leak_Location')}")
            lines.append(f"  Secondary: {multi.get('secondary_location') or p.get('Secondary_Leak')}")
            lines.append("")
            for i, leak in enumerate(active_details[:2]):
                role = "PRIMARY" if i == 0 else "SECONDARY"
                lines.append(f"  [{role}] {leak.get('location', '?')}")
                lines.append(f"    Severity: {leak.get('severity', '?')}")
                lines.append(f"    Confidence: {(leak.get('confidence') or 0) * 100:.1f}%")
                lines.append(f"    Physics: {leak.get('physics_severity', 'N/A')}")
                top_shap = leak.get("top_5_sensors_driving_prediction") or []
                if top_shap:
                    lines.append("    Per-leak SHAP top 3:")
                    for s in top_shap[:3]:
                        lines.append(
                            f"      - {s.get('sensor')}: dev {s.get('deviation_pct', 0):+.1f}%"
                        )
            lines.append("")
            lines.append("Engineering note: Both leaks require inspection — do not treat as one fault.")

        # SSG
        ssg = p.get("Steady_State_Metrics", {})
        if ssg:
            lines.append("")
            lines.append(
                f"STEADY STATE: RPM CV={ssg.get('rpm_cv', 0):.2f}%, "
                f"Load CV={ssg.get('load_cv', 0):.2f}%"
            )

    # RCA block
    if request.rca_result:
        rca = request.rca_result
        lines.append("")
        lines.append("ROOT CAUSE ANALYSIS:")
        lines.append(
            f"  Location: {rca.get('leakLocation')} | "
            f"Severity: {rca.get('severity')}"
        )
        lines.append(f"  SHAP Pattern: {rca.get('shapPatternSummary', '')}")
        if rca.get("cascadeExplanation"):
            lines.append(f"  Cascade: {rca.get('cascadeExplanation')}")
        lines.append("  Ranked Causes:")
        if rca.get("isNovelAnomaly"):
            lines.append("    [NOVEL ANOMALY DETECTED: TRUE]")
            lines.append("    WARNING: Historical knowledge base match confidence was too low.")
            lines.append("    LLM INSTRUCTION: As the Senior Caterpillar Engineer, YOU MUST dynamically deduce the physical root cause of the leak. Use the LIVE SENSOR READINGS and SHAP PATTERN to invent the actual physical reasoning, inspection action, and required tools. Do not rely on historical defaults.")
        else:
            for cause in (rca.get("rankedCauses") or []):
                lines.append(
                    f"    {cause.get('rank', '?')}. {cause.get('label', 'Unknown')} — {cause.get('probabilityPct', '?')}"
                )
                lines.append(f"       Physical reasoning: {cause.get('physicalReasoning', 'N/A')}")
                lines.append(f"       Inspect: {cause.get('inspectAction', 'N/A')}")
                lines.append(f"       Tool: {cause.get('tool', 'N/A')}")
                lines.append(f"       Visual sign: {cause.get('visualSign', 'N/A')}")
                if cause.get("disambiguationReasons"):
                    lines.append(f"       Disambiguation: {', '.join(cause['disambiguationReasons'])}")
        if rca.get("disambiguationApplied"):
            lines.append("  Disambiguation:")
            for rule in rca["disambiguationApplied"]:
                if isinstance(rule, dict):
                    rtype = rule.get("type", "info")
                    label = rule.get("label", "unknown")
                    msg = rule.get("message", "")
                    lines.append(f"    [{rtype}] {label}: {msg}")
                else:
                    lines.append(f"    {rule}")
        if rca.get("notes"):
            for note in rca["notes"]:
                if isinstance(note, dict) and note.get("type") == "warning":
                    lines.append(f"  Warning: {note.get('message', '')}")
                elif isinstance(note, str):
                    lines.append(f"  Note: {note}")

    # Per-leak RCA for multi-leak scenarios
    if request.multi_rca_results:
        for idx, rca in enumerate(request.multi_rca_results[:2]):
            role = "PRIMARY" if idx == 0 else "SECONDARY"
            lines.append("")
            lines.append(f"ROOT CAUSE ANALYSIS — {role} LEAK:")
            lines.append(
                f"  Location: {rca.get('leakLocation')} | "
                f"Severity: {rca.get('severity')}"
            )
            lines.append(f"  SHAP Pattern: {rca.get('shapPatternSummary', '')}")
            if rca.get("cascadeExplanation"):
                lines.append(f"  Cascade: {rca.get('cascadeExplanation')}")
            lines.append("  Ranked Causes:")
            for cause in (rca.get("rankedCauses") or []):
                lines.append(
                    f"    {cause.get('rank', '?')}. {cause.get('label', 'Unknown')} — {cause.get('probabilityPct', '?')}"
                )
                lines.append(f"       Physical reasoning: {cause.get('physicalReasoning', 'N/A')}")
                lines.append(f"       Inspect: {cause.get('inspectAction', 'N/A')}")

    if request.demo_scenario:
        lines.append("")
        lines.append(f"DEMO SCENARIO: {request.demo_scenario}")

    # Multi-bay cell overview (head supervisor)
    if request.cell_tester_summaries:
        lines.append("")
        lines.append("TEST CELL — ALL BAY STATUS (live snapshots):")
        if request.viewer_role == "head":
            lines.append(f"  Viewer: Test Head | Focus bay: {request.aria_focus_tester or 'overview / all bays'}")
        for bay in request.cell_tester_summaries:
            status = "OFFLINE"
            if bay.get("online"):
                status = "LEAK" if bay.get("leak_detected") else "NORMAL"
            op = ""
            if bay.get("op_rpm") is not None:
                op = f" | OP {bay['op_rpm']} RPM / {bay.get('op_load')}% / {bay.get('op_ambient_kpa')} kPa"
            rca = f" | Top RCA: {bay['top_rca_cause']}" if bay.get("top_rca_cause") else ""
            lines.append(
                f"  - {bay.get('display_name')}: {status} | {bay.get('engine', '—')} | "
                f"{bay.get('scenario', '—')}{op} | {('LIVE' if bay.get('streaming') else 'paused')} | "
                f"#{bay.get('readings', 0)}{rca}"
            )
            if bay.get("leak_detected"):
                lines.append(
                    f"      Leak: {bay.get('leak_location')} | Severity: {bay.get('severity')} | "
                    f"Confidence: {bay.get('confidence_pct')}%"
                )
            for cause in (bay.get("rca_ranked_causes") or [])[:3]:
                lines.append(f"      RCA #{cause.get('rank')}: {cause.get('label')} ({cause.get('probability')})")
        lines.append(
            "  INSTRUCTION: When asked to compare bays or summarize the cell, use ONLY this block."
        )

    # Session events
    if request.session_events:
        lines.append("")
        lines.append("SESSION EVENT LOG (recent):")
        for event in request.session_events[-5:]:
            lines.append(f"  {event}")

    lines.append("=" * 50)
    return "\n".join(lines)


@app.post("/chat", tags=["Chat"])
async def chat_endpoint(request: ChatRequest):
    """
    Streaming chat endpoint. Builds full live-state context, calls Gemini,
    and streams the response back as Server-Sent Events.
    """
    import os
    gemini_key = os.environ.get("GEMINI_API_KEY")
    groq_key = os.environ.get("GROQ_API_KEY")
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")

    use_groq = False
    use_claude = False
    
    if request.model_provider == "claude":
        use_claude = True
    elif request.model_provider == "groq":
        use_groq = True
    elif request.model_provider == "gemini":
        pass
    else:
        if groq_key and groq_key != "your-groq-api-key-here" and (not gemini_key or gemini_key == "your-gemini-api-key-here"):
            use_groq = True

    if use_claude:
        if not anthropic_key or anthropic_key == "your-anthropic-api-key-here":
            raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY is not set in .env.")
    elif use_groq:
        if not groq_key or groq_key == "your-groq-api-key-here":
            raise HTTPException(status_code=500, detail="GROQ_API_KEY is not set in .env.")
    else:
        if not gemini_key or gemini_key == "your-gemini-api-key-here":
            raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not set in .env.")

    dynamic_context = build_dynamic_context(request)

    messages = []
    for msg in request.messages:
        role = "assistant" if msg.role == "assistant" else "user"
        messages.append({"role": role, "content": msg.content})

    if messages and messages[-1]["role"] == "user":
        messages[-1]["content"] = (
            dynamic_context
            + "\n\nENGINEER QUESTION:\n"
            + messages[-1]["content"]
            + "\n\nINSTRUCTION: Answer using ONLY the live state above. "
            "Use exact sensor values from context — never guess. "
            "Follow the mandatory Verdict → Key Points → Recommended Action template. "
            "Keep it summarized and scannable — max 120 words unless detail was explicitly requested."
        )

    async def generate():
        try:
            if use_claude:
                from anthropic import AsyncAnthropic
                client = AsyncAnthropic(api_key=anthropic_key)
                
                # Claude requires strictly alternating roles of 'user' and 'assistant', and no 'system' inside messages
                anthropic_messages = []
                for m in messages:
                    if m["role"] not in ["user", "assistant"]:
                        continue
                    anthropic_messages.append({"role": m["role"], "content": m["content"]})
                    
                response = await client.messages.create(
                    model="claude-sonnet-4-5",
                    messages=anthropic_messages,
                    system=SYSTEM_PROMPT,
                    max_tokens=2000,
                    stream=True,
                )
                async for chunk in response:
                    if chunk.type == "content_block_delta" and hasattr(chunk.delta, 'text'):
                        text = chunk.delta.text
                        if text:
                            escaped = text.replace("\n", "\\n")
                            yield f"data: {escaped}\n\n"
                            
            elif use_groq:
                from groq import AsyncGroq
                client = AsyncGroq(api_key=groq_key)
                groq_msgs = [{"role": "system", "content": SYSTEM_PROMPT}] + messages
                response = await client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=groq_msgs,
                    stream=True,
                    max_tokens=1200,
                )
                async for chunk in response:
                    content = chunk.choices[0].delta.content
                    if content:
                        escaped = content.replace("\n", "\\n")
                        yield f"data: {escaped}\n\n"
            else:
                from google import genai
                from google.genai import types
                client = genai.Client(api_key=gemini_key, http_options={'api_version':'v1beta'})
                
                gemini_messages = []
                for m in messages:
                    r = "model" if m["role"] == "assistant" else "user"
                    gemini_messages.append({"role": r, "parts": [{"text": m["content"]}]})
                
                response = await client.aio.models.generate_content_stream(
                    model="gemini-2.5-flash",
                    contents=gemini_messages,
                    config=types.GenerateContentConfig(
                        system_instruction=SYSTEM_PROMPT,
                        max_output_tokens=600,
                    ),
                )
                async for chunk in response:
                    if chunk.text:
                        escaped = chunk.text.replace("\n", "\\n")
                        yield f"data: {escaped}\n\n"
        except Exception as e:
            logger.error("Streaming error: %s", e)
            yield f"data: [ERROR] {e}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )




# ======================================================================
#  Federated Learning Endpoints
#  Uses subprocess.Popen + disk lock file so the simulation survives
#  uvicorn --reload restarts (which kill threads but not child processes).
# ======================================================================

import subprocess as _subprocess

_PROJECT_ROOT_FL = Path(__file__).resolve().parent.parent
_FL_LOCK_FILE = _PROJECT_ROOT_FL / "models" / "federated" / "fl_running.lock"
_FL_RESULTS_FILE = _PROJECT_ROOT_FL / "models" / "federated" / "fl_results.json"
_FL_SCRIPT = _PROJECT_ROOT_FL / "scripts" / "run_fl_simulation.py"

try:
    from src.federated.fl_metrics_store import (  # type: ignore
        load_fl_results as _load_fl,
        fl_simulation_has_run as _fl_has_run,
    )
    _FL_AVAILABLE = True
except ImportError as _fl_err:
    logger.warning("Federated modules not available: %s", _fl_err)
    _FL_AVAILABLE = False
    def _fl_has_run(): return False  # type: ignore
    def _load_fl(): return None  # type: ignore


def _fl_is_running() -> bool:
    """Check disk lock file to determine if simulation subprocess is alive."""
    if not _FL_LOCK_FILE.exists():
        return False
    try:
        pid = int(_FL_LOCK_FILE.read_text().strip())
        # Check if process with that PID is actually alive
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError, ValueError, OSError):
        # PID not alive — stale lock file, clean it up
        try:
            _FL_LOCK_FILE.unlink()
        except OSError:
            pass
        return False


# ======================================================================
#  GET /federated/status
# ======================================================================
@app.get("/federated/status")
async def federated_status():
    """
    Return simulation state + results summary.
    Uses disk lock file for running state — survives uvicorn --reload.
    """
    running = _fl_is_running()

    if not _FL_AVAILABLE:
        return {
            "simulation_run": False,
            "simulation_running": running,
            "num_rounds_completed": None,
            "simulation_timestamp": None,
            "clients": [],
            "global_leak_location_f1": None,
            "privacy_stats": None,
            "global_improvement_summary": None,
            "error": "Federated modules not available on this server.",
        }

    has_run = _fl_has_run()
    if not has_run:
        return {
            "simulation_run": False,
            "simulation_running": running,
            "num_rounds_completed": None,
            "simulation_timestamp": None,
            "clients": [],
            "global_leak_location_f1": None,
            "privacy_stats": None,
            "global_improvement_summary": None,
        }

    data = _load_fl()
    if data is None:
        return {
            "simulation_run": False,
            "simulation_running": running,
            "num_rounds_completed": None,
            "simulation_timestamp": None,
            "clients": [],
            "global_leak_location_f1": None,
            "privacy_stats": None,
            "global_improvement_summary": None,
        }

    clients_summary = []
    for c in data.get("clients", []):
        m = c.get("metrics", {})
        clients_summary.append({
            "client_id":                c.get("client_id"),
            "facility_name":            c.get("facility_name"),
            "city":                     c.get("city"),
            "state":                    c.get("state"),
            "description":              c.get("description"),
            "best_model_type":          c.get("best_model_type"),
            "train_samples":            c.get("train_samples"),
            "overrepresented_scenario": c.get("overrepresented_scenario"),
            "leak_location_f1_local":   m.get("leak_location_f1"),
            "leak_present_f1_local":    m.get("leak_present_f1"),
            "val_f1_by_model":          m.get("val_f1_by_model"),
            "model_scores":             c.get("model_scores") or m.get("val_f1_by_model"),
        })

    round_history = data.get("round_history", [])
    global_f1 = None
    if round_history:
        global_f1 = round_history[-1].get("global_after", {}).get("leak_location_f1")

    return {
        "simulation_run":              True,
        "simulation_running":          running,
        "num_rounds_completed":        data.get("num_rounds"),
        "num_rounds_planned":          data.get("num_rounds_planned", data.get("num_rounds")),
        "simulation_in_progress":      data.get("simulation_in_progress", False),
        "simulation_timestamp":        data.get("simulation_timestamp"),
        "simulation_duration_seconds": data.get("simulation_duration_seconds"),
        "clients":                     clients_summary,
        "global_leak_location_f1":     global_f1,
        "round_history":               round_history,
        "privacy_stats":               data.get("privacy_stats"),
        "global_improvement_summary":  data.get("global_improvement_summary"),
        "fl_benefit":                  data.get("fl_benefit"),
        "cross_facility_before":       data.get("cross_facility_before"),
        "cross_facility_after":        data.get("cross_facility_after"),
        "facility_contributions":      data.get("facility_contributions"),
    }


# ======================================================================
#  GET /federated/results
# ======================================================================
@app.get("/federated/results")
async def federated_results():
    """Return the full fl_results.json content."""
    if not _FL_AVAILABLE:
        return {"error": "Federated modules not available on this server."}
    if not _fl_has_run():
        return {"error": "Simulation not yet run. POST to /federated/run first."}
    data = _load_fl()
    if data is None:
        return {"error": "Results file missing. POST to /federated/run to regenerate."}
    return data


# ======================================================================
#  GET /federated/log
# ======================================================================
@app.get("/federated/log")
async def federated_log():
    """Return last 100 lines of the simulation log for progress tracking."""
    log_path = _PROJECT_ROOT_FL / "models" / "federated" / "simulation.log"
    if not log_path.exists():
        return {"log": [], "running": _fl_is_running()}
    lines = log_path.read_text().splitlines()
    return {"log": lines[-100:], "running": _fl_is_running()}


# ======================================================================
#  POST /federated/run
# ======================================================================
@app.post("/federated/run")
async def run_federated():
    """
    Launch the federated simulation as a detached subprocess.
    The process is completely independent of uvicorn — it survives
    --reload restarts and writes progress to models/federated/simulation.log.
    """
    if not _FL_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Federated modules not available. Check server logs.",
        )

    if _fl_is_running():
        return {
            "status": "already_running",
            "message": (
                "A federation simulation is already in progress. "
                "Poll GET /federated/status or GET /federated/log for progress."
            ),
        }

    if not _FL_SCRIPT.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Simulation script not found: {_FL_SCRIPT}",
        )

    _FL_LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)

    # Launch as completely detached subprocess — survives uvicorn reloads
    # Launch as completely detached subprocess — survives uvicorn reloads
    # macOS requires OBJC_DISABLE_INITIALIZE_FORK_SAFETY to prevent OpenMP crashes
    _env = os.environ.copy()
    _env["OBJC_DISABLE_INITIALIZE_FORK_SAFETY"] = "YES"
    _env["OMP_NUM_THREADS"] = "1"
    _env["OPENBLAS_NUM_THREADS"] = "1"
    _env["MKL_NUM_THREADS"] = "1"

    proc = _subprocess.Popen(
        [sys.executable, str(_FL_SCRIPT), "--rounds", "3"],
        cwd=str(_PROJECT_ROOT_FL),
        stdout=_subprocess.DEVNULL,
        stderr=_subprocess.DEVNULL,
        env=_env,
        # Detach from parent process group so uvicorn reload doesn't kill it
        start_new_session=True,
        close_fds=True,
    )

    logger.info("FL simulation subprocess launched (PID %d)", proc.pid)

    return {
        "status": "started",
        "pid": proc.pid,
        "message": (
            "Federation simulation running as independent process. "
            "Poll GET /federated/status or GET /federated/log for progress."
        ),
    }
