// public/voiceUI.js

// 🔌 Dynamic URL router that adjusts instantly between local bench testing and Render
const API_BASE = location.hostname === "localhost" || location.hostname === "127.0.0.1"
  ? "http://localhost:10000" 
  : "https://p613-backend.onrender.com";

let mediaRecorder;
let audioChunks = [];
let activePreviewElement = null;

document.addEventListener("DOMContentLoaded", () => {
  const container = document.querySelector(".sksk-fleet-dashboard");
  if (!container) return;

  // Track pointer down actions (cuts out touch latency on shop mobile terminals)
  container.addEventListener("pointerdown", (e) => {
    if (e.target && e.target.classList.contains("micCaptureBtn")) {
      e.preventDefault();
      startVoiceCapture(e.target);
    }
  });

  // Track pointer up actions to immediately lock and process the audio binary buffer
  container.addEventListener("pointerup", (e) => {
    if (e.target && e.target.classList.contains("micCaptureBtn")) {
      e.preventDefault();
      stopVoiceCapture(e.target);
    }
  });
});

async function startVoiceCapture(buttonElement) {
  audioChunks = [];
  activePreviewElement = buttonElement.nextElementSibling; // Targets the local .transcriptionPreview window
  
  buttonElement.style.background = "#ff4a4a";
  buttonElement.style.color = "#fff";
  buttonElement.innerText = "🔴 RECORDING LIVE... (RELEASE TO PROCESS)";
  if (activePreviewElement) activePreviewElement.innerText = "Listening to bay communications stream...";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    
    mediaRecorder.ondataavailable = event => {
      if (event.data && event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      // 🧠 FIXED: Enforce absolute data boundary protection by creating blob explicitly inside the flushed thread
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const targetVin = buttonElement.getAttribute("data-vin");
      
      if (audioBlob.size > 1000) { // Verify audio contains true content
        await shipAudioToPipeline(audioBlob, targetVin);
      } else {
        if (activePreviewElement) activePreviewElement.innerText = "⚠️ Audio sample too short. Please hold down longer.";
      }
    };

    // Request audio chunks every 250ms to ensure constant buffer flushing to memory
    mediaRecorder.start(250);
  } catch (err) {
    alert(`Microphone channel initialization blocked: ${err.message}`);
    resetMicButton(buttonElement);
  }
}

function stopVoiceCapture(buttonElement) {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    // Stop all audio track streams to release the hardware mic indicator on the mobile screen
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
  resetMicButton(buttonElement);
}

function resetMicButton(btn) {
  btn.style.background = "#3ddc84";
  btn.style.color = "#000";
  btn.innerText = "🎙️ HOLD TO DICTATE FIELD NOTES";
}

async function shipAudioToPipeline(blob, vin) {
  const formData = new FormData();
  formData.append("audio", blob, "field_notes.webm");

  if (activePreviewElement) activePreviewElement.innerText = "⏳ Running Groq sanitization & calculating full pipeline sequence...";

  try {
    // 🔀 FIXED: Aligned target URL pathing cleanly to map right through your active /api/scrape route lane
    const response = await fetch(`${API_BASE}/api/scrape/voice-ingest`, {
      method: "POST",
      headers: {
        "X-Tenant-ID": "da39b560-84a1-432d-944f-12d8a9461234",
        "X-Target-VIN": vin || ""
      },
      body: formData
    });

    if (!response.ok) throw new Error(`Server returned HTTP network status error code: ${response.status}`);
    const result = await response.json();
    
    if (activePreviewElement) {
      activePreviewElement.innerHTML = `<strong>Processed Note:</strong> "${result.text || '[No speech detected]'}"`;
    }
    
    if (result.pipeline_triggered) {
      if (typeof loadFleetRoster === "function") loadFleetRoster(); // Hot-reload UI rows instantly
    }
  } catch (err) {
    console.error('[Voice UI Processing Exception Caught]', err);
    if (activePreviewElement) activePreviewElement.innerText = `Ingestion error: ${err.message}`;
  }
}
