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

    const systemPrompt = `You are the expert estimation module of SKSK ProTech. You MUST output a valid, raw JSON object matching this structure exactly, with NO introductory text, NO markdown code blocks, and NO trailing notes outside the JSON block itself:
{
  "priority": "medium",
  "diagnosis": "Short summary sentence of findings",
  "laborCost": 130,
  "partsCost": 80,
  "total": 210,
  "repairs": ["Line-item repair description 1"],
  "probability": [{"cause": "Suspected failure component", "likelihood": 85}],
  "knownIssues": ["Common platform failure mode"],
  "repairSteps": ["Step 1 of repair protocol"],
  "proTips": ["Field mechanic workflow tip"],
  "additionalChecks": ["While you are in there check item"],
  "notes": "Final configuration observations"
}

Vehicle Parameters: 2008 Ford F150. Shop Rate: $${laborRate}/hr. Multiplier: ${rustBeltMultiplier}x. Parts Target: $${partsCost}.`;

    const userPrompt = `Generate the structured estimation payload for notes: "${mechanicNotices.join(', ') || 'General Inspection'}" and complaints: "${customerStates.join(', ')}"`;

    console.log('[Route] Fetching structured JSON from Groq...');
    const rawGroqResponse = await groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    // Extract the text content safely whether it's a raw string or an object wrapper
    const aiText = typeof rawGroqResponse === 'string' 
      ? rawGroqResponse 
      : (rawGroqResponse.choices?.[0]?.message?.content || '');

    if (!aiText) {
      throw new Error('Groq returned an empty response text block.');
    }

    // Strip out any markdown block text wrappers if present
    const cleanJsonString = aiText.replace(/```json|```/g, '').trim();
    const parsedEstimate = JSON.parse(cleanJsonString);

    res.json({
      success: true,
      appliedRustPenalty: rustBeltMultiplier > 1.0,
      localBrainSummary: pipelineResults,
      estimate: parsedEstimate
    });

  } catch (err) {
    console.error('[Route Error] Estimation failed:', err.message || err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to stitch structured estimate object.',
      details: err.message
    });
  }
});

module.exports = router;
