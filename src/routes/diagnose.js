const express = require('express');
const router = express.Router();
const { groqChat } = require('../services/groq');
const { runDiagnosticPipeline } = require('../services/pipeline.engine');

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
  // Simple Trace Tracking Setup (Issue #3 Upgrade Path)
  const executionTrace = { traceId: Date.now().toString(16), stage: 'ORCHESTRATION_START' };
  
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

    console.log(`[Trace ID: ${executionTrace.traceId}] Orchestrating clean pipeline run...`);

    // Fire Clean Intermediate Separation Engines Logic
    const pipelineData = runDiagnosticPipeline({
      vehicle, vin, axleCode, symptoms, codes, notes, laborRate, mileage
    });

    // Extract compiled values out of the clean architecture objects
    const { riskAnalysis, patternsAnalysis, dynamicRisk, confidence } = pipelineData;

    // Compile System Prompt Context
    let systemPrompt = `You are the expert logic unit of SKSK ProTech. Output a valid JSON block matching this layout perfectly.

Template structure:
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

    if (riskAnalysis.profile) {
      systemPrompt += `\\n\\nVEHICLE PROFILE DATA: ${JSON.stringify({ ...riskAnalysis.profile, dynamicRisk }, null, 2)}`;
    }
    if (patternsAnalysis.breakdowns.length > 0) {
      systemPrompt += `\\n\\nCOST PRESSURES AND PARTS LIKELIHOOD ESTIMATES:
LABOR: ${JSON.stringify(patternsAnalysis.breakdowns, null, 2)}
PARTS: ${JSON.stringify(patternsAnalysis.partsRisks, null, 2)}`;
    }

    const userPrompt = `Vehicle Make: ${vehicle.make || 'N/A'} | Model: ${vehicle.model || 'N/A'} | Faults: ${codes.join(', ')}`;

    executionTrace.stage = 'GROQ_DISPATCH';
    const groqRes = await groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { max_tokens: 1500, temperature: 0.15 });

    const aiText = typeof groqRes === 'string' ? groqRes : (groqRes?.choices?.[0]?.message?.content || '');
    let parsed = extractJSON(aiText);
    if (!parsed || typeof parsed !== 'object') parsed = safeResult();

    // Force hard overrides boundaries cleanly
    const finalResult = { ...safeResult(), ...parsed };

    finalResult.diagnosticConfidence = confidence;
    finalResult.localVehicleTelemetry = riskAnalysis.profile ? { ...riskAnalysis.profile, dynamicCalculatedRisk: dynamicRisk } : null;
    finalResult.injectedFieldProtocols = patternsAnalysis.protocols;
    finalResult.calculatedLaborBreakdown = patternsAnalysis.breakdowns;
    finalResult.partsRiskAnalysis = patternsAnalysis.partsRisks;
    finalResult.vinManufacturingTelemetry = riskAnalysis.vinBuildProfile;

    if (patternsAnalysis.breakdowns.length > 0) {
      const totalHours = patternsAnalysis.breakdowns.reduce((sum, item) => sum + (item.realWorldHours || 0), 0);
      finalResult.estimatedRepairTime = `${totalHours.toFixed(1)} Real-World Flat-Rate Hours`;
    }

    // Absolute DB Priority Overrides
    if (riskAnalysis.profile && riskAnalysis.profile.baseRiskScore > 75) {
      if (patternsAnalysis.matchedPatterns.length > 0) {
        finalResult.primaryCause = patternsAnalysis.matchedPatterns[0].patternName.toUpperCase();
        finalResult.urgency = 'immediate';
        finalResult.safetyRisk = true;
      }
    }

    if (riskAnalysis.localSafetyTriggered) {
      finalResult.safetyRisk = true;
      finalResult.urgency = 'immediate';
      finalResult.notes = `${riskAnalysis.safetyNotes} ${finalResult.notes}`.trim();
    }

    res.json({ success: true, result: finalResult, traceLog: executionTrace });

  } catch (err) {
    console.error(`[Fatal Core Exception on Trace ${executionTrace.traceId}]:`, err.message);
    res.status(500).json({ success: false, error: 'Pipeline processing fault occurred.', trace: executionTrace });
  }
});

module.exports = router;