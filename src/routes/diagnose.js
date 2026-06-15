const express = require('express');
const router = express.Router();
const { groqChat } = require('../services/groq');
const { getVehicleRiskProfile } = require('../knowledge/vehicle.risk.table');
const { findKnownPatterns } = require('../knowledge/failure.patterns');
const { calculateConfidence } = require('../knowledge/confidence.scorer');
const { REPAIR_INTELLIGENCE_VAULT } = require('../knowledge/repair.intelligence.library');

function extractJSON(text) {
  if (!text) return null;
  text = text.replace(/\`\`\`json\\s*/gi, '').replace(/\`\`\`\\s*/g, '');
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

function safeResult(overrides = {}) {
  return {
    urgency: 'soon',
    safetyRisk: false,
    primaryCause: 'Manual field inspection required',
    secondaryCauses: [],
    codeExplanations: {},
    probability: [],
    knownIssues: [],
    repairSteps: [],
    proTips: [],
    recommendedTests: [],
    additionalChecks: [],
    estimatedRepairTime: 'N/A',
    notes: '',
    diagnosticConfidence: { percentage: 30, rating: 'LOW' },
    localVehicleTelemetry: null,
    injectedFieldProtocols: null,
    ...overrides
  };
}

router.post('/', async (req, res) => {
  try {
    const {
      vin = '',
      mileage = 0,
      symptoms = [],
      codes = [],
      notes = [],
      vehicle = {}
    } = req.body;

    console.log('[Pipeline v3] Initializing Data Core Run...');

    // 1. Query Local Risk Profile Database
    const targetRiskProfile = getVehicleRiskProfile(vehicle);

    // 2. Scan Platform Failure Patterns Core Logic
    const matchedPatterns = findKnownPatterns(vehicle, symptoms, codes, notes);

    // 3. Evaluate Safety Threat Matrix Controls
    let localSafetyTriggered = false;
    let localSafetyNotes = '';
    
    if (targetRiskProfile) {
      const combinedText = [...symptoms, ...codes, ...notes].join(' ').toLowerCase();
      const hazardousElements = targetRiskProfile.safetyCriticalComponents || [];
      for (const component of hazardousElements) {
        if (combinedText.includes(component.replace('_', ' '))) {
          localSafetyTriggered = true;
          localSafetyNotes = `[Database Critical Alert] This component match matches known risk arrays for a ${targetRiskProfile.vehicleId}.`;
        }
      }
    }

    // 4. Extract Real Field Intelligence Protocols
    let fieldProtocols = null;
    if (targetRiskProfile && targetRiskProfile.vehicleId === 'FORD_F150_5.4_TRITON') {
      fieldProtocols = REPAIR_INTELLIGENCE_VAULT['FORD_54_TRITON_SPARK_PLUG'];
    } else if (targetRiskProfile && targetRiskProfile.vehicleId === 'GM_5.3_VORTEC_AFM') {
      fieldProtocols = REPAIR_INTELLIGENCE_VAULT['GM_53_AFM_LIFTER_REPLACE'];
    }

    // 5. Calculate Data Confidence Score
    const confidenceScore = calculateConfidence({
      patternMatches: matchedPatterns.length,
      codeCount: codes.length,
      symptomCount: symptoms.length,
      safetyTriggered: localSafetyTriggered
    });

    // 6. Assemble the System Prompt with Embedded DB Records
    let systemPrompt = `You are the expert reasoning engine of SKSK ProTech. You MUST output a single valid JSON object matching the requested structure.

Use EXACTLY this layout structure template:
{
  "urgency": "immediate",
  "safetyRisk": true,
  "primaryCause": "string",
  "secondaryCauses": ["string"],
  "codeExplanations": {"P0300": "explanation"},
  "probability": [{"cause": "string", "likelihood": 80}],
  "knownIssues": ["string"],
  "repairSteps": ["string"],
  "proTips": ["string"],
  "recommendedTests": ["string"],
  "additionalChecks": ["string"],
  "estimatedRepairTime": "string",
  "notes": "string"
}`;

    if (targetRiskProfile) {
      systemPrompt += `\\n\\nCRITICAL LOCAL DATABASE RISK PROFILE DETECTED:
${JSON.stringify(targetRiskProfile, null, 2)}
You MUST integrate this model profile and its known common failures when building your diagnostic lines.`;
    }

    if (fieldProtocols) {
      systemPrompt += `\\n\\nHARD MECHANICAL REPAIR PROTOCOLS TO ENFORCE:
${JSON.stringify(fieldProtocols, null, 2)}
Ensure any generated repair steps coordinate with the shop and field strategies listed above.`;
    }

    systemPrompt += `\\n\\nRULES:
- urgency: EXACTLY one of "immediate", "soon", or "monitor"
- safetyRisk: boolean true or false only
- All output must be valid raw JSON blocks only.`;

    const userPrompt = `Vehicle Context: Year: ${vehicle.year || 'N/A'}, Make: ${vehicle.make || 'N/A'}, Model: ${vehicle.model || 'N/A'}, Engine: ${vehicle.trim || 'N/A'}
Codes: ${codes.join(', ')} | Symptoms: ${symptoms.join(', ')} | Tech Notes: ${notes.join(', ')}`;

    console.log('[Pipeline v3] Dispatched data arrays to Groq cluster...');
    const groqRes = await groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { max_tokens: 1500, temperature: 0.15 });

    const aiText = typeof groqRes === 'string' ? groqRes : (groqRes?.choices?.[0]?.message?.content || '');
    if (!aiText) throw new Error('Groq returned an empty response text stream.');

    let parsed = extractJSON(aiText);
    if (!parsed || typeof parsed !== 'object') {
      parsed = safeResult();
    }

    // 7. Execute Total Database Rule Enforcement Overrides right before payload delivery
    const finalResult = { ...safeResult(), ...parsed };

    finalResult.diagnosticConfidence = confidenceScore;
    finalResult.localVehicleTelemetry = targetRiskProfile;
    finalResult.injectedFieldProtocols = fieldProtocols;

    // Force hard overrides if local rules match database profiles
    if (targetRiskProfile) {
      finalResult.knownIssues = [
        ...new Set([...(finalResult.knownIssues || []), ...(targetRiskProfile.commonFailures || [])])
      ];
    }

    if (localSafetyTriggered) {
      finalResult.safetyRisk = true;
      finalResult.urgency = 'immediate';
      finalResult.notes = `${localSafetyNotes} ${finalResult.notes}`.trim();
    }

    res.json({ success: true, result: finalResult });

  } catch (err) {
    console.error('[Pipeline v3 Crash]:', err.message);
    res.status(500).json({ success: false, error: 'Internal logic tracking failure.', details: err.message });
  }
});

module.exports = router;