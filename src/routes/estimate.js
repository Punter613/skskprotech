const express = require('express');
const router = express.Router();
const orchestrator = require('../core/orchestrator/main.orchestrator');
const { decodeVinNhtsa } = require('../services/vin');

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
      vin = ''
    } = req.body;

    let vehicleProfile = { ...vehicle, vin, mileage: Number(mileage) };

    if (vin && (!vehicleProfile.make || !vehicleProfile.model)) {
      const decoded = await decodeVinNhtsa(vin);
      if (decoded) vehicleProfile = { ...vehicleProfile, ...decoded };
    }

    const input = [...customerStates, ...mechanicNotices, ...obdCodes].filter(Boolean).join('. ');

    const result = await orchestrator.process({
      input: input || 'General estimation request',
      vehicleProfile,
      context: { forceSpecialist: 'estimate' }
    });

    // IMPROVED BACKWARD COMPATIBILITY WRAPPER
    const aiOutputRaw = result.pipeline?.ai?.output;
    let aiParsed = {};
    try {
      aiParsed = typeof aiOutputRaw === 'string' ? JSON.parse(aiOutputRaw) : aiOutputRaw;
    } catch (e) {}

    const legacyEstimate = {
      priority: result.decision?.urgency?.toLowerCase() || 'medium',
      diagnosis: result.decision?.reasoning || 'Diagnostic complete',
      laborCost: result.decision?.economicAnalysis?.timelines?.replaceToday?.laborCost || laborRate,
      partsCost: result.decision?.economicAnalysis?.timelines?.replaceToday?.partsCost || partsCost,
      total: result.decision?.economicAnalysis?.timelines?.replaceToday?.totalCost || (laborRate + partsCost),
      repairs: aiParsed?.parts?.map(p => `${p.description} (${p.partNumber})`) || ['Inspection required'],
      probability: [{ cause: result.decision?.specialist || 'Diagnostic AI', likelihood: Math.round(result.decision?.confidence * 100) }],
      knownIssues: result.pipeline?.deterministic?.overrides?.map(o => `${o.component}: ${o.detail}`) || [],
      repairSteps: aiParsed?.labor?.notes ? [aiParsed.labor.notes] : ['Follow factory manual protocols'],
      proTips: [result.decision?.action || 'Proceed with caution'],
      additionalChecks: result.pipeline?.deterministic?.checks?.map(c => `Layer ${c.layer} status: ${c.passed ? 'PASSED' : 'VIOLATION'}`) || [],
      notes: result.decision?.reasoning || ''
    };

    res.json({
      success: result.status === 'SUCCESS' || result.status === 'DETERMINISTIC_OVERRIDE',
      appliedRustPenalty: result.pipeline?.deterministic?.overrides?.length > 0,
      estimate: legacyEstimate,
      modularResult: result
    });

  } catch (err) {
    console.error('[Estimate Legacy Route] Error:', err);
    res.status(500).json({ success: false, error: 'Estimation failed' });
  }
});

router.post("/decode", async (req, res) => {
  const vin = String(req.body.vin || "").toUpperCase().trim();
  if (!vin || vin.length !== 17) return res.status(400).json({ error: "Valid 17-character VIN required" });
  try {
    const decoded = await decodeVinNhtsa(vin);
    if (!decoded) return res.status(404).json({ error: "No records found" });
    res.json(decoded);
  } catch (err) {
    res.status(502).json({ error: "VIN service unavailable" });
  }
});

module.exports = router;
