const express = require('express');
const router = express.Router();
const { runDiagnosticPipeline } = require('../services/pipeline.engine');
const { scrapeLEMONManuals } = require("../services/lemon");
const { groqChat } = require('../services/groq');

// Bracket-depth extraction logic to handle loose markdown text boundaries safely
function extractJSON(text) {
  if (!text) return null;
  text = text.replace(/```jsons*/gi, '').replace(/```s*/g, '');
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

    // Run the hardened production compiler pipeline pass (Graceful Fallback)
    let pipelineResults = {};
    let rustBeltMultiplier = 1.0;

    try {
      pipelineResults = runDiagnosticPipeline({
        vehicle,
        vin,
        symptoms: [...customerStates, ...mechanicNotices],
        codes: obdCodes,
        mileage,
        laborRate: laborRateNum
      }, { log: () => {}, logs: [] });

      if (pipelineResults.profile && pipelineResults.profile.rustMultiplier > 1.0) {
        rustBeltMultiplier = pipelineResults.profile.rustMultiplier;
      }
    } catch (pipelineErr) {
      console.warn('[Estimate Engine] Pipeline background pass skipped:', pipelineErr.message);
    }

    // Decode VIN to get vehicle info
    let vehicleInfo = vehicle;
    if (vin && (!vehicleInfo.make || !vehicleInfo.model)) {
      try {
        const decodeResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/estimateHeuristic/decode`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vin })
        });
        if (decodeResponse.ok) {
          vehicleInfo = await decodeResponse.json();
        }
      } catch (err) {
        console.warn('[VIN Decode] Failed:', err.message);
      }
    }

    // Try to scrape LEMON manuals
    let manuals = null;
    let appliedRustPenalty = rustBeltMultiplier > 1.0;
    
    if (vin && vehicleInfo.make && vehicleInfo.model) {
      try {
        manuals = await scrapeLEMONManuals(vehicleInfo);
        if (manuals && manuals.length > 0) {
          appliedRustPenalty = true;
          console.log(`✅ [LEMON Scraper] Found ${manuals.length} manual pages`);
        }
      } catch (scraperErr) {
        console.warn('[LEMON Scraper] Failed:', scraperErr.message);
      }
    }

    const vehicleStr = [vehicleInfo.year, vehicleInfo.make, vehicleInfo.model, vehicleInfo.trim, (vehicleInfo.engine || vehicleInfo.motorSize || "")].filter(Boolean).join(" ") || "Unknown Vehicle";

    // Add manuals to prompt if available
    let manualsContext = '';
    if (manuals && manuals.length > 0) {
      manualsContext = `

LEMON MANUALS RELEVANT TO THIS REPAIR:
${JSON.stringify(manuals.slice(0, 20), null, 2)}

Use these manual pages to find exact repair procedures, torque specs, and diagrams.`;
    }

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
- laborCost = estimatedHours x ${laborRateNum} x ${rustBeltMultiplier}
- total = laborCost + partsCost
- All array values must be strings
- Output raw JSON only
${manualsContext}`;

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

    const aiText = typeof groqRes === 'string' ? groqRes : (groqRes?.choices?.[0]?.message?.content || '');
    if (!aiText) throw new Error('Groq returned empty response strings');

    let parsed = extractJSON(aiText);
    if (!parsed) {
      console.warn('[Estimate Engine] JSON extract failed. Falling back.');
      parsed = safeEstimate(laborRateNum, partsCostNum, { notes: 'AI parse failed — output falling back to safety defaults.' });
    }

    const finalEstimate = { ...safeEstimate(laborRateNum, partsCostNum), ...parsed };

    if (!['high', 'medium', 'low'].includes(finalEstimate.priority)) {
      finalEstimate.priority = 'medium';
    }

    // Add manuals to estimate if available
    if (manuals && manuals.length > 0) {
      finalEstimate.manuals = manuals;
    }

    try {
      const db = require('../services/db');
      if (db) await db.from('estimates').insert({
        total: finalEstimate.total,
        details: { ...finalEstimate, customer, vehicle }
      });
    } catch (e) { /* DB target optional */ }

    res.json({
      success: true,
      appliedRustPenalty: appliedRustPenalty,
      estimate: finalEstimate
    });

  } catch (err) {
    console.error('[Estimate System Fault]:', err.message);
    res.status(500).json({ success: false, error: 'Estimate generation failed completely.', details: err.message });
  }
});

// Factory VIN decoder
router.post("/decode", async (req, res) => {
  const vin = String(req.body.vin || "").toUpperCase().trim();

  if (!vin || vin.length !== 17) {
    return res.status(400).json({ error: "Valid 17-character VIN required" });
  }

  try {
    const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?format=json`);
    const data = await response.json();
    const vehicle = data.Results?.[0];

    if (!vehicle || !vehicle.Make) {
      return res.status(404).json({ error: "No factory records found for this VIN layout" });
    }

    return res.json({
      year: vehicle.ModelYear || "",
      make: vehicle.Make || "",
      model: vehicle.Model || "",
      trim: vehicle.Trim || "",
      engine: vehicle.DisplacementL ? `${vehicle.DisplacementL}L` : ""
    });
  } catch (err) {
    console.error("❌ [VIN Decoder Error]:", err.message);
    return res.status(502).json({ error: "Failed to communicate with federal decoding infrastructure" });
  }
});

module.exports = router;
