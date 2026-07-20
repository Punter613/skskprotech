// public/js/sksk-frontend.js

// 🔌 Dynamic base routing that switches instantly between local testing and your live Render container
const BACKEND_URL =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:10000"
    : "https://p613-backend.onrender.com";

document.addEventListener('DOMContentLoaded', () => {
  const analyzeBtn = document.getElementById('btn-generate-estimate');
  const resetBtn = document.getElementById('btn-reset-session');
  const translateBtn = document.getElementById('btn-translate');

  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await executeIntelligentAnalysis();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      purgeSessionTelemetry();
    });
  }

  if (translateBtn) {
    translateBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const rawSymptom = document.getElementById('customerStates')?.value.trim();
      if (!rawSymptom) {
        alert('Type in the customer\'s symptom description first.');
        return;
      }
      translateBtn.disabled = true;
      translateBtn.innerText = '⏳ Translating...';
      const result = await translateSymptom(rawSymptom);
      renderTranslation(result);
      translateBtn.disabled = false;
      translateBtn.innerText = '🔤 Translate Customer Words';
    });
  }
});

/**
 * 🔤 Calls the backend translator: turns plain customer language into
 * mechanic-language description + diagnostic keywords. Falls back to
 * the raw text if the call fails, never blocks the rest of the flow.
 */
async function translateSymptom(rawSymptom) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: rawSymptom })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return {
      translated: data.translated || rawSymptom,
      keywords: data.keywords || []
    };
  } catch (err) {
    console.warn('[SKSK Frontend] Translate call failed, using raw text as-is:', err.message);
    return { translated: rawSymptom, keywords: [] };
  }
}

function renderTranslation({ translated, keywords }) {
  const panel = document.getElementById('translate-output');
  const textEl = document.getElementById('translated-text');
  const keywordsEl = document.getElementById('translated-keywords');
  if (!panel || !textEl || !keywordsEl) return;

  textEl.innerText = translated;
  keywordsEl.innerHTML = keywords.length
    ? keywords.map(k => `<span class="keyword-chip">${k}</span>`).join('')
    : '<span style="color: var(--text-muted); font-size: 0.8rem;">No keywords extracted</span>';
  panel.style.display = 'block';
}

/**
 * ⚡ Gathers form parameters and executes the main orchestration pipeline pass
 */
async function executeIntelligentAnalysis() {
  const diagOutput = document.getElementById('diagnosis-output');
  const stepsList = document.getElementById('repair-steps-list');
  const readyBanner = document.getElementById('estimate-ready-banner');

  const vinVal = document.getElementById('vin')?.value.trim();
  const makeVal = document.getElementById('make')?.value.trim();
  const modelVal = document.getElementById('model')?.value.trim();
  const yearVal = Number(document.getElementById('year')?.value) || 2019;
  const mileageVal = Number(document.getElementById('mileage')?.value) || 85000;
  const rawSymptom = document.getElementById('customerStates')?.value.trim();

  if (!vinVal || !rawSymptom) {
    alert('Validation Failure: A valid VIN and Symptom narrative must be supplied to fire the SKSK core.');
    return;
  }

  if (diagOutput) {
    diagOutput.innerText =
      '⏳ Cleaning up symptom language before core pipeline pass...';
  }

  // 🧠 Auto-translate raw customer phrasing into clean mechanic language first.
  // This also sidesteps false-positive safety-model refusals that repeated
  // onomatopoeia ("clunk clunk clunk") can trigger in the raw diagnostic AI.
  const { translated: cleanSymptom, keywords } = await translateSymptom(rawSymptom);
  renderTranslation({ translated: cleanSymptom, keywords });

  if (diagOutput) {
    diagOutput.innerText =
      '⏳ Initializing core pipeline layers (Deterministic → AI Router → Trust)...';
  }
  if (stepsList) {
    stepsList.innerHTML = '<li>Analyzing telemetry data arrays...</li>';
  }

  // 🧠 Enforce the nested data object structure expected by your validateVehicleProfile middleware
  const payload = {
    input: cleanSymptom,
    vehicleProfile: {
      vin: vinVal,
      make: makeVal,
      model: modelVal,
      year: yearVal,
      mileage: mileageVal,
      componentData: {}
      // NOTE: componentData is for REAL sensor/inspection readings only
      // (brake pad thickness, rotor runout, tread depth, etc). There's no
      // input in this UI to collect that yet, so leave it empty rather
      // than faking a value - a fake CRITICAL reading here permanently
      // trips the deterministic safety override on EVERY request and
      // blocks the AI from ever running, regardless of what the customer
      // actually reported. Wire real fields in before populating this.
    },
    context: {
      source: 'cloudflare_pages_terminal',
      timestamp: new Date().toISOString(),
      rawCustomerWords: rawSymptom,
      diagnosticKeywords: keywords
    }
  };

  try {
    const response = await fetch(`${BACKEND_URL}/api/intelligence/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP Error Status: ${response.status}`);
    }

    const data = await response.json();
    console.log('[SKSK Frontend] Pipeline trace data loaded:', data);

    // 🚀 Render data fields directly into the intel viewports
    if (diagOutput) {
      if (data.status === 'SUCCESS' && data.decision) {
        const d = data.decision;
        diagOutput.innerHTML =
          `<strong>STATUS:</strong> ${data.status}\n` +
          `<strong>ACTION DETERMINED:</strong> ${d.action}\n` +
          `<strong>URGENCY PROFILE:</strong> ${d.urgency}\n` +
          `<strong>CONFIDENCE MATRIX:</strong> ${d.confidence}%\n\n` +
          `<strong>REASONING TRACE:</strong>\n${d.reasoning}`;
      } else if (data.status === 'DETERMINISTIC_OVERRIDE') {
        diagOutput.innerHTML =
          `⚠️ <strong>DETERMINISTIC MANDATORY OVERRIDE HIT:</strong>\n` +
          `${data.decision?.reasoning || 'Safety firewall rule activated.'}`;
      } else {
        diagOutput.innerText = JSON.stringify(data.decision || data, null, 2);
      }
    }

    // Populate the Clearance Protocols checklist
    if (stepsList) {
      stepsList.innerHTML = '';

      const overrides =
        data.decision?.overrides ||
        data.pipeline?.deterministic?.overrides ||
        [];
      const diagnosticSteps =
        data.pipeline?.ai?.output?.diagnosticSteps || [];

      if (overrides.length > 0) {
        overrides.forEach((o) => {
          stepsList.innerHTML +=
            `<li style="border-left-color: #ff4a4a;">` +
            `🚨 <strong>MANDATORY SAFETY ACTION:</strong> ` +
            `${o.requiredAction || o.action} ` +
            `(${o.detail || 'Component threshold breach'})` +
            `</li>`;
        });
      }

      if (diagnosticSteps.length > 0) {
        diagnosticSteps.forEach((step) => {
          stepsList.innerHTML += `<li>${step}</li>`;
        });
      } else if (data.decision?.action) {
        stepsList.innerHTML +=
          `<li>Execute step standard repair workflow matching procedure: ` +
          `<strong>${data.decision.action}</strong></li>`;
        stepsList.innerHTML +=
          `<li>Run complete digital post-repair diagnostic clear on components.</li>`;
      }
    }

    if (readyBanner) {
      readyBanner.style.display = 'block';
    }
  } catch (err) {
    console.error('[Frontend Network Request Exception]', err);
    if (diagOutput) {
      diagOutput.innerText =
        `Ingestion error: ${err.message}\n\n` +
        `[Remedy]: Check your browser console network log or confirm that your Render web container is active.`;
    }
    if (stepsList) {
      stepsList.innerHTML =
        '<li style="border-left-color: #ff4a4a;">' +
        'Pipeline processing execution pass aborted due to network failure.' +
        '</li>';
    }
  }
}

/**
 * 🗑️ Purges all local forms and view elements back to system neutral states
 */
function purgeSessionTelemetry() {
  console.log('[UI] Purging local state and estimate cache.');

  const fields = ['customerStates', 'vin', 'make', 'model', 'year', 'mileage'];
  fields.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;

    if (id === 'customerStates' || id === 'vin' || id === 'make' || id === 'model') {
      el.value = '';
    } else if (id === 'year') {
      el.value = 2019;
    } else if (id === 'mileage') {
      el.value = 85000;
    }
  });

  const readyBanner = document.getElementById('estimate-ready-banner');
  if (readyBanner) {
    readyBanner.style.display = 'none';
  }

  const diagOutput = document.getElementById('diagnosis-output');
  if (diagOutput) {
    diagOutput.innerText = 'Awaiting fresh vehicle input...';
  }

  const stepsList = document.getElementById('repair-steps-list');
  if (stepsList) {
    stepsList.innerHTML =
      '<li>System waiting for analysis pipeline activation pass token context.</li>';
  }

  alert('Telemetry tracking channels successfully cleared. Terminal ready for next vehicle session.');
}
