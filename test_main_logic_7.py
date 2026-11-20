import os
from dotenv import load_dotenv

load_dotenv()

def test_gemini():
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"), http_options={'api_version':'v1beta'})
    
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents="Say hello",
            config=types.GenerateContentConfig(max_output_tokens=10)
        )
        print("RESPONSE OBJ:", repr(response))
    except Exception as e:
        print("EXCEPTION:", e)

test_gemini()
