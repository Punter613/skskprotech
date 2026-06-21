#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=========================================="
echo "🛠️ Aligning Diagnose JSON Engine 🛠️"
echo "=========================================="

cat << 'JS' > src/routes/diagnose.js
const express = require('express');
const router = express.Router();
const { runDiagnosticPipeline } = require('../brain/diagnosis.engine');
const { groqChat } = require('../services/groq');

router.post('/', async (req, res) => {
  try {
    // Map incoming front-end names down to our brain engine expectations
    const {
      vin = "",
      mileage = 0,
      symptoms = [],
      codes = [],
      notes = []
    } = req.body;

    // Fast breakdown of dummy vehicle details since client side didn't supply full make text in this tab
    const vehicle = { year: "2008", make: "Ford", model: "F150", trim: "" };

    const pipelineResults = runDiagnosticPipeline({
      obdCodes: codes,
      customerStates: symptoms,
      mechanicNotices: notes,
      vehicle,
      mileage
    });

    const systemPrompt = `You are the expert logic unit of SKSK ProTech. You MUST output a valid JSON object matching this structure exactly, with NO extra markdown formatting outside the JSON wrapper:
{
  "urgency": "immediate" or "soon" or "monitor",
  "safetyRisk": true,
  "primaryCause": "The main component failure text",
  "secondaryCauses": ["Other item 1", "Other item 2"],
  "codeExplanations": { "P0300": "Random Misfire Detected" },
  "probability": [{"cause": "Timing Chain Wear", "likelihood": 70}],
  "knownIssues": ["Triton spark plugs break"],
  "repairSteps": ["Step 1", "Step 2"],
  "proTips": ["Tip 1"],
  "recommendedTests": ["Test 1"],
  "additionalChecks": ["Check 1"],
  "estimatedRepairTime": "2.5 hours",
  "notes": "Field logic observations"
}`;

    const userPrompt = `Analyze OBD codes: ${codes.join(', ')} and symptoms: ${symptoms.join(', ')}.`;

    console.log('[Route] Fetching structured JSON from Groq for diagnostics...');
    const aiResponse = await groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    const cleanJsonString = aiResponse.replace(/```json|```/g, '').trim();
    const parsedResult = JSON.parse(cleanJsonString);

    res.json({
      success: true,
      result: parsedResult
    });

  } catch (err) {
    console.error('[Route Error] Diagnosis failed:', err.message);
    res.status(500).json({ success: false, error: 'Failed to build structured diagnostic component.' });
  }
});

module.exports = router;
JS

node -c src/routes/diagnose.js
git add src/routes/diagnose.js
git commit -m "Map frontend keys to diagnostic loop and force JSON response formatting"
git push
echo "✅ Diagnostic backend updated!"
rm fix_diagnose_backend.sh
