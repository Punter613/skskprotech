const express = require('express');
const router = express.Router();
const { groqChat } = require('../services/groq');
const { getVehicleRiskProfile } = require('../knowledge/vehicle.risk.table');
const { findKnownPatterns } = require('../knowledge/failure.patterns');
const { calculateConfidence } = require('../knowledge/confidence.scorer');
const { REPAIR_INTELLIGENCE_VAULT } = require('../knowledge/repair.intelligence.library');
const { calculateJobLabor } = require('../knowledge/labor.matrix');
const { getVinBuildTelemetry } = require('../knowledge/vin.telemetry');
const { evaluatePartsIntegrity } = require('../knowledge/parts.accuracy');

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
    primaryCause: 'Manual inspection required',
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
    calculatedLaborBreakdown: null,
    partsRiskAnalysis: null,
    vinManufacturingTelemetry: null,
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
      vehicle = {},
      laborRate = 65,
      axleCode = '' // Door jamb field target
    } = req.body;

    console.log('[Pipeline v5] Triggering Deep Component Telemetry Sweep...');

    // 1. Core Profile and Pattern Extraction
    const targetRiskProfile = getVehicleRiskProfile(vehicle);
    const matchedPatterns = findKnownPatterns(vehicle, symptoms, codes, notes);
    const isRustBeltVehicle = targetRiskProfile ? targetRiskProfile.rustMultiplier > 1.0 : false;

    // 2. Decode Advanced VIN Plant & Axle Telemetry
    const vKey = targetRiskProfile ? targetRiskProfile.vehicleId : '';
    const vinBuildProfile = getVinBuildTelemetry(vin, vKey, axleCode);

    // 3. Extract Specific Key-Indexed Component & Parts Risks
    let activeFailureKey = '';
    if (vKey === 'FORD_F150_5.4_TRITON') activeFailureKey = 'spark_plug_separation';
    else if (vKey === 'GM_5.3_VORTEC_AFM') activeFailureKey = 'afm_lifter_collapse';
    else if (vKey === 'FORD_3.5_ECOBOOST') activeFailureKey = 'vct_phaser_rattle';

    const partsRiskAnalysis = evaluatePartsIntegrity(activeFailureKey);

    // 4. Compute Comprehensive Flat Rate Labor Guide Values
    const laborBreakdown = calculateJobLabor(activeFailureKey, laborRate, isRustBeltVehicle);

    // 5. Evaluate Safety Matrix Controls
    let localSafetyTriggered = false;
    let localSafetyNotes = '';
    if (targetRiskProfile) {
      const combinedText = [...symptoms, ...codes, ...notes].join(' ').toLowerCase();
      const hazardousElements = targetRiskProfile.safetyCriticalComponents || [];
      for (const component of hazardousElements) {
        if (combinedText.includes(component.replace('_', ' '))) {
          localSafetyTriggered = true;
          localSafetyNotes = `[Database Critical Alert] Component matched to telemetry safety vectors.`;
        }
      }
    }

    // 6. Pull Custom Strategy Guides
    let fieldProtocols = REPAIR_INTELLIGENCE_VAULT[activeFailureKey === 'spark_plug_separation' ? 'FORD_54_TRITON_SPARK_PLUG' : 'GM_53_AFM_LIFTER_REPLACE'] || null;

    // 7. Calculate System Confidence
    const confidenceScore = calculateConfidence({
      patternMatches: matchedPatterns.length,
      codeCount: codes.length,
      symptomCount: symptoms.length,
      safetyTriggered: localSafetyTriggered
    });

    // 8. Assemble AI Directives
    let systemPrompt = `You are the expert reasoning unit of SKSK ProTech. Output raw JSON object matching this structure exactly.

Structure Template:
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

    if (targetRiskProfile) systemPrompt += `\\n\\nVEHICLE METRICS: ${JSON.stringify(targetRiskProfile, null, 2)}`;
    if (partsRiskAnalysis) systemPrompt += `\\n\\nPARTS TARGET RULES: ${JSON.stringify(partsRiskAnalysis, null, 2)}`;

    const userPrompt = `Vehicle: Year: ${vehicle.year || 'N/A'}, Make: ${vehicle.make || 'N/A'}, Model: ${vehicle.model || 'N/A'} | Codes: ${codes.join(', ')}`;

    const groqRes = await groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { max_tokens: 1500, temperature: 0.15 });

    const aiText = typeof groqRes === 'string' ? groqRes : (groqRes?.choices?.[0]?.message?.content || '');
    let parsed = extractJSON(aiText);
    if (!parsed || typeof parsed !== 'object') parsed = safeResult();

    // 9. Force Hard Enforcement Overrides
    const finalResult = { ...safeResult(), ...parsed };

    finalResult.diagnosticConfidence = confidenceScore;
    finalResult.localVehicleTelemetry = targetRiskProfile;
    finalResult.injectedFieldProtocols = fieldProtocols;
    finalResult.calculatedLaborBreakdown = laborBreakdown;
    finalResult.partsRiskAnalysis = partsRiskAnalysis;
    finalResult.vinManufacturingTelemetry = vinBuildProfile;
    finalResult.estimatedRepairTime = `${laborBreakdown.realWorldHours} Flat-Rate Hours`;

    if (targetRiskProfile && targetRiskProfile.riskScore > 90) {
      finalResult.primaryCause = targetRiskProfile.commonFailures?.[0] ? targetRiskProfile.commonFailures[0].replace(/_/g, ' ').toUpperCase() : finalResult.primaryCause;
    }

    if (matchedPatterns.some(p => p.likelihood >= 90)) {
      finalResult.primaryCause = matchedPatterns[0].patternName;
      finalResult.urgency = 'immediate';
      finalResult.safetyRisk = true;
    }

    if (localSafetyTriggered) {
      finalResult.safetyRisk = true;
      finalResult.urgency = 'immediate';
      finalResult.notes = `${localSafetyNotes} ${finalResult.notes}`.trim();
    }

    res.json({ success: true, result: finalResult });

  } catch (err) {
    console.error('[Pipeline v5 Fatal Error]:', err.message);
    res.status(500).json({ success: false, error: 'Internal pipeline fault.', details: err.message });
  }
});

module.exports = router;