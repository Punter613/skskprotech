const express = require('express');
const router = express.Router();
const { groqChat } = require('../services/groq');
const { evaluateSafetyRisk } = require('../knowledge/vehicle.risk.table');
const { findKnownPatterns } = require('../knowledge/failure.patterns');

// Bulletproof extractor — finds first valid { } block regardless of surrounding garbage
function extractJSON(text) {
  if (!text) return null;
  text = text.replace(/\`\`\`json\\s*/gi, '').replace(/\`\`\`\\s*/g, '');
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); }
        catch { return null; }
      }
    }
  }
  return null;
}

function safeResult(overrides = {}) {
  return {
    urgency: 'soon',
    safetyRisk: false,
    primaryCause: 'Unable to determine — manual inspection required',
    secondaryCauses: [],
    codeExplanations: {},
    probability: [],
    knownIssues: [],
    repairSteps: [],
    proTips: [],
    recommendedTests: [],
    additionalChecks: [],
    estimatedRepairTime: 'N/A',
    notes: '',
    ...overrides
  };
}

router.post('/', async (req, res) => {
  try {
    const {
      vin = '',
      mileage = 0,
      symptoms = [],
      codes = [],
      notes = [],
      vehicle = {} // Dynamic vehicle data from UI
    } = req.body;

    // 1. Execute Local Knowledge Core Intercepts
    const localSafetyResult = evaluateSafetyRisk(symptoms, notes, vehicle);
    const matchedPatterns = findKnownPatterns(vehicle, symptoms, codes);

    // 2. Build the System Prompt with Embedded Knowledge Base Context
    let systemPrompt = `You are the expert logic unit of SKSK ProTech — a master automotive diagnostic technician with 25 years of real shop experience.

You MUST output a single valid JSON object. No backticks, no markdown, no commentary before or after.

Use EXACTLY this structure:
{
  "urgency": "immediate",
  "safetyRisk": true,
  "primaryCause": "string",
  "secondaryCauses": ["string"],
  "codeExplanations": {"P0300": "explanation"},
  "probability": [{"cause": "string", "likelihood": 80}],
  "knownIssues": ["string"],
  "repairSteps": ["string"],
  "proTips": ["string"],
  "recommendedTests": ["string"],
  "additionalChecks": ["string"],
  "estimatedRepairTime": "string",
  "notes": "string"
}`;

    // Inject local platform knowledge if found to guide AI decision structures
    if (matchedPatterns.length > 0) {
      systemPrompt += `\\n\\nCRITICAL PLATFORM LIABILITY DATA FOUND:
The local SKSK database has confirmed high-probability failure patterns for this vehicle configuration:
${JSON.stringify(matchedPatterns, null, 2)}
You MUST weigh this historical shop intelligence heavily when determining primary causes and probabilities.`;
    }

    systemPrompt += `\\n\\nRULES:
- urgency: EXACTLY one of "immediate", "soon", or "monitor" — no other values
- safetyRisk: boolean true or false only
- All arrays contain strings only
- probability likelihood is a number 0-100
- Output raw JSON text only — nothing else`;

    const userPrompt = `Vehicle Profile: Year: ${vehicle.year || 'N/A'}, Make: ${vehicle.make || 'N/A'}, Model: ${vehicle.model || 'N/A'}, Engine/Trim: ${vehicle.trim || 'N/A'}
VIN: ${vin || 'N/A'}
Mileage: ${mileage || 'N/A'}
OBD Codes: ${codes.join(', ') || 'None'}
Symptoms: ${symptoms.join(', ') || 'N/A'}
Tech Notes: ${notes.join(', ') || 'N/A'}`;

    console.log('[Diagnose Pipeline] Running AI Analysis Loop...');
    const groqRes = await groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { max_tokens: 1400, temperature: 0.2 });

    const aiText = typeof groqRes === 'string'
      ? groqRes
      : (groqRes?.choices?.[0]?.message?.content || '');

    if (!aiText) throw new Error('Groq returned empty response');

    let parsed = extractJSON(aiText);

    if (!parsed) {
      console.warn('[Diagnose Pipeline] JSON extract failed. Falling back to safe layout.');
      parsed = safeResult({ notes: 'AI text processing exception — local default fallback applied.' });
    }

    // 3. Merge Local Knowledge Results with AI Payload to guarantee absolute authority
    const finalResult = { ...safeResult(), ...parsed };

    // Force safety overrides if local logic triggered danger states
    if (localSafetyResult.safetyRisk) {
      finalResult.safetyRisk = true;
      finalResult.urgency = 'immediate';
      if (localSafetyResult.riskNotes && !finalResult.notes.includes('Safety Risk')) {
        finalResult.notes = `${localSafetyResult.riskNotes} ${finalResult.notes}`.trim();
      }
    }

    // Double check urgency bounds
    if (!['immediate', 'soon', 'monitor'].includes(finalResult.urgency)) {
      finalResult.urgency = 'soon';
    }

    // Optional DB logging
    try {
      const db = require('../services/db');
      if (db) await db.from('diagnostics').insert({ input: req.body, result: finalResult });
    } catch (e) { /* DB target optional */ }

    res.json({ success: true, result: finalResult });

  } catch (err) {
    console.error('[Diagnose Pipeline Error]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Diagnosis failed',
      details: err.message
    });
  }
});

module.exports = router;