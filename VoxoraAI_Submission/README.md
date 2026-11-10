# Voxora AI
### Intelligence That Speaks Your Language.

Voxora AI is a multilingual, voice-enabled AI assistant designed to make human-computer interaction easier and more accessible.

Users can communicate with Voxora through text or voice in Hindi, English and Marathi. It uses Gnani AI for speech recognition and voice generation, while Google Gemini powers intelligent responses.

## Features

- Multilingual communication: Hindi, English and Marathi.
- Voice input using speech recognition.
- AI-generated answers using Google Gemini.
- Natural voice responses using Gnani AI TTS.
- Riyaa voice for spoken responses.
- Conversation history and follow-up questions.
- First-time greeting and assistant introduction.
- Clear Chat option to reset conversation memory.
- Responsive web interface.

## Technology Stack

**Frontend**
- HTML5
- CSS3
- JavaScript

**Backend**
- Python
- Flask

**AI and Voice Services**
- Gnani AI Speech-to-Text (STT)
- Google Gemini API
- Gnani AI Text-to-Speech (TTS)

**Additional Tools**
- FFmpeg
- Python dotenv
- Google Gen AI SDK

## Project Structure

```text
VoxoraAI/
│
├── app.py
├── .env
├── .gitignore
├── requirements.txt
│
├── templates/
│   └── index.html
│
└── static/
    ├── style.css
    └── script.js
```

## Installation and Setup

### 1. Prerequisites

Install the following:

- Python
- Visual Studio Code
- FFmpeg
- Gnani AI API key
- Google Gemini API key

### 2. Open the project

Open the VoxoraAI folder in Visual Studio Code.

### 3. Create a virtual environment

```bash
python -m venv venv
```

Activate it on Windows:

```bash
venv\Scripts\activate
```

### 4. Install dependencies

```bash
python -m pip install Flask python-dotenv google-genai gnani-vachana
```

### 5. Configure API keys

Create a `.env` file in the project root:

```env
GNANI_API_KEY=your_gnani_api_key
GEMINI_API_KEY=your_gemini_api_key
FLASK_SECRET_KEY=your_secret_key
```

Replace the placeholder values with your own API credentials.

Never upload your `.env` file to GitHub.

### 6. Start the application

```bash
python app.py
```

### 7. Open Voxora AI

Open your browser and visit:

http://127.0.0.1:5000/

Allow microphone access when prompted.

## How Voxora AI Works

1. The user enters a message or speaks through the microphone.
2. Gnani AI STT converts the recorded speech into text.
3. The text is sent to the Flask backend.
4. Google Gemini generates an intelligent response.
5. Gnani AI TTS converts the response into speech.
6. The browser plays the generated voice response.

## Important Notes

- An active internet connection is required for API services.
- API usage may consume available credits or be subject to provider limits.
- Conversation memory is currently stored in server RAM and resets when the server restarts.
- FFmpeg must be installed and available in the system PATH for audio conversion.
- Voxora does not currently provide guaranteed live web search.

## Project Goal

The goal of Voxora AI is to make AI interaction more accessible through multilingual communication and voice-based assistance.

**Voxora AI — Intelligence That Speaks Your Language.**