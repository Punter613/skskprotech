const express = require('express');
const router = express.Router();
const orchestrator = require('../core/orchestrator/main.orchestrator');

router.post('/', async (req, res) => {
  const { vehicle, obdCodes, vin, mileage, symptoms, notes } = req.body;

  try {
    const result = await orchestrator.process({
      input: [...(symptoms||[]), ...(obdCodes||[]), ...(notes?.[0] ? [notes] : [])].join('. '),
      vehicleProfile: vehicle || { vin, mileage: Number(mileage) },
      context: { forceSpecialist: 'diagnostic' }
    });

    const aiOutputRaw = result.pipeline?.ai?.output;
    let aiParsed = {};
    try {
      aiParsed = typeof aiOutputRaw === 'string' ? JSON.parse(aiOutputRaw) : aiOutputRaw;
    } catch (e) {}

    // RENDER COMPATIBILITY (Handles both index.html and public/index.html)
    const legacyResult = {
      urgency: result.decision?.urgency || 'Soon',
      safetyRisk: result.status === 'DETERMINISTIC_OVERRIDE',
      primaryCause: result.decision?.reasoning || 'Diagnostic complete',
      secondaryCauses: aiParsed?.rootCauses?.slice(1).map(c => c.cause) || [],
      recommendedFix: aiParsed?.diagnosticSteps?.[0] || 'Manual inspection',
      confidence: Math.round(result.decision?.confidence * 100),
      diagnosticFlow: aiParsed?.diagnosticSteps || [],
      technicalNotes: result.decision?.aiOutput || '',
      // public/index.html specific
      localVehicleTelemetry: result.pipeline?.deterministic?.metadata || {},
      notes: result.decision?.reasoning || '',
      repairSteps: aiParsed?.diagnosticSteps || []
    };

    res.json({ success: true, result: legacyResult });

  } catch (err) {
    console.error('[Diagnose Refactored] Error:', err);
    res.status(500).json({ success: false, error: 'Diagnosis failed' });
  }
});

router.post('/guide', async (req, res) => {
  const { vehicle, job, scrapedItems } = req.body;
  try {
    const result = await orchestrator.process({
      input: `Generate repair guide for ${job}`,
      vehicleProfile: typeof vehicle === 'string' ? { make: vehicle.split(' ')[1], model: vehicle.split(' ')[2] } : vehicle,
      context: { forceSpecialist: 'diagnostic', scrapedItems }
    });
    res.json({
      success: true,
      guide: result.decision?.aiOutput || 'Repair guide generated.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Guide failed' });
  }
});

module.exports = router;
