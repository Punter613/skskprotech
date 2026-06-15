const express = require('express');
const router = express.Router();
const { groqChat } = require('../services/groq');
const { getVehicleRiskProfile } = require('../knowledge/vehicle.risk.table');
const { findKnownPatterns } = require('../knowledge/failure.patterns');
const { calculateConfidence, computeDynamicRiskScore } = require('../knowledge/confidence.scorer');
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
    injectedFieldProtocols: [],
    calculatedLaborBreakdown: [],
    partsRiskAnalysis: [],
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
      axleCode = ''
    } = req.body;

    console.log('[Pipeline v6] Initializing Hardened Field Engine Core Run...');

    // 1. Strict Engine-Bracket Registry Check
    const targetRiskProfile = getVehicleRiskProfile(vehicle, vin);

    // 2. Failure-Linked Pattern Engine Search
    const matchedPatterns = findKnownPatterns(targetRiskProfile, symptoms, codes, notes);
    const isRustBeltVehicle = targetRiskProfile ? targetRiskProfile.rustMultiplier > 1.0 : false;

    // 3. Compute Real Predictive Dynamic Risk Scores
    const dynamicRiskScore = targetRiskProfile 
      ? computeDynamicRiskScore(targetRiskProfile.baseRiskScore, mileage, targetRiskProfile.rustMultiplier, codes.length)
      : 45;

    // 4. Build Multi-Fault Data Collection Infrastructure Arrays
    const collectedLaborBreakdowns = [];
    const collectedPartsRisks = [];
    const collectedProtocols = [];

    for (const pattern of matchedPatterns) {
      // Map true flat-rate labor realities
      const labor = calculateJobLabor(pattern.patternId, laborRate, isRustBeltVehicle);
      collectedLaborBreakdowns.push(labor);

      // Map brand integrity and aftermarket comeback liabilities
      const parts = evaluatePartsIntegrity(pattern.patternId);
      collectedPartsRisks.push(parts);

      // Capture trade intelligence protocol strategies
      if (REPAIR_INTELLIGENCE_VAULT[pattern.linkProtocol]) {
        collectedProtocols.push(REPAIR_INTELLIGENCE_VAULT[pattern.linkProtocol]);
      }
    }

    // Decode factory manufacturing lines tracking
    const vKey = targetRiskProfile ? targetRiskProfile.vehicleId : '';
    const vinBuildProfile = getVinBuildTelemetry(vin, vKey, axleCode);

    // Evaluate structural threat triggers
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

    // Compute active system balance metrics
    const confidenceScore = calculateConfidence({
      patternMatches: matchedPatterns.length,
      codeCount: codes.length,
      symptomCount: symptoms.length,
      safetyTriggered: localSafetyTriggered
    });

    // 5. Build System Prompt with Integrated Cost Pressure Data
    let systemPrompt = `You are the expert reasoning engine of SKSK ProTech. You MUST output a single valid JSON block matching the template below.

Template Layout:
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
      systemPrompt += `\\n\\nCRITICAL VEHICLE SPECIFICATIONS:
${JSON.stringify({ ...targetRiskProfile, dynamicCalculatedRisk: dynamicRiskScore }, null, 2)}`;
    }

    // Issue #5 - Force LLM to visually review labor costs and parts risk realities
    if (collectedLaborBreakdowns.length > 0) {
      systemPrompt += `\\n\\nHARD FLAT-RATE LABOR METRICS AND PARTS INTEGRITY COST PRESSURES TO COMPLY WITH:
LABOR RUNS: ${JSON.stringify(collectedLaborBreakdowns, null, 2)}
PARTS COMELIABILITIES: ${JSON.stringify(collectedPartsRisks, null, 2)}`;
    }

    systemPrompt += `\\n\\nRULES:
- All values inside probability likelihood arrays must be numbers 0-100.
- Output raw valid JSON plain text blocks only.`;

    const userPrompt = `Vehicle Profile: Year: ${vehicle.year || 'N/A'}, Make: ${vehicle.make || 'N/A'}, Model: ${vehicle.model || 'N/A'}
Odometer: ${mileage} | Fault Codes: ${codes.join(', ')} | Symptoms: ${symptoms.join(', ')}`;

    console.log('[Pipeline v6] Sending context payload to Groq tracking group...');
    const groqRes = await groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { max_tokens: 1600, temperature: 0.15 });

    const aiText = typeof groqRes === 'string' ? groqRes : (groqRes?.choices?.[0]?.message?.content || '');
    let parsed = extractJSON(aiText);
    if (!parsed || typeof parsed !== 'object') parsed = safeResult();

    // 6. Absolute Database Overrides Control Verification Line
    const finalResult = { ...safeResult(), ...parsed };

    finalResult.diagnosticConfidence = confidenceScore;
    finalResult.localVehicleTelemetry = targetRiskProfile ? { ...targetRiskProfile, dynamicCalculatedRisk: dynamicRiskScore } : null;
    finalResult.injectedFieldProtocols = collectedProtocols;
    finalResult.calculatedLaborBreakdown = collectedLaborBreakdowns;
    finalResult.partsRiskAnalysis = collectedPartsRisks;
    finalResult.vinManufacturingTelemetry = vinBuildProfile;

    // Compute complete real-world guide hours total sum string
    if (collectedLaborBreakdowns.length > 0) {
      const totalHours = collectedLaborBreakdowns.reduce((sum, item) => sum + (item.realWorldHours || 0), 0);
      finalResult.estimatedRepairTime = `${totalHours.toFixed(1)} Real-World Flat-Rate Hours`;
    }

    // Force absolute structural pattern locks if likelihood parameters pass thresholds
    if (matchedPatterns.length > 0) {
      if (dynamicRiskScore > 85) {
        finalResult.primaryCause = matchedPatterns[0].patternName.toUpperCase();
      }
      finalResult.urgency = 'immediate';
      finalResult.safetyRisk = true;
      finalResult.knownIssues = [
        ...new Set([...(finalResult.knownIssues || []), ...matchedPatterns.map(p => p.patternId)])
      ];
    }

    if (localSafetyTriggered) {
      finalResult.safetyRisk = true;
      finalResult.urgency = 'immediate';
      finalResult.notes = `${localSafetyNotes} ${finalResult.notes}`.trim();
    }

    res.json({ success: true, result: finalResult });

  } catch (err) {
    console.error('[Pipeline v6 Fatal Core Exception]:', err.message);
    res.status(500).json({ success: false, error: 'Internal logic platform lock failure.', details: err.message });
  }
});

module.exports = router;