
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    // =====================================
    // ELEMENTS
    // =====================================

    const micButton = document.getElementById("micButton");
    const sendButton = document.getElementById("sendButton");
    const messageInput = document.getElementById("messageInput");
    const messages = document.getElementById("messages");
    const statusText = document.getElementById("statusText");
    const voiceInstruction = document.getElementById("voiceInstruction");
    const typingIndicator = document.getElementById("typingIndicator");
    const languageSelect = document.getElementById("languageSelect");
    const languageTrigger = document.getElementById("languageTrigger");
    const languageMenu = document.getElementById("languageMenu");
    const selectedLanguage = document.getElementById("selectedLanguage");
    const audioPlayer = document.getElementById("audioPlayer");
    const clearChatButton = document.getElementById("clearChat");

    // Check important HTML elements.
    const requiredElements = {
        micButton,
        sendButton,
        messageInput,
        messages,
        statusText,
        typingIndicator,
        languageSelect,
        audioPlayer,
        clearChatButton
    };

    const missingElements = Object.entries(requiredElements)
        .filter(([, element]) => !element)
        .map(([name]) => name);

    if (missingElements.length > 0) {
        console.error("Voxora missing HTML elements:", missingElements);
        return;
    }

    // =====================================
    // STATE
    // =====================================

    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;
    let isBusy = false;
    let currentAudioUrl = null;

    // =====================================
    // STATUS HELPERS
    // =====================================

    function setStatus(message, instruction = "") {
        statusText.textContent = message;

        if (voiceInstruction && instruction) {
            voiceInstruction.textContent = instruction;
        }
    }

    function setTyping(active) {
        typingIndicator.classList.toggle("active", active);
    }

    function setBusy(busy) {
        isBusy = busy;
        sendButton.disabled = busy;
        messageInput.disabled = busy;
    }

    function showError(message) {
        addMessage(message, "assistant");
        setStatus("Something went wrong", "PLEASE TRY AGAIN");
    }

    // =====================================
    // CHAT MESSAGE DISPLAY
    // =====================================

    function addMessage(text, sender = "assistant") {
        const row = document.createElement("div");

        row.className =
            `message-row ${sender === "user" ? "user-row" : "assistant-row"}`;

        if (sender !== "user") {
            const avatar = document.createElement("div");
            avatar.className = "chat-avatar";
            avatar.innerHTML = '<i class="fa-solid fa-sparkles"></i>';
            row.appendChild(avatar);
        }

        const body = document.createElement("div");
        body.className = "message-body";

        const meta = document.createElement("div");
        meta.className = "message-meta";

        const name = document.createElement("span");
        name.textContent = sender === "user" ? "You" : "Voxora";

        const time = document.createElement("time");
        time.textContent = new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });

        meta.append(name, time);

        const bubble = document.createElement("div");
        bubble.className =
            `message-bubble ${sender === "user" ? "user-bubble" : "assistant-bubble"}`;

        bubble.textContent = text;

        body.append(meta, bubble);
        row.appendChild(body);
        messages.appendChild(row);

        messages.scrollTop = messages.scrollHeight;
    }

    // =====================================
    // LANGUAGE DROPDOWN
    // =====================================

    function closeLanguageMenu() {
        if (!languageMenu) return;

        languageMenu.classList.remove("open");

        if (languageTrigger) {
            languageTrigger.setAttribute("aria-expanded", "false");
        }
    }

    if (languageTrigger && languageMenu) {
        languageTrigger.addEventListener("click", () => {
            const isOpen = languageMenu.classList.toggle("open");

            languageTrigger.setAttribute(
                "aria-expanded",
                String(isOpen)
            );
        });

        languageMenu.querySelectorAll("button").forEach(option => {
            option.addEventListener("click", () => {
                const language = option.dataset.value;
                const label = option.dataset.label;

                if (!language) return;

                languageSelect.value = language;

                if (selectedLanguage && label) {
                    selectedLanguage.textContent = label;
                }

                languageMenu.querySelectorAll("button").forEach(button => {
                    button.classList.remove("selected");
                });

                option.classList.add("selected");
                closeLanguageMenu();

                setStatus(
                    `Ready to speak in ${label || language}`,
                    "TAP THE MICROPHONE TO START SPEAKING"
                );
            });
        });

        document.addEventListener("click", event => {
            if (!event.target.closest(".language-picker")) {
                closeLanguageMenu();
            }
        });
    }

    // =====================================
    // TEXT TO SPEECH - GNANI
    // =====================================

    async function speakText(text) {
        try {
            const response = await fetch("/api/tts", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    text,
                    voice: "Riyaa",
                    model: "timbre-v3.0",
                    language: languageSelect.value
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || "Voice generation failed.");
            }

            const audioBlob = await response.blob();

            if (currentAudioUrl) {
                URL.revokeObjectURL(currentAudioUrl);
            }

            currentAudioUrl = URL.createObjectURL(audioBlob);
            audioPlayer.src = currentAudioUrl;
            audioPlayer.classList.add("visible");

            setStatus("Voxora is speaking...", "PLAYING VOICE RESPONSE");
            document.body.classList.add("is-speaking");

            await audioPlayer.play();

        } catch (error) {
            console.error("TTS error:", error);
            document.body.classList.remove("is-speaking");

            setStatus(
                "Your text response is ready",
                "YOU CAN CONTINUE THE CONVERSATION"
            );
        }
    }

    audioPlayer.addEventListener("ended", () => {
        document.body.classList.remove("is-speaking");

        setStatus(
            "I'm ready when you are",
            "TAP THE MICROPHONE TO START SPEAKING"
        );
    });

    // =====================================
    // GEMINI CHAT
    // =====================================

    async function sendMessage(text) {
        const cleanText = text.trim();

        if (!cleanText || isBusy) return;

        addMessage(cleanText, "user");

        messageInput.value = "";

        setBusy(true);
        setTyping(true);

        setStatus("Voxora is thinking...", "PLEASE WAIT");

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message: cleanText,
                    language: languageSelect.value
                })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    data.error || "AI response could not be generated."
                );
            }

            const answer = data.response || data.answer || data.reply;

            if (!answer) {
                throw new Error("The AI returned an empty response.");
            }

            addMessage(answer, "assistant");

            setStatus("Response received", "VOXORA HAS ANSWERED");

            await speakText(answer);

        } catch (error) {
            console.error("Chat error:", error);
            showError(error.message);

        } finally {
            setTyping(false);
            setBusy(false);
        }
    }

    // =====================================
    // SEND BUTTON
    // =====================================

    sendButton.addEventListener("click", () => {
        sendMessage(messageInput.value);
    });

    // =====================================
    // ENTER KEY
    // =====================================

    messageInput.addEventListener("keydown", event => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendMessage(messageInput.value);
        }
    });

    // =====================================
    // MICROPHONE - START RECORDING
    // =====================================

    async function startRecording() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showError("Your browser does not support microphone recording.");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true
            });

            audioChunks = [];

            const options = MediaRecorder.isTypeSupported(
                "audio/webm;codecs=opus"
            )
                ? { mimeType: "audio/webm;codecs=opus" }
                : {};

            mediaRecorder = new MediaRecorder(stream, options);

            mediaRecorder.addEventListener("dataavailable", event => {
                if (event.data && event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            });

            mediaRecorder.addEventListener("stop", async () => {
                stream.getTracks().forEach(track => track.stop());

                const audioBlob = new Blob(audioChunks, {
                    type: mediaRecorder.mimeType || "audio/webm"
                });

                await transcribeAudio(audioBlob);
            });

            mediaRecorder.start();

            isRecording = true;

            document.body.classList.add("is-listening");

            micButton.innerHTML =
                '<i class="fa-solid fa-stop"></i>';

            setStatus(
                "Listening to your voice...",
                "TAP AGAIN TO STOP RECORDING"
            );

        } catch (error) {
            console.error("Microphone error:", error);

            showError(
                "Please allow microphone access in your browser."
            );
        }
    }

    // =====================================
    // MICROPHONE - STOP RECORDING
    // =====================================

    function stopRecording() {
        if (!mediaRecorder || !isRecording) return;

        isRecording = false;

        document.body.classList.remove("is-listening");

        micButton.innerHTML =
            '<i class="fa-solid fa-microphone"></i>';

        setStatus(
            "Processing your voice...",
            "CONVERTING SPEECH TO TEXT"
        );

        mediaRecorder.stop();
    }

    // =====================================
    // SPEECH TO TEXT - GNANI
    // =====================================

    async function transcribeAudio(audioBlob) {
        const formData = new FormData();

        formData.append("audio", audioBlob, "voxora-recording.webm");
        formData.append("language", languageSelect.value);

        setBusy(true);
        setTyping(true);

        try {
            const response = await fetch("/api/stt", {
                method: "POST",
                body: formData
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || "Speech recognition failed.");
            }

            const transcript = data.transcript;

            if (!transcript || !transcript.trim()) {
                throw new Error("No speech detected. Please try again.");
            }

            setTyping(false);
            setBusy(false);

            await sendMessage(transcript);

        } catch (error) {
            console.error("STT error:", error);

            showError(error.message);

            setTyping(false);
            setBusy(false);
        }
    }

    // =====================================
    // MICROPHONE BUTTON
    // =====================================

    micButton.addEventListener("click", () => {
        if (isRecording) {
            stopRecording();
        } else if (!isBusy) {
            startRecording();
        }
    });

    // =====================================
    // CLEAR CHAT AND BACKEND MEMORY
    // =====================================

    clearChatButton.addEventListener("click", async () => {
        if (isBusy || isRecording) return;

        clearChatButton.disabled = true;

        try {
            const response = await fetch("/api/clear-chat", {
                method: "POST"
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok || !data.success) {
                throw new Error(
                    data.error || "Could not clear conversation memory."
                );
            }

            messages.innerHTML = "";

            addMessage(
                "Welcome back! What would you like to talk about?",
                "assistant"
            );

            if (currentAudioUrl) {
                URL.revokeObjectURL(currentAudioUrl);
                currentAudioUrl = null;
            }

            audioPlayer.pause();
            audioPlayer.removeAttribute("src");
            audioPlayer.load();
            audioPlayer.classList.remove("visible");

            document.body.classList.remove(
                "is-speaking",
                "is-listening"
            );

            setStatus(
                "I'm ready when you are",
                "TAP THE MICROPHONE TO START SPEAKING"
            );

            console.log("Voxora chat memory cleared.");

        } catch (error) {
            console.error("Clear chat error:", error);
            showError(error.message);

        } finally {
            clearChatButton.disabled = false;
        }
    });

    // =====================================
    // PARTICLES
    // =====================================

    const particleField = document.getElementById("particleField");

    if (particleField) {
        for (let i = 0; i < 28; i++) {
            const particle = document.createElement("span");

            particle.className = "particle";
            particle.style.left = `${Math.random() * 100}%`;
            particle.style.top = `${Math.random() * 100}%`;
            particle.style.animationDelay = `${Math.random() * 12}s`;
            particle.style.animationDuration = `${9 + Math.random() * 12}s`;

            particleField.appendChild(particle);
        }
    }

    // =====================================
    // INITIAL STATE
    // =====================================

    const initialLanguage = languageMenu
        ? languageMenu.querySelector('[data-value="hi-IN"]')
        : null;

    if (initialLanguage) {
        initialLanguage.classList.add("selected");
    }

    setStatus(
        "I'm ready when you are",
        "TAP THE MICROPHONE TO START SPEAKING"
    );

    console.log("Voxora JavaScript loaded successfully.");

});
