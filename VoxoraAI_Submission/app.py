
import os
import re
import logging
import subprocess
import tempfile
import secrets
import threading

from io import BytesIO
from pathlib import Path

from flask import (
    Flask,
    render_template,
    request,
    jsonify,
    send_file,
    session
)

from dotenv import load_dotenv

from google import genai
from gnani.stt import GnaniSTTClient
from gnani.tts import GnaniTTSClient


# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------

load_dotenv()

app = Flask(__name__)

app.secret_key = (
    os.getenv("FLASK_SECRET_KEY")
    or secrets.token_hex(32)
)

logging.basicConfig(level=logging.INFO)

GNANI_API_KEY = os.getenv("GNANI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GNANI_API_KEY:
    raise RuntimeError(
        "GNANI_API_KEY is missing in your .env file."
    )

if not GEMINI_API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY is missing in your .env file."
    )


# --------------------------------------------------
# AI CLIENTS
# --------------------------------------------------

stt_client = GnaniSTTClient(api_key=GNANI_API_KEY)

tts_client = GnaniTTSClient(api_key=GNANI_API_KEY)

gemini_client = genai.Client(api_key=GEMINI_API_KEY)

GEMINI_MODEL = "gemini-3.5-flash-lite"

LANGUAGE_NAMES = {
    "hi-IN": "Hindi",
    "en-IN": "Indian English",
    "mr-IN": "Marathi"
}


# --------------------------------------------------
# CONVERSATION MEMORY
# --------------------------------------------------

CONVERSATIONS = {}

conversation_lock = threading.Lock()

MAX_HISTORY_MESSAGES = 20


# --------------------------------------------------
# VOXORA AI INSTRUCTIONS
# --------------------------------------------------

SYSTEM_INSTRUCTION = """
You are Voxora AI, a helpful multilingual voice assistant.

Your tagline is:
Intelligence That Speaks Your Language.

YOUR PERSONALITY:

- Friendly, intelligent, helpful and conversational.
- Speak naturally, like a real voice assistant.
- Be polite and approachable.
- Avoid robotic or unnecessarily formal replies.

YOUR RESPONSIBILITIES:

- Answer general questions across different subjects.
- Help with education, technology, careers and daily tasks.
- Explain complicated topics in simple language.
- Respond naturally and conversationally.
- Remember and use the conversation history.
- Understand follow-up questions using previous messages.
- Support Hindi, Indian English, Marathi and Hinglish.
- Respect the language selected by the user.
- Keep voice responses clear and reasonably concise.
- Never invent facts, sources, current events or statistics.
- If uncertain, clearly say so.
- Do not claim to have checked live information unless
  a live source was actually used.

FIRST-TIME GREETING BEHAVIOR:

When a user starts a completely new conversation and
greets you with Hey, Hi, Hello, Namaste or a similar greeting:

Introduce yourself warmly.

Use this introduction in the user's selected language:

"Hey! I'm Voxora, your multilingual AI voice assistant.
I can understand and speak Hindi, English and Marathi.
You can ask me questions, learn something new, get help
with everyday tasks, or simply have a conversation.
I'm here to help you. What would you like to talk about?"

IMPORTANT:

- Introduce yourself only on the first greeting of a
  new conversation.
- Do not repeat your full introduction in every message.
- Do not repeat your name or tagline unnecessarily.
- If the user directly asks who you are, introduce yourself.
- If the user's first message is a question rather than
  a greeting, answer the question directly.
- If the user says Hey and asks a question together,
  introduce yourself briefly and also answer the question.

The user may ask questions unrelated to examination forms.
Do not restrict yourself to a predefined FAQ list.
"""


# --------------------------------------------------
# GREETING DETECTION
# --------------------------------------------------

def is_greeting(message):

    greeting_pattern = (
        r"^\s*(hey|hi|hello|hii+|heyy+|"
        r"namaste|namaskar|good morning|"
        r"good afternoon|good evening)"
        r"([!,.?\s]|$)"
    )

    return bool(
        re.search(
            greeting_pattern,
            message,
            re.IGNORECASE
        )
    )


# --------------------------------------------------
# HOME
# --------------------------------------------------

@app.route("/")
def home():

    return render_template("index.html")


# --------------------------------------------------
# GEMINI CHAT WITH MEMORY
# --------------------------------------------------

@app.route("/api/chat", methods=["POST"])
def chat():

    data = request.get_json(silent=True) or {}

    message = str(data.get("message", "")).strip()

    language = data.get("language", "hi-IN")

    if not message:
        return jsonify({
            "error": "Please enter a message."
        }), 400

    if language not in LANGUAGE_NAMES:
        language = "hi-IN"

    language_name = LANGUAGE_NAMES[language]

    # Get or create browser conversation ID.
    conversation_id = session.get("conversation_id")

    if not conversation_id:

        conversation_id = secrets.token_urlsafe(24)

        session["conversation_id"] = conversation_id

    # Retrieve previous conversation.
    with conversation_lock:

        history = list(
            CONVERSATIONS.get(conversation_id, [])
        )

    is_first_message = len(history) == 0

    first_greeting = (
        is_first_message and is_greeting(message)
    )

    # Special instruction for the first greeting.
    greeting_instruction = ""

    if first_greeting:

        greeting_instruction = """
IMPORTANT:
This is the user's first message in a new conversation
and it is a greeting.

Introduce yourself as Voxora using your first-time
greeting behavior.

Do not just reply with a short "Hello".
Give your friendly introduction.
"""

    prompt = f"""
{SYSTEM_INSTRUCTION}

SELECTED LANGUAGE:
{language_name}

LANGUAGE RULES:

- Respond primarily in {language_name}.
- If the user naturally uses Hinglish, you may respond
  in Hinglish.
- Use simple and natural language.

{greeting_instruction}

CONVERSATION RULES:

- Use previous conversation messages as context.
- Remember details shared by the user in this conversation.
- Do not repeat your introduction unnecessarily.
- Answer the latest message directly.

USER'S LATEST MESSAGE:

{message}
"""

    # Add latest user message to Gemini conversation.
    contents = history + [
        {
            "role": "user",
            "parts": [
                {
                    "text": prompt
                }
            ]
        }
    ]

    try:

        print(
            "Sending request to Gemini...",
            flush=True
        )

        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=contents
        )

        answer = response.text

        if not answer or not answer.strip():

            return jsonify({
                "error": "Gemini returned an empty response."
            }), 502

        answer = answer.strip()

        # Save conversation history.
        updated_history = contents + [
            {
                "role": "model",
                "parts": [
                    {
                        "text": answer
                    }
                ]
            }
        ]

        # Keep only the latest 20 history entries.
        updated_history = updated_history[-MAX_HISTORY_MESSAGES:]

        with conversation_lock:

            CONVERSATIONS[conversation_id] = updated_history

        print(
            "Gemini response received successfully.",
            flush=True
        )

        return jsonify({
            "response": answer,
            "model": GEMINI_MODEL
        })

    except Exception as error:

        print(
            "GEMINI ERROR:",
            repr(error),
            flush=True
        )

        return jsonify({
            "error": "Gemini Error: " + str(error)
        }), 503


# --------------------------------------------------
# CLEAR CHAT AND CONVERSATION MEMORY
# --------------------------------------------------

@app.route("/api/clear-chat", methods=["POST"])
def clear_chat():

    conversation_id = session.get("conversation_id")

    if conversation_id:

        with conversation_lock:

            CONVERSATIONS.pop(
                conversation_id,
                None
            )

    session.pop("conversation_id", None)

    return jsonify({
        "success": True,
        "message": "Conversation memory cleared."
    })


# --------------------------------------------------
# GNANI SPEECH TO TEXT
# --------------------------------------------------

@app.route("/api/stt", methods=["POST"])
def speech_to_text():

    if "audio" not in request.files:

        return jsonify({
            "error": "No audio file received."
        }), 400

    audio = request.files["audio"]

    language = request.form.get(
        "language",
        "hi-IN"
    )

    if not audio.filename:

        return jsonify({
            "error": "Please record your voice first."
        }), 400

    if language not in LANGUAGE_NAMES:
        language = "hi-IN"

    try:

        with tempfile.TemporaryDirectory() as temp_dir:

            webm_path = Path(temp_dir) / "recording.webm"

            wav_path = Path(temp_dir) / "recording.wav"

            webm_path.write_bytes(audio.read())

            # Convert browser WebM audio to WAV.
            conversion = subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-i", str(webm_path),
                    "-ac", "1",
                    "-ar", "16000",
                    str(wav_path)
                ],
                capture_output=True,
                text=True
            )

            if conversion.returncode != 0:

                print(
                    "FFMPEG ERROR:",
                    conversion.stderr,
                    flush=True
                )

                return jsonify({
                    "error": "Audio conversion failed."
                }), 500

            # Send WAV audio to Gnani STT.
            result = stt_client.transcribe(
                str(wav_path),
                language_code=language
            )

            transcript = result.get(
                "transcript",
                ""
            ).strip()

            if not transcript:

                return jsonify({
                    "error": "No speech detected. Please try again."
                }), 422

            return jsonify({
                "transcript": transcript
            })

    except Exception as error:

        print(
            "GNANI STT ERROR:",
            repr(error),
            flush=True
        )

        return jsonify({
            "error": "Speech recognition failed: " + str(error)
        }), 500


# --------------------------------------------------
# GNANI TEXT TO SPEECH
# --------------------------------------------------

@app.route("/api/tts", methods=["POST"])
def text_to_speech():

    data = request.get_json(silent=True) or {}

    text = str(data.get("text", "")).strip()

    voice = data.get("voice", "Riyaa")

    language = data.get("language", "hi-IN")

    if not text:

        return jsonify({
            "error": "No text provided."
        }), 400

    if len(text) > 5000:

        return jsonify({
            "error": "Speech text is too long."
        }), 400

    if language not in LANGUAGE_NAMES:
        language = "hi-IN"

    try:

        audio_bytes = tts_client.synthesize(
            text,
            voice=voice,
            model="timbre-v3.0",
            language=language
        )

        return send_file(
            BytesIO(audio_bytes),
            mimetype="audio/wav",
            as_attachment=False,
            download_name="voxora_response.wav"
        )

    except Exception:

        logging.exception(
            "Gnani TTS failed"
        )

        return jsonify({
            "error": "Voice generation failed. Please try again."
        }), 500


# --------------------------------------------------
# HEALTH CHECK
# --------------------------------------------------

@app.route("/api/health")
def health():

    return jsonify({
        "application": "Voxora AI",
        "status": "running",
        "gnani_stt": "configured",
        "gnani_tts": "configured",
        "gemini": "configured",
        "conversation_memory": "enabled",
        "first_greeting": "enabled"
    })


# --------------------------------------------------
# RUN APPLICATION
# --------------------------------------------------

if __name__ == "__main__":

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )
