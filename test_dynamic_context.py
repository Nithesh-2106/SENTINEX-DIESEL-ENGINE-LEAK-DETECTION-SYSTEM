import json
from api.schemas import ChatRequest
from api.main import build_dynamic_context

payload = {
    "messages": [{"role": "user", "content": "test"}],
    "model_provider": "gemini",
    "engine_id": "CAT_C13",
    "current_prediction": {
        "Leak_Present": 1,
        "Leak_Location": "Intake_PreTurbo",
        "top_5_sensors_driving_prediction": [
            {
                "sensor": "Test",
                "your_value": 1.0,
                "normal_baseline": 1.0,
                "deviation_pct": 1.0,
                "shap_impact": 1.0,
                "interpretation": "Test"
            }
        ]
    },
    "live_readings": {
        "Test": 1.0
    },
    "rca_result": {
        "leakLocation": "Intake_PreTurbo",
        "severity": "High",
        "shapPatternSummary": "Test",
        "rankedCauses": [
            {
                "rank": 1,
                "label": "Test",
                "probabilityPct": "90%"
            }
        ]
    }
}

req = ChatRequest(**payload)
try:
    print(build_dynamic_context(req))
except Exception as e:
    import traceback
    traceback.print_exc()
