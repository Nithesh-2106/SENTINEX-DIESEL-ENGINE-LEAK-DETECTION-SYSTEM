import asyncio
import httpx
import json

payload = {
  "messages": [{"role": "user", "content": "How does this system work?"}],
  "current_prediction": {"Leak_Present": 1, "Leak_Location": "Intake_PreTurbo", "Confidence_Score": 0.99},
  "live_readings": {"Engine_Speed_Actual_RPM": 1800, "Boost_Pressure_kPa": 116},
  "engine_id": "CAT_C13",
  "model_provider": "gemini"
}

async def test():
    print("Sending request to http://localhost:8000/chat...")
    try:
        async with httpx.AsyncClient() as client:
            async with client.stream("POST", "http://localhost:8000/chat", json=payload, timeout=60) as response:
                print("Status:", response.status_code)
                async for chunk in response.aiter_text():
                    print("CHUNK:", repr(chunk))
    except Exception as e:
        print("EXCEPTION:", e)

asyncio.run(test())
