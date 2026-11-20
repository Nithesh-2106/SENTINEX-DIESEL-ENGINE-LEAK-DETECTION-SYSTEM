import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

async def test_groq():
    print("Testing Groq...")
    from groq import AsyncGroq
    client = AsyncGroq(api_key=os.environ.get("GROQ_API_KEY"))
    response = await client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": "Say hello"}],
        stream=True,
        max_tokens=10
    )
    async for chunk in response:
        print(chunk.choices[0].delta.content, end="")
    print()

async def test_gemini():
    print("Testing Gemini...")
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"), http_options={'api_version':'v1beta'})
    response = await client.aio.models.generate_content_stream(
        model="gemini-2.5-flash",
        contents="Say hello",
        config=types.GenerateContentConfig(max_output_tokens=10)
    )
    async for chunk in response:
        print(chunk.text, end="")
    print()

async def main():
    await test_groq()
    await test_gemini()

asyncio.run(main())
