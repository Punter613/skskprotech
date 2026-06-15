const express = require('express');
const router = express.Router();
const { runDiagnosticPipeline } = require('../brain/diagnosis.engine');
const { groqChat } = require('../services/groq');

router.post('/', async (req, res) => {
  try {
    const {
      vehicle = {},
      obdCodes = [],
      customerStates = [],
      mechanicNotices = [],
      laborRate = 65,
      partsCost = 0,
      mileage = 0
    } = req.body;

    const pipelineResults = runDiagnosticPipeline({
      obdCodes,
      customerStates,
      mechanicNotices,
      vehicle,
      mileage
    });

    const primaryDiagnosis = pipelineResults.topDiagnoses[0];
    let rustBeltMultiplier = 1.0;
    if (primaryDiagnosis && primaryDiagnosis.appliedModifiers.some(m => m.includes('Rust Belt'))) {
      rustBeltMultiplier = 1.25;
    }

    const systemPrompt = `You are the expert estimation module of SKSK ProTech. You MUST output a valid JSON object matching this structure exactly, with NO extra text or markdown formatting outside the JSON block:
{
  "priority": "high" or "medium" or "low",
  "diagnosis": "Short summary sentence of findings",
  "laborCost": 130,
  "partsCost": 80,
  "total": 223,
  "repairs": ["Repair line 1", "Repair line 2"],
  "probability": [{"cause": "Issue name", "likelihood": 85}],
  "knownIssues": ["Common issue 1"],
  "repairSteps": ["Step 1", "Step 2"],
  "proTips": ["Tip 1"],
  "additionalChecks": ["Check 1"],
  "notes": "Any final field observations"
}

Vehicle Base: ${vehicle.year} ${vehicle.make} ${vehicle.model}. Labor Rate: $${laborRate}/hr. Rust Penalty: ${rustBeltMultiplier}x. Initial Parts Cost Target: $${partsCost}.`;

    const userPrompt = `Calculate target repairs for notes: "${mechanicNotices.join(', ') || 'General Inspection'}" and complaints: "${customerStates.join(', ')}"`;

    console.log('[Route] Fetching structured JSON from Groq...');
    const aiResponse = await groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    // Clean up any stray markdown wraps if the model spits '```json ... ```'
    const cleanJsonString = aiResponse.replace(/```json|```/g, '').trim();
    const parsedEstimate = JSON.parse(cleanJsonString);

    res.json({
      success: true,
      appliedRustPenalty: rustBeltMultiplier > 1.0,
      localBrainSummary: pipelineResults,
      estimate: parsedEstimate
    });

  } catch (err) {
    console.error('[Route Error] Estimation failed:', err.message);
    res.status(500).json({ success: false, error: 'Failed to stitch structured estimate object.' });
  }
});

module.exports = router;
