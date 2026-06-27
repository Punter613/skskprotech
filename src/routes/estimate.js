const express = require('express');
const router = express.Router();
const { runDiagnosticPipeline } = require('../services/pipeline.engine');
const { groqChat } = require('../services/groq');

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

function normalizeVehicle(vehicle = {}) {
  const year = Number(vehicle.year);
  const make = String(vehicle.make || '').trim();
  const model = String(vehicle.model || '').trim();
  const trim = String(vehicle.trim || '').trim();

  if (!Number.isInteger(year) || year < 1981 || year > 2035) return null;
  if (!make || !model) return null;

  return { year, make, model, trim };
}

function validateVin(vin = '') {
  vin = String(vin).trim().toUpperCase();
  if (vin.length !== 17) return { ok: false, reason: 'VIN must be 17 characters' };
  if (/[IOQ]/.test(vin)) return { ok: false, reason: 'VIN cannot contain I, O, or Q' };

  const map = { A:1, B:2, C:3, D:4, E:5, F:6, G:7, H:8, J:1, K:2, L:3, M:4, N:5, P:7, R:9, S:2, T:3, U:4, V:5, W:6, X:7, Y:8, Z:9 };
  const weights = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
  let sum = 0;

  for (let i = 0; i < 17; i++) {
    const ch = vin[i];
    const val = /\d/.test(ch) ? Number(ch) : map[ch];
    if (val == null) return { ok: false, reason: 'VIN has invalid characters' };
    sum += val * weights[i];
  }

  const check = sum % 11 === 10 ? 'X' : String(sum % 11);
  if (vin[8] !== check) return { ok: false, reason: 'VIN check digit failed' };

  return { ok: true, vin };
}

function safeEstimate(laborRate, partsCost, overrides = {}) {
  return {
    priority: 'medium',
    diagnosis: 'Manual inspection required',
    laborCost: laborRate,
    partsCost,
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
    const incoming = req.body?.incomingPayload || req.body || {};

    const vehicle = normalizeVehicle(incoming.vehicle);
    const vinCheck = validateVin(incoming.vin || '');

    if (!vehicle || !vinCheck.ok) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid vehicle data',
        details: {
          vehicle: !vehicle ? 'Vehicle year/make/model invalid or incomplete' : 'ok',
          vin: vinCheck.ok ? 'ok' : vinCheck.reason
        }
      });
    }

    const obdCodes = Array.isArray(incoming.obdCodes) ? incoming.obdCodes : [];
    const customerStates = Array.isArray(incoming.customerStates) ? incoming.customerStates : [];
    const mechanicNotices = Array.isArray(incoming.mechanicNotices) ? incoming.mechanicNotices : [];
    const laborRateNum = Math.max(0, Number(incoming.laborRate ?? 65));
    const partsCostNum = Math.max(0, Number(incoming.partsCost ?? 0));
    const mileage = Math.max(0, Number(incoming.mileage ?? 0));
    const customer = incoming.customer || {};

    let pipelineResults = {};
    let rustBeltMultiplier = 1.0;

    try {
      pipelineResults = runDiagnosticPipeline({
        vehicle,
        vin: vinCheck.vin,
        symptoms: [...customerStates, ...mechanicNotices],
        codes: obdCodes,
        mileage,
        laborRate: laborRateNum
      }, { log: () => {} });

      if (pipelineResults?.profile?.rustMultiplier > 1.0) {
        rustBeltMultiplier = pipelineResults.profile.rustMultiplier;
      }
    } catch (pipelineErr) {
      console.warn('[Estimate Engine] Pipeline background pass skipped:', pipelineErr.message);
    }

    const vehicleStr = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ');
    const systemPrompt = `You are the expert estimation module of SKSK ProTech. Output a single valid JSON object only.`;

    const userPrompt = `Vehicle: ${vehicleStr}
VIN: ${vinCheck.vin}
Shop Rate: $${laborRateNum}/hr | Parts Budget: $${partsCostNum} | Rust Multiplier: ${rustBeltMultiplier}x
OBD Codes: ${obdCodes.join(', ') || 'None'}
Customer Reports: ${customerStates.join(', ') || 'N/A'}
Mechanic Notices: ${mechanicNotices.join(', ') || 'N/A'}`;

    const groqRes = await groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { max_tokens: 1400, temperature: 0.2 });

    const aiText = typeof groqRes === 'string' ? groqRes : (groqRes?.choices?.[0]?.message?.content || '');
    let parsed = extractJSON(aiText);

    if (!parsed) {
      parsed = safeEstimate(laborRateNum, partsCostNum, { notes: 'AI parse failed — safety fallback used.' });
    }

    const estimatedHours = Math.max(0, Number(parsed.estimatedHours ?? 1));
    const finalEstimate = {
      ...safeEstimate(laborRateNum, partsCostNum),
      ...parsed,
      estimatedHours,
      laborCost: Number((estimatedHours * laborRateNum * rustBeltMultiplier).toFixed(2)),
      partsCost: partsCostNum
    };
    finalEstimate.total = Number((finalEstimate.laborCost + finalEstimate.partsCost).toFixed(2));

    if (!['high', 'medium', 'low'].includes(finalEstimate.priority)) {
      finalEstimate.priority = 'medium';
    }

    try {
      const db = require('../services/db');
      if (db) {
        await db.from('estimates').insert({
          total: finalEstimate.total,
          details: { ...finalEstimate, customer, vehicle, vin: vinCheck.vin }
        });
      }
    } catch {}

    res.json({
      success: true,
      appliedRustPenalty: rustBeltMultiplier > 1.0,
      vehicle,
      vin: vinCheck.vin,
      estimate: finalEstimate
    });
  } catch (err) {
    console.error('[Estimate System Fault]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Estimate generation failed completely.',
      details: err.message
    });
  }
});

module.exports = router;
