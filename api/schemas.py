"""
schemas.py -- Pydantic request / response models for the API
============================================================
Defines SensorInput (42-field request body) and PredictionResponse
(unified prediction + SHAP explanation) used by api/main.py.

Extended to include:
  - physics-based Dynamic_Baseline outputs
  - steady-state suppression metadata (Suppressed, reason, metrics)
"""

from typing import Dict, List, Optional, Any

from pydantic import BaseModel, Field


class SensorInput(BaseModel):
    """All 42 sensor measurements required for a single prediction.

    Example values correspond to normal (no-leak) engine operation
    on a Caterpillar C13-class diesel at 1 800 RPM / 75 % load.
    """

    Engine_Speed_Setpoint_RPM: float = Field(..., example=1800.0, description="Target engine speed in RPM")
    Engine_Load_Setpoint_Pct: float = Field(..., example=75.0, description="Target engine load as a percentage")
    Engine_Speed_Actual_RPM: float = Field(..., example=1800.19, description="Measured engine speed in RPM")
    Engine_Load_Actual_Pct: float = Field(..., example=75.0, description="Measured engine load percentage")
    Fuel_Flow_Rate_kgph: float = Field(..., example=42.0, description="Fuel flow rate in kg/hour")
    Engine_Coolant_Temp_C: float = Field(..., example=88.0, description="Engine coolant temperature in Celsius")
    Engine_Oil_Pressure_bar: float = Field(..., example=4.2, description="Engine oil pressure in bar")
    Ambient_Temp_C: float = Field(..., example=32.0, description="Ambient air temperature in Celsius")
    Ambient_Pressure_kPa: float = Field(..., example=101.3, description="Ambient atmospheric pressure in kPa")
    Ambient_Humidity_Pct: float = Field(..., example=68.0, description="Ambient humidity percentage")
    Intake_Ambient_Pressure_kPa: float = Field(..., example=101.3, description="Intake ambient pressure in kPa")
    MAF_Sensor_Reading_kgph: float = Field(..., example=720.0, description="Mass airflow sensor reading in kg/hour")
    Pre_Compressor_Pressure_kPa: float = Field(..., example=99.5, description="Pressure before turbo compressor in kPa")
    Pre_Compressor_Temp_C: float = Field(..., example=38.0, description="Temperature before turbo compressor in Celsius")
    Post_Compressor_Pressure_kPa: float = Field(..., example=218.0, description="Pressure after turbo compressor in kPa")
    Post_Compressor_Temp_C: float = Field(..., example=167.9, description="Temperature after turbo compressor in Celsius")
    Post_CAC_Pressure_kPa: float = Field(..., example=213.0, description="Pressure after charge air cooler in kPa")
    Post_CAC_Temp_C: float = Field(..., example=52.0, description="Temperature after charge air cooler in Celsius")
    Intake_Manifold_Pressure_kPa: float = Field(..., example=211.0, description="Intake manifold pressure in kPa")
    Intake_Manifold_Temp_C: float = Field(..., example=55.0, description="Intake manifold temperature in Celsius")
    Turbocharger_Speed_RPM: float = Field(..., example=92000.0, description="Turbocharger rotational speed in RPM")
    Boost_Pressure_kPa: float = Field(..., example=116.7, description="Boost pressure in kPa")
    Exhaust_Manifold_Pressure_kPa: float = Field(..., example=230.0, description="Exhaust manifold pressure in kPa")
    Exhaust_Manifold_Temp_C: float = Field(..., example=680.0, description="Exhaust manifold temperature in Celsius")
    Pre_Turbine_Pressure_kPa: float = Field(..., example=225.0, description="Pressure before turbine in kPa")
    Pre_Turbine_Temp_C: float = Field(..., example=670.0, description="Temperature before turbine in Celsius")
    Post_Turbine_Pressure_kPa: float = Field(..., example=112.0, description="Pressure after turbine in kPa")
    Post_Turbine_Temp_C: float = Field(..., example=480.2, description="Temperature after turbine in Celsius")
    Post_DOC_Pressure_kPa: float = Field(..., example=109.5, description="Pressure after diesel oxidation catalyst in kPa")
    Post_DOC_Temp_C: float = Field(..., example=490.0, description="Temperature after diesel oxidation catalyst in Celsius")
    Post_DPF_Pressure_kPa: float = Field(..., example=106.0, description="Pressure after diesel particulate filter in kPa")
    Post_DPF_Temp_C: float = Field(..., example=469.9, description="Temperature after diesel particulate filter in Celsius")
    Post_SCR_Pressure_kPa: float = Field(..., example=103.5, description="Pressure after selective catalytic reduction in kPa")
    Post_SCR_Temp_C: float = Field(..., example=420.1, description="Temperature after selective catalytic reduction in Celsius")
    Tailpipe_BackPressure_kPa: float = Field(..., example=102.0, description="Back-pressure at tailpipe in kPa")
    EGR_Flow_Rate_kgph: float = Field(..., example=58.0, description="Exhaust gas recirculation flow rate in kg/hour")
    Intake_Mass_Balance_Error_kgph: float = Field(..., example=7.4, description="Intake mass balance error in kg/hour")
    Compressor_Pressure_Ratio: float = Field(..., example=2.19, description="Compressor pressure ratio")
    Turbine_Expansion_Ratio: float = Field(..., example=2.01, description="Turbine expansion ratio")
    CAC_Pressure_Drop_kPa: float = Field(..., example=5.0, description="Pressure drop across charge air cooler in kPa")
    DPF_Delta_Pressure_kPa: float = Field(..., example=3.5, description="Differential pressure across DPF in kPa")
    Intake_Temp_Rise_Across_CAC_C: float = Field(..., example=-116.0, description="Temperature change across CAC in Celsius")

    demo_scenario: Optional[str] = Field(
        default=None,
        description=(
            "Optional dashboard scenario id (e.g. sensor_fault_demo). "
            "Used for stateful pipeline reset on scenario change and "
            "steady-state guard behaviour — not for ML input."
        ),
    )
    engine_id: str = Field(
        default="CAT_C13",
        description="Engine configuration ID: CAT_C7, CAT_C13, or CAT_C15",
        example="CAT_C13",
    )


class PredictionResponse(BaseModel):
    """Unified prediction output: prediction + SHAP explanation."""

    Leak_Present: int = Field(..., description="1 if leak detected, 0 otherwise")
    Leak_Location: str = Field(
        ...,
        description=(
            "Predicted leak location or 'None'. Values include: None, Intake_PreTurbo, "
            "Intake_PostTurbo_CAC, Exhaust_PreTurbine, Exhaust_PostTurbine, EGR_Leak, "
            "CAC_Direct_Leak, Minor_Intake_Leak"
        ),
    )
    Leak_Severity: str = Field(..., description="Predicted leak severity or 'None'")
    Recommended_Action: str = Field(..., description="Recommended operational action")
    Confidence_Score: float = Field(..., description="Model confidence in its predicted class")
    top_5_sensors_driving_prediction: List[Dict] = Field(
        ..., description="Top 5 sensors by absolute SHAP impact with values, baselines, and interpretations"
    )

    # Optional (only present when steady-state guard / dynamic baseline are enabled)
    Suppressed: Optional[bool] = Field(
        default=None,
        description="True if prediction was suppressed due to non-steady operating conditions",
    )
    Suppression_Reason: Optional[str] = Field(
        default=None,
        description="Reason for suppression when Suppressed=True",
    )
    Steady_State_Metrics: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Steady-state quality metrics from the SteadyStateGuard",
    )
    Dynamic_Baseline: Optional[Dict[str, float]] = Field(
        default=None,
        description="Physics-computed expected baselines for the current operating point (42 sensors)",
    )
    Data_Quality: Optional[Dict[str, Any]] = Field(
        default=None,
        description=(
            "Data Quality Pipeline metadata: score, flags, and cleaned-sensor "
            "events from the pre-inference cleaning stage"
        ),
    )
    Sensor_Fault_Isolation: Optional[Dict[str, Any]] = Field(
        default=None,
        description=(
            "Sensor Fault Isolator metadata: physical consistency check "
            "between primary and correlated sensors for the predicted leak"
        ),
    )
    Model_Selection: Optional[Dict[str, Any]] = Field(
        default=None,
        description=(
            "Active production model and test-set accuracy comparison "
            "across XGBoost, Random Forest, and Neural Network"
        ),
    )
    Physics_Severity: Optional[Dict[str, Any]] = Field(
        default=None,
        description=(
            "Physics-based severity from severity_engine.py: tier, "
            "performance_impact_pct, impact_basis, blend_score, severity_method"
        ),
    )
    Multi_Pattern: Optional[Dict[str, Any]] = Field(
        default=None,
        description=(
            "Multi-label leak detection (dashboard compat). "
            "Contains is_multi_leak, active_locations, per-location severity/SHAP, combo_label."
        ),
    )
    Is_Multi_Leak: Optional[bool] = Field(
        default=None,
        description="True when two or more leak locations are active above threshold",
    )
    Secondary_Leak: Optional[str] = Field(
        default=None,
        description="Second-highest-confidence active leak location in multi-leak mode",
    )
    Active_Labels: Optional[List[str]] = Field(
        default=None,
        description="All leak locations with probability >= 0.50",
    )
    Label_Probabilities: Optional[Dict[str, float]] = Field(
        default=None,
        description="Per-location model probabilities for all 7 leak scenarios",
    )
    Active_Leak_Details: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description=(
            "Per active location: severity, physics_severity, recommended_action, "
            "confidence, and top_5_sensors_driving_prediction"
        ),
    )
    display_mode: Optional[str] = Field(
        default=None,
        description="SINGLE or MULTI_LEAK — how the prediction should be displayed",
    )
    multi_leak: Optional[Dict[str, Any]] = Field(
        default=None,
        description=(
            "Full multi-leak inference block from Model B: "
            "is_multi_leak, primary, secondary, combo_label, etc."
        ),
    )


# ── Validation demo schemas ───────────────────────────────────────────────────

class ValidationDemoExample(BaseModel):
    """Single validation prediction result (single- or multi-leak)."""
    row_index: int
    scenario_label: str
    actual_location: str
    predicted_location: str
    correct: bool
    confidence: float
    leak_present: bool = False
    leak_severity: Optional[str] = None
    recommended_action: Optional[str] = None
    is_multi_leak: bool = False
    dataset_source: Optional[str] = None
    combo_label: Optional[str] = None
    actual_locations: Optional[List[str]] = None
    predicted_locations: Optional[List[str]] = None


class ValidationDemoResponse(BaseModel):
    """Clean validation run — 15 scenarios (8 single + 7 multi-leak)."""
    dataset_name: str
    dataset_role: str
    training_dataset: str
    description: str
    single_scenarios: int = 8
    multi_scenarios: int = 7
    total: int
    correct: int
    accuracy_pct: float
    examples: List[ValidationDemoExample]


# ── Chat endpoint schemas ─────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    """A single turn in the conversation history."""
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    """Full payload for POST /chat."""
    messages: List[ChatMessage]                 # full conversation history, last = new user msg
    current_prediction: Optional[Any] = None   # full /predict response JSON if available
    live_readings: Optional[Dict] = None       # flat dict of current sensor values
    rca_result: Optional[Dict] = None          # output from rootCauseEngine.js
    multi_rca_results: Optional[List[Dict]] = None  # per-leak RCA for multi-leak scenarios
    demo_scenario: Optional[str] = None        # active simulator scenario id (pins leak order)
    engine_id: Optional[str] = "CAT_C13"
    session_events: Optional[List[str]] = []   # last 5 session event log entries
    model_provider: Optional[str] = "gemini"   # "gemini" or "groq"
    viewer_role: Optional[str] = None
    aria_focus_tester: Optional[str] = None
    cell_tester_summaries: Optional[List[Dict]] = None


class ReportEmailRequest(BaseModel):
    """POST /report/send-email — deliver session PDF via SMTP."""

    to_email: str = Field(..., description="Recipient email address")
    subject: str = Field(..., min_length=1, max_length=200)
    body_text: str = Field(..., min_length=1, max_length=8000)
    pdf_base64: str = Field(..., description="Base64-encoded PDF attachment")
    pdf_filename: str = Field(default="SENTINEX_Session_Report.pdf", max_length=120)
    sender_name: Optional[str] = Field(default=None, max_length=120)
    session_id: Optional[str] = Field(default=None, max_length=80)
