const express = require('express');
const router = express.Router();
const { groqChat } = require('../services/groq');
const { evaluateSafetyRisk } = require('../knowledge/vehicle.risk.table');
const { findKnownPatterns } = require('../knowledge/failure.patterns');
const { calculateConfidence } = require('../knowledge/confidence.scorer');

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
    diagnosticConfidence: { percentage: 30, rating: 'LOW' }, // Added to base schema
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
      vehicle = {}
    } = req.body;

    // 1. Run Local Logic Core Analysis Intercepts
    const localSafetyResult = evaluateSafetyRisk(symptoms, notes, vehicle);
    const matchedPatterns = findKnownPatterns(vehicle, symptoms, codes, notes);
    const confidenceScore = calculateConfidence({
      patternMatches: matchedPatterns.length,
      codeCount: codes.length,
      symptomCount: symptoms.length,
      safetyTriggered: localSafetyResult.safetyRisk
    });

    // 2. Format the Structural System Prompt
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

    // Inject exact platform profile into prompt reasoning tree (Issue #4)
    if (matchedPatterns.length > 0) {
      systemPrompt += `\\n\\nVEHICLE FAILURE PROFILE AND HISTORICAL LIABILITIES:
${JSON.stringify(matchedPatterns, null, 2)}
You MUST evaluate these confirmed local database records first when calculating diagnostic causes.`;
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

    console.log('[Diagnose Engine v2] Processing pipeline loop...');
    const groqRes = await groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { max_tokens: 1400, temperature: 0.2 });

    const aiText = typeof groqRes === 'string'
      ? groqRes
      : (groqRes?.choices?.[0]?.message?.content || '');

    if (!aiText) throw new Error('Groq returned empty response payload');

    let parsed = extractJSON(aiText);

    // Issue #3 - Prevent object payload edge-case crashes
    if (!parsed || typeof parsed !== 'object') {
      console.warn('[Diagnose Engine] JSON layout broken or corrupted. Falling back.');
      parsed = safeResult();
    }

    // 3. Force Local Database Enforcement Overrides
    const finalResult = { ...safeResult(), ...parsed };

    // Enforce local confidence matrix (Issue #2)
    finalResult.diagnosticConfidence = confidenceScore;

    // Enforce known liabilities survival path (Issue #1)
    if (matchedPatterns.length > 0) {
      const dbIssues = matchedPatterns.flatMap(p => p.knownIssues || []);
      finalResult.knownIssues = [
        ...new Set([...(finalResult.knownIssues || []), ...dbIssues])
      ];
    }

    // Enforce safety critical flags
    if (localSafetyResult.safetyRisk) {
      finalResult.safetyRisk = true;
      finalResult.urgency = 'immediate';
      if (!finalResult.notes.includes('Safety Risk Flagged')) {
        finalResult.notes = `${localSafetyResult.riskNotes} ${finalResult.notes}`.trim();
      }
    }

    if (!['immediate', 'soon', 'monitor'].includes(finalResult.urgency)) {
      finalResult.urgency = 'soon';
    }

    // Optional DB tracking save hooks
    try {
      const db = require('../services/db');
      if (db) await db.from('diagnostics').insert({ input: req.body, result: finalResult });
    } catch (e) { }

    res.json({ success: true, result: finalResult });

  } catch (err) {
    console.error('[Diagnose Engine v2 Crash]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Diagnosis failed',
      details: err.message
    });
  }
});

module.exports = router;