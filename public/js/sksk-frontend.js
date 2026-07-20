// public/js/sksk-frontend.js

// 🔌 Dynamic base routing that switches instantly between local testing and your live Render container
const BACKEND_URL =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:10000"
    : "https://p613-backend.onrender.com";

document.addEventListener('DOMContentLoaded', () => {
  const analyzeBtn = document.getElementById('btn-generate-estimate');
  const resetBtn = document.getElementById('btn-reset-session');

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
});

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
      '⏳ Initializing core pipeline layers (Deterministic → AI Router → Trust)...';
  }
  if (stepsList) {
    stepsList.innerHTML = '<li>Analyzing telemetry data arrays...</li>';
  }

  // 🧠 Enforce the nested data object structure expected by your validateVehicleProfile middleware
  const payload = {
    input: rawSymptom,
    vehicleProfile: {
      vin: vinVal,
      make: makeVal,
      model: modelVal,
      year: yearVal,
      mileage: mileageVal,
      componentData: {
        brakes: { padThickness: 1.5 }
      }
    },
    context: {
      source: 'cloudflare_pages_terminal',
      timestamp: new Date().toISOString()
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
