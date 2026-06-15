const express = require('express');
const router = express.Router();
const { runDiagnosticPipeline } = require('../brain/diagnosis.engine');
const { groqChat } = require('../services/groq');

router.post('/', async (req, res) => {
  try {
    const {
      vin = "",
      mileage = 0,
      symptoms = [],
      codes = [],
      notes = []
    } = req.body;

    const vehicle = { year: "2008", make: "Ford", model: "F150", trim: "" };

    const pipelineResults = runDiagnosticPipeline({
      obdCodes: codes,
      customerStates: symptoms,
      mechanicNotices: notes,
      vehicle,
      mileage
    });

    const systemPrompt = `You are the expert logic unit of SKSK ProTech. You MUST output a single, valid JSON object matching this structure exactly. Do not include any backticks, markdown code blocks, or commentary.

{
  "urgency": "immediate",
  "safetyRisk": true,
  "primaryCause": "Worn rear brake pads grinding on rotors",
  "secondaryCauses": ["Sticking rear brake caliper", "Worn wheel bearing"],
  "codeExplanations": { "P0300": "Random/Multiple Cylinder Misfire Detected" },
  "probability": [{"cause": "Brake Pad Wear", "likelihood": 75}, {"cause": "Caliper Seized", "likelihood": 25}],
  "knownIssues": ["Rear caliper slides freeze up due to rust"],
  "repairSteps": ["Remove rear wheels and inspect calipers", "Replace pads and rotors if grooved", "Service caliper slider pins"],
  "proTips": ["Always compress the piston slowly and watch for smooth boot travel"],
  "recommendedTests": ["Check caliper bracket slide pins for free movement", "Inspect rotor surface for heat spots"],
  "additionalChecks": ["Check brake fluid level and moisture content"],
  "estimatedRepairTime": "1.5 - 2.5 hours",
  "notes": "Grinding noise heavily indicates metal-on-metal contact. Prioritize inspection."
}

CRITICAL: For the "urgency" key, use exactly one of these strings: "immediate", "soon", or "monitor". Do not output or combine options. Output pure raw JSON text only.`;

    const userPrompt = `Analyze OBD codes: ${codes.join(', ')} and symptoms: ${symptoms.join(', ')}. Tech notes: ${notes.join(', ')}`;

    console.log('[Route] Fetching structured JSON from Groq for diagnostics...');
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

    const cleanJsonString = aiText.replace(/```json|```/g, '').trim();
    const parsedResult = JSON.parse(cleanJsonString);

    res.json({
      success: true,
      result: parsedResult
    });

  } catch (err) {
    console.error('[Route Error] Diagnosis failed:', err.message || err);
    res.status(500).json({ success: false, error: 'Failed to build structured diagnostic component.', details: err.message });
  }
});

module.exports = router;
