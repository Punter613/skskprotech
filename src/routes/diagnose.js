const express = require('express');
const router = express.Router();
const { groqChat } = require('../services/groq');
const { getVehicleRiskProfile } = require('../knowledge/vehicle.risk.table');
const { findKnownPatterns } = require('../knowledge/failure.patterns');
const { calculateConfidence } = require('../knowledge/confidence.scorer');
const { REPAIR_INTELLIGENCE_VAULT } = require('../knowledge/repair.intelligence.library');
const { calculateJobLabor } = require('../knowledge/labor.matrix');

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
    primaryCause: 'Manual shop inspection required',
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
      laborRate = 65 // Fallback to standard rate
    } = req.body;

    console.log('[Pipeline v4] Executing Absolute Database Enforcement Pipeline...');

    // 1. Fetch Local Profile and Pattern Telemetry
    const targetRiskProfile = getVehicleRiskProfile(vehicle);
    const matchedPatterns = findKnownPatterns(vehicle, symptoms, codes, notes);

    // 2. Determine Rust Belt Status based on telemetry mapping
    const isRustBeltVehicle = targetRiskProfile ? targetRiskProfile.rustMultiplier > 1.0 : false;

    // 3. Evaluate Safety Threat Matrix Controls
    let localSafetyTriggered = false;
    let localSafetyNotes = '';
    
    if (targetRiskProfile) {
      const combinedText = [...symptoms, ...codes, ...notes].join(' ').toLowerCase();
      const hazardousElements = targetRiskProfile.safetyCriticalComponents || [];
      for (const component of hazardousElements) {
        if (combinedText.includes(component.replace('_', ' '))) {
          localSafetyTriggered = true;
          localSafetyNotes = `[Database Critical Alert] Severe vulnerability array matched for a ${targetRiskProfile.vehicleId}.`;
        }
      }
    }

    // 4. Extract Real Field Intelligence Protocols
    let fieldProtocols = null;
    let activeFailureKey = '';

    if (targetRiskProfile && targetRiskProfile.vehicleId === 'FORD_F150_5.4_TRITON') {
      fieldProtocols = REPAIR_INTELLIGENCE_VAULT['FORD_54_TRITON_SPARK_PLUG'];
      activeFailureKey = 'spark_plug_separation';
    } else if (targetRiskProfile && targetRiskProfile.vehicleId === 'GM_5.3_VORTEC_AFM') {
      fieldProtocols = REPAIR_INTELLIGENCE_VAULT['GM_53_AFM_LIFTER_REPLACE'];
      activeFailureKey = 'afm_lifter_collapse';
    }

    // 5. Compute Exact Flat Rate Labor Engine Metrics
    const laborBreakdown = activeFailureKey 
      ? calculateJobLabor(activeFailureKey, laborRate, isRustBeltVehicle)
      : calculateJobLabor('default_generic', laborRate, isRustBeltVehicle);

    // 6. Calculate Data Confidence Score
    const confidenceScore = calculateConfidence({
      patternMatches: matchedPatterns.length,
      codeCount: codes.length,
      symptomCount: symptoms.length,
      safetyTriggered: localSafetyTriggered
    });

    // 7. Assemble AI Prompts
    let systemPrompt = `You are the expert reasoning unit of SKSK ProTech. You MUST output a valid JSON object matching the template structure below exactly. No commentary.

Use EXACTLY this structure:
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
${JSON.stringify(targetRiskProfile, null, 2)}`;
    }

    if (fieldProtocols) {
      systemPrompt += `\\n\\nHARD MECHANICAL REPAIR PROTOCOLS TO ENFORCE:
${JSON.stringify(fieldProtocols, null, 2)}`;
    }

    const userPrompt = `Vehicle Profile: Year: ${vehicle.year || 'N/A'}, Make: ${vehicle.make || 'N/A'}, Model: ${vehicle.model || 'N/A'}, Engine: ${vehicle.trim || 'N/A'}
Codes: ${codes.join(', ')} | Symptoms: ${symptoms.join(', ')} | Tech Notes: ${notes.join(', ')}`;

    console.log('[Pipeline v4] Requesting description fills from Groq cluster...');
    const groqRes = await groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { max_tokens: 1500, temperature: 0.15 });

    const aiText = typeof groqRes === 'string' ? groqRes : (groqRes?.choices?.[0]?.message?.content || '');
    let parsed = extractJSON(aiText);
    if (!parsed || typeof parsed !== 'object') {
      parsed = safeResult();
    }

    // 8. CRITICAL REPAIR INTELLIGENCE DATABASE OVERRIDES (Bypasses AI Dilution completely)
    const finalResult = { ...safeResult(), ...parsed };

    finalResult.diagnosticConfidence = confidenceScore;
    finalResult.localVehicleTelemetry = targetRiskProfile;
    finalResult.injectedFieldProtocols = fieldProtocols;
    finalResult.calculatedLaborBreakdown = laborBreakdown;
    finalResult.estimatedRepairTime = `${laborBreakdown.hours} Flat-Rate Hours`;

    // CRITICAL FIX 1: Hard Priority Override Layer (High Risk Score Profile Control)
    if (targetRiskProfile && targetRiskProfile.riskScore > 90) {
      finalResult.primaryCause = targetRiskProfile.commonFailures?.[0] ? targetRiskProfile.commonFailures[0].replace(/_/g, ' ').toUpperCase() : finalResult.primaryCause;
    }

    // CRITICAL FIX 2: Failure Lock System (Survives Local Platform Certainty)
    if (matchedPatterns.some(p => p.likelihood >= 90)) {
      finalResult.primaryCause = matchedPatterns[0].patternName;
      finalResult.urgency = 'immediate';
      finalResult.safetyRisk = true;
    }

    // Force hard core data injections for liabilities tracking arrays
    if (targetRiskProfile) {
      finalResult.knownIssues = [
        ...new Set([...(finalResult.knownIssues || []), ...(targetRiskProfile.commonFailures || [])])
      ];
    }

    // Enforce safety critical overrides flags
    if (localSafetyTriggered) {
      finalResult.safetyRisk = true;
      finalResult.urgency = 'immediate';
      finalResult.notes = `${localSafetyNotes} ${finalResult.notes}`.trim();
    }

    if (!['immediate', 'soon', 'monitor'].includes(finalResult.urgency)) {
      finalResult.urgency = 'soon';
    }

    // Optional DB logging
    try {
      const db = require('../services/db');
      if (db) await db.from('diagnostics').insert({ input: req.body, result: finalResult });
    } catch (e) { }

    res.json({ success: true, result: finalResult });

  } catch (err) {
    console.error('[Pipeline v4 Severe Crash]:', err.message);
    res.status(500).json({ success: false, error: 'Internal tracking data block exception.', details: err.message });
  }
});

module.exports = router;