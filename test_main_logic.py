import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

async def test_gemini():
    print("Testing Gemini...")
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"), http_options={'api_version':'v1beta'})
    
    gemini_messages = [{"role": "user", "parts": [{"text": "hi"}]}]
    
    try:
        response = await client.aio.models.generate_content_stream(
            model="gemini-2.5-flash",
            contents=gemini_messages,
            config=types.GenerateContentConfig(max_output_tokens=10)
        )
        async for chunk in response:
            print("CHUNK:", chunk.text)
        print("DONE")
    except Exception as e:
        print("EXCEPTION:", e)

asyncio.run(test_gemini())
