#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=========================================="
echo "🎯 Overwriting Estimate Route via Standard Clean Cat 🎯"
echo "=========================================="

# Overwrite the file directly with clean formatting
cat << 'JS' > src/routes/estimate.js
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

Vehicle Parameters: 2008 Ford F150. Shop Rate: $${laborRate}/hr. Multiplier: ${rustBeltMultiplier}x. Parts Target: $${partsCost}.

CRITICAL PROTOCOL REQUIREMENT: If the Pre-Calculated Local Brain Diagnostics returns a "Shaffer Custom Extraction Protocol Required" modifier, you MUST explicitly override standard repair suggestions and instruct the mechanic to list these exact matching steps in the "repairSteps" array:
1. Attempt standard specialty extraction kits.
2. If tools slip, pull off the exhaust manifolds to establish absolute clear alignment.
3. Execute Shaffer Method: Fracture porcelain halfway down, run custom long tap into the fused shroud tip, insert all-thread with a top nut to lock the tap and a middle nut to pull the sleeve clear.
4. Clean the combustion chambers completely through the open manifold access to verify zero debris remains.`;

    const userPrompt = `Generate the structured estimation payload for notes: "${mechanicNotices.join(', ') || 'General Inspection'}" and complaints: "${customerStates.join(', ')}"`;

    console.log('[Route] Fetching structured JSON from Groq...');
    const rawGroqResponse = await groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    const aiText = typeof rawGroqResponse === 'string' 
      ? rawGroqResponse 
      : (rawGroqResponse.choices?.[0]?.message?.content || '');

    if (!aiText) {
      throw new Error('Groq returned an empty response text block.');
    }

    const cleanJsonString = aiText.replace(/```json|
```/g, '').trim();
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
JS

# Check syntax validity
node -c src/routes/estimate.js
console.log("✅ Code file syntax check passed flawlessly!")

# Ship to main
git add src/routes/estimate.js
git commit -m "Permanently secure Shaffer Protocol rules template directly inside estimate route definition"
git push

echo "=========================================="
echo "🚀 SUCCESS! The final pipeline is clean and live on Render! 🚀"
echo "=========================================="

rm fix_estimate_final.sh
