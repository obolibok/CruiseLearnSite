from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import json, os, re, requests
from pydantic import BaseModel, ValidationError
from typing import List, Optional
from dotenv import load_dotenv
from openai import OpenAI

# === ПОДГОТОВКА И ПРОВЕРКА .env ===
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(BASE_DIR, ".env")

def ensure_env_file(path: str):
    """Проверяет наличие .env и удаляет BOM, если он есть"""
    if not os.path.exists(path):
        print(f"⚠️  No .env file found at {path}")
        return
    with open(path, "rb") as f:
        content = f.read()
    if content.startswith(b"\xef\xbb\xbf"):
        print("⚠️  Detected UTF-8 BOM in .env — cleaning it automatically...")
        with open(path, "wb") as f:
            f.write(content[3:])
        print("✅ .env cleaned and saved without BOM.")
    else:
        print("✅ .env encoding looks fine.")

ensure_env_file(env_path)

# === ЗАГРУЗКА ПЕРЕМЕННЫХ ===
load_dotenv(dotenv_path=env_path)
DEFAULT_API_KEY = os.getenv("OPENAI_API_KEY", "")
DEBUG_MODE = os.getenv("DEBUG_MODE", "false").lower() == "true"

print(f"[DEBUG] Working directory: {os.getcwd()}")
print(f"[DEBUG] OPENAI_API_KEY = {DEFAULT_API_KEY[:10]}...")
print(f"[DEBUG] DEBUG_MODE = {DEBUG_MODE}")

# === ПРОВЕРКА НАЛИЧИЯ OLLAMA ===
def ollama_available():
    try:
        r = requests.get("http://localhost:11434/api/tags", timeout=1)
        return r.status_code == 200
    except Exception:
        return False

HAS_OLLAMA = ollama_available()
if HAS_OLLAMA:
    print("🦙 Ollama detected on localhost:11434 — default provider set to 'ollama'.")
else:
    print("ℹ️  Ollama not detected, default provider: 'openai'.")

# === НАСТРОЙКА FLASK ===
app = Flask(__name__)
CORS(app)

# === ПРИМЕР JSON ===
with open(os.path.join(BASE_DIR, "examples", "chapter_example.json"), "r", encoding="utf-8") as f:
    EXAMPLE_JSON = f.read().strip()

# === СХЕМЫ ===
class ExportedTopic(BaseModel):
    primaryText: str
    secondaryText: Optional[str] = None

class ExportedChapter(BaseModel):
    name: str
    description: Optional[str] = None
    primaryLanguage: str
    secondaryLanguage: Optional[str] = None
    topics: List[ExportedTopic]

class ChapterCollection(BaseModel):
    type: str = "chapter_collection"
    version: int = 1
    chapters: List[ExportedChapter]

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/models", methods=["GET"])
def list_models():
    """Возвращает список моделей из OpenAI или Ollama"""
    provider = request.args.get("provider") or ("ollama" if HAS_OLLAMA else "openai")

    if provider == "ollama":
        try:
            res = requests.get("http://localhost:11434/api/tags")
            data = res.json()
            models = [m["name"] for m in data.get("models", [])]
            if not models:
                return jsonify({
                    "models": ["llama3", "mistral", "phi3"],
                    "provider": "ollama",
                    "note": "No models found — install one via 'ollama pull llama3'"
                }), 200
            return jsonify({"models": models, "provider": "ollama"}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    api_key = request.args.get("api_key") or DEFAULT_API_KEY
    if not api_key:
        return jsonify({"error": "API key not provided"}), 400
    try:
        client = OpenAI(api_key=api_key)
        models = client.models.list()
        filtered = sorted(
            [m.id for m in models.data if any(x in m.id.lower() for x in ["gpt", "o", "mini"])]
        )
        return jsonify({"models": filtered, "provider": "openai"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/generate", methods=["POST"])
def generate_content():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Empty or invalid JSON"}), 400

    text = data.get("text")
    target_lang = data.get("target_lang", "ru")
    instruction = data.get("instruction", "Выбери все глаголы и переведи их")
    api_key = data.get("api_key") or DEFAULT_API_KEY
    model = data.get("model", "gpt-4o-mini")
    provider = data.get("provider", "ollama" if HAS_OLLAMA else "openai")

    if not text:
        return jsonify({"error": "Missing text"}), 400
    if provider != "ollama" and not api_key:
        return jsonify({"error": "Missing API key"}), 400

    prompt = f"""
Ты — генератор учебных материалов Cruise Learn.
Ответь ТОЛЬКО чистым JSON строго по примеру ниже.
Без markdown, без комментариев, без пояснений.

Пример формата:
{EXAMPLE_JSON}

Исходный текст:
{text}

Инструкция:
{instruction}

Целевой язык перевода: {target_lang}
"""

    try:
        print(f"\n[DEBUG] Provider: {provider}, Model: {model}")
        print(f"[DEBUG] Instruction: {instruction[:80]}...")

        if provider == "openai":
            client = OpenAI(api_key=api_key)
            completion = client.chat.completions.create(
                model=model,
                temperature=0.2,
                messages=[
                    {"role": "system", "content": "Ты помощник Cruise Learn, создающий учебные данные."},
                    {"role": "user", "content": prompt},
                ],
            )
            raw_output = completion.choices[0].message.content.strip()

        elif provider == "openrouter":
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://cruiselearn.app",
            }
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": "Ты помощник Cruise Learn, создающий учебные данные."},
                    {"role": "user", "content": prompt},
                ],
            }
            res = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload)
            print(f"[DEBUG] OpenRouter status: {res.status_code}")
            print(f"[DEBUG] OpenRouter text: {res.text[:500]}")
            raw_output = res.json()["choices"][0]["message"]["content"].strip()

        elif provider == "ollama":
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": "Ты помощник Cruise Learn, создающий учебные данные."},
                    {"role": "user", "content": prompt},
                ],
                "stream": True  # ключевой момент — Ollama шлёт стрим
            }
            print(f"[DEBUG] Sending to Ollama: {payload['model']}")
            res = requests.post("http://localhost:11434/api/chat", json=payload, stream=True)
            print(f"[DEBUG] Ollama status: {res.status_code}")
        
            # --- Собираем контент из NDJSON ---
            raw_output = ""
            for line in res.iter_lines():
                if not line:
                    continue
                try:
                    obj = json.loads(line.decode("utf-8"))
                    msg = obj.get("message", {}).get("content", "")
                    raw_output += msg
                except Exception as e:
                    if DEBUG_MODE:
                        print(f"[DEBUG] Ollama stream parse error: {e} for line: {line[:120]}")
        
            if DEBUG_MODE:
                print(f"[DEBUG] --- Raw output from OLLAMA (assembled) ---\n{raw_output[:1000]}\n---------------------------")

        else:
            return jsonify({"error": f"Unsupported provider: {provider}"}), 400

        if DEBUG_MODE:
            print(f"[DEBUG] --- Raw output from {provider.upper()} ---\n{raw_output}\n---------------------------")

        # --- Очистка ---
        clean_output = re.sub(r"```.*?```", "", raw_output, flags=re.DOTALL)
        clean_output = re.sub(r"^[^{]*", "", clean_output, flags=re.DOTALL).strip()
        if DEBUG_MODE:
            print(f"[DEBUG] --- Cleaned output ---\n{clean_output}\n---------------------------")

        match = re.search(r"\{.*\}", clean_output, re.DOTALL)
        if not match:
            print("[DEBUG] No JSON match found in output.")
            return jsonify({"error": "No JSON found in response", "raw": raw_output}), 400

        json_str = match.group(0)
        print(f"[DEBUG] Extracted JSON string (first 200 chars): {json_str[:200]}...")

        try:
            result = json.loads(json_str)
        except json.JSONDecodeError as e:
            print(f"[DEBUG] JSON decode error: {str(e)}")
            return jsonify({"error": f"Invalid JSON: {str(e)}", "raw": json_str}), 400

        validated = ChapterCollection(**result)
        print("[DEBUG] ✅ JSON validated successfully.")
        return jsonify(validated.dict()), 200

    except Exception as e:
        print(f"[DEBUG] ❌ Exception in generate_content: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
