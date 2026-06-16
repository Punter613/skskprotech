const express = require('express');
const router = express.Router();
const { runDiagnosticPipeline } = require('../services/pipeline.engine');
const { groqChat } = require('../services/groq');

// Same bulletproof extractor as diagnose.js
function extractJSON(text) {
  if (!text) return null;
  text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
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

function safeEstimate(laborRate, partsCost, overrides = {}) {
  return {
    priority: 'medium',
    diagnosis: 'Manual inspection required',
    laborCost: laborRate,
    partsCost: partsCost,
    total: laborRate + partsCost,
    repairs: ['Diagnostic inspection required'],
    probability: [],
    knownIssues: [],
    repairSteps: [],
    proTips: [],
    additionalChecks: [],
    notes: '',
    estimatedHours: 1,
    ...overrides
  };
}

router.post('/', async (req, res) => {
  try {
    const {
      vehicle = {},
      obdCodes = [],
      customerStates = [],
      mechanicNotices = [],
      laborRate = 65,
      partsCost = 0,
      mileage = 0,
      vin = '',
      customer = {}
    } = req.body;

    const laborRateNum = Math.max(0, Number(laborRate));
    const partsCostNum = Math.max(0, Number(partsCost));

    // Run local brain pipeline — non-fatal if it errors
    let pipelineResults = { topDiagnoses: [], appliedRustPenalty: false };
    let rustBeltMultiplier = 1.0;

    try {
      const raw = runDiagnosticPipeline({
        obdCodes,
        customerStates,
        mechanicNotices,
        vehicle,
        mileage
      });
      pipelineResults = raw;
      const primaryDiagnosis = raw.topDiagnoses?.[0];
      if (primaryDiagnosis?.appliedModifiers?.some(m => m.includes('Rust Belt'))) {
        rustBeltMultiplier = 1.25;
      }
    } catch (pipelineErr) {
      console.warn('[Estimate] Pipeline skipped:', pipelineErr.message);
    }

    // Build vehicle string from ACTUAL request data
    const vehicleStr = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
      .filter(Boolean).join(' ') || 'Unknown Vehicle';

    const systemPrompt = `You are the expert estimation module of SKSK ProTech — a master automotive mechanic with 25 years of real shop experience.

Output a single valid JSON object ONLY. No backticks, no markdown, no text before or after.

{
  "priority": "high",
  "diagnosis": "string",
  "estimatedHours": 2.5,
  "laborCost": 162.50,
  "partsCost": ${partsCostNum},
  "total": 242.50,
  "repairs": ["string"],
  "probability": [{"cause": "string", "likelihood": 80}],
  "knownIssues": ["string"],
  "repairSteps": ["string"],
  "proTips": ["string"],
  "additionalChecks": ["string"],
  "notes": "string"
}

RULES:
- priority: exactly "high", "medium", or "low"
- laborCost = estimatedHours x ${laborRateNum} x ${rustBeltMultiplier} (rust belt multiplier)
- total = laborCost + partsCost
- All array values must be strings
- Output raw JSON only`;

    const userPrompt = `Vehicle: ${vehicleStr}
VIN: ${vin || 'N/A'}
Shop Rate: $${laborRateNum}/hr | Parts Budget: $${partsCostNum} | Rust Multiplier: ${rustBeltMultiplier}x
OBD Codes: ${obdCodes.join(', ') || 'None'}
Customer Reports: ${customerStates.join(', ') || 'N/A'}
Mechanic Notices: ${mechanicNotices.join(', ') || 'N/A'}`;

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
      console.warn('[Estimate] JSON extract failed. Raw:', aiText.substring(0, 300));
      parsed = safeEstimate(laborRateNum, partsCostNum, { notes: 'AI parse failed — retry' });
    }

    const finalEstimate = { ...safeEstimate(laborRateNum, partsCostNum), ...parsed };

    // Sanitize priority
    if (!['high', 'medium', 'low'].includes(finalEstimate.priority)) {
      finalEstimate.priority = 'medium';
    }

    // Optional DB save
    try {
      const db = require('../services/db');
      if (db) await db.from('estimates').insert({
        total: finalEstimate.total,
        details: { ...finalEstimate, customer, vehicle }
      });
    } catch (e) { /* db optional */ }

    res.json({
      success: true,
      appliedRustPenalty: rustBeltMultiplier > 1.0,
      localBrainSummary: pipelineResults,
      estimate: finalEstimate
    });

  } catch (err) {
    console.error('[Estimate] Error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Estimate failed',
      details: err.message
    });
  }
});

module.exports = router;
