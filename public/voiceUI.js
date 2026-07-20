// public/voiceUI.js

// 🔌 Dynamic URL router that adjusts instantly between local bench testing and Render production host
const API_BASE = location.hostname === "localhost" || location.hostname === "127.0.0.1"
  ? "http://localhost:10000" 
  : "https://onrender.com";

let mediaRecorder;
let audioChunks = [];
let activePreviewElement = null;
let recognition = null;

// Initialize native browser speech recognition fallback for ultra-resilient dictations
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
}

document.addEventListener("DOMContentLoaded", () => {
  // Select the mic button inside the terminal viewport layout frames
  const micBtn = document.getElementById("micBtn");
  if (!micBtn) return;

  // Track pointer down actions (cuts out touch latency on shop mobile terminals)
  micBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    startVoiceCapture(micBtn);
  });

  // Track pointer up actions to immediately lock and process the audio binary buffer
  micBtn.addEventListener("pointerup", (e) => {
    e.preventDefault();
    stopVoiceCapture(micBtn);
  });
});

async function startVoiceCapture(buttonElement) {
  audioChunks = [];
  // Set output target location box display metrics text
  activePreviewElement = document.getElementById("diagnosis-output");
  
  buttonElement.style.background = "#ff4a4a";
  buttonElement.style.color = "#fff";
  buttonElement.innerText = "🔴 RECORDING LIVE... (RELEASE TO PROCESS)";
  if (activePreviewElement) activePreviewElement.innerText = "Listening to bay communications stream...";

  // If local server audio paths fail, use native browser microphone stream tracks tracking fallback hooks
  if (recognition && navigator.userAgent.toLowerCase().includes('chrome')) {
    try {
      recognition.start();
      recognition.onresult = (event) => {
        const speechToText = event.results[0][0].transcript;
        applyTranscriptionToForm(speechToText);
      };
    } catch (e) { console.log("[Speech API Fallback Ready]"); }
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    
    mediaRecorder.ondataavailable = event => {
      if (event.data && event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const targetVin = buttonElement.getAttribute("data-vin") || document.getElementById('vin')?.value || "";
      
      // Ensure audio packet has binary substance before spinning network loops
      if (audioBlob.size > 1000) { 
        await shipAudioToPipeline(audioBlob, targetVin);
      } else if (!recognition) {
        if (activePreviewElement) activePreviewElement.innerText = "⚠️ Audio sample too short. Please hold down longer.";
      }
    };

    // Request audio stream buffer dumps every 250ms to protect memory loops from dropped tracks
    mediaRecorder.start(250);
  } catch (err) {
    console.warn(`Microphone channel initialization blocked, checking cloud speech fallback paths: ${err.message}`);
    if (!recognition) {
      alert(`Hardware audio channels unavailable: ${err.message}`);
      resetMicButton(buttonElement);
    }
  }
}

function stopVoiceCapture(buttonElement) {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    } catch (e) {}
  }
  if (recognition) {
    try { recognition.stop(); } catch (e) {}
  }
  resetMicButton(buttonElement);
}

function resetMicButton(btn) {
  btn.style.background = "#00f0ff";
  btn.style.color = "#040608";
  btn.innerText = "🎙️ HOLD TO DICTATE NOTES";
}

function applyTranscriptionToForm(text) {
  const notesInput = document.getElementById('customerStates');
  if (notesInput && text) {
    notesInput.value = text;
  }
  if (activePreviewElement) {
    activePreviewElement.innerHTML = `<strong>Processed Note:</strong> "${text}"\n\n[SYSTEM]: Click "Run Intelligent Analysis" to execute pipeline calculations.`;
  }
}

async function shipAudioToPipeline(blob, vin) {
  const formData = new FormData();
  formData.append("audio", blob, "field_notes.webm");

  if (activePreviewElement) activePreviewElement.innerText = "⏳ Running Groq sanitization & calculating full pipeline sequence...";

  try {
    // 🧠 FIXED: Targeted the root of your active /api/scrape mount block layout perfectly to prevent 404s
    const response = await fetch(`${API_BASE}/api/scrape`, {
      method: "POST",
      headers: {
        "X-Tenant-ID": "da39b560-84a1-432d-944f-12d8a9461234",
        "X-Target-VIN": vin || ""
      },
      body: formData
    });

    // If backend returns a non-200 or maintenance proxy, intercept it and look for native Web Speech text fallback metrics
    if (!response.ok) {
      throw new Error(`Server returned HTTP network status error code: ${response.status}`);
    }

    const result = await response.json();
    const transcriptionText = result.text || result.transcription || "";
    
    applyTranscriptionToForm(transcriptionText);
    
    if (result.pipeline_triggered && typeof loadFleetRoster === "function") {
      loadFleetRoster(); 
    }
  } catch (err) {
    console.error('[Voice UI Backend Exception Caught]', err);
    
    // If the backend drops or returns 404, we let the text capture safely fall back to the native browser speech container text
    const currentNotesValue = document.getElementById('customerStates')?.value || "";
    if (currentNotesValue && currentNotesValue !== "grinding noise when braking") {
      console.log("[Voice UI] Audio backend unavailable, successfully preserved text via native Speech API browser stream.");
    } else {
      if (activePreviewElement) {
        activePreviewElement.innerText = `Ingestion error: ${err.message}\n\n[Remedy]: Make sure your .env contains valid GROQ_API_KEY parameters or dictate into the form directly.`;
      }
    }
  }
}
