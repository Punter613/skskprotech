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
  // Issue #5 - Advanced Observability Trace Mapping Setup
  const executionTrace = {
    traceId: 'TR-' + Date.now().toString(16).toUpperCase(),
    stage: 'ORCHESTRATION_START',
    logs: ['[API Endpoint] Diagnostic request intercepted at network router layer.']
  };
  
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

    console.log(`[Trace Locked: ${executionTrace.traceId}] Processing input arrays...\n`);

    // Kick off orchestrated internal system modules with deep log tracking visibility flow
    const pipelineData = runDiagnosticPipeline({
      vehicle, vin, axleCode, symptoms, codes, notes, laborRate, mileage
    }, executionTrace);

    const { riskAnalysis, matchedPatterns, assemblyData, dynamicRisk, confidence } = pipelineData;

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

    if (riskAnalysis.profile.vehicleId !== 'GENERIC_VEHICLE_FALLBACK') {
      systemPrompt += `\\n\\nVEHICLE PROFILE DATA: ${JSON.stringify({ ...riskAnalysis.profile, dynamicRisk }, null, 2)}`;
    }
    if (assemblyData.breakdowns.length > 0) {
      systemPrompt += `\\n\\nCOST PRESSURES AND PARTS LIKELIHOOD ESTIMATES:
LABOR: ${JSON.stringify(assemblyData.breakdowns, null, 2)}
PARTS: ${JSON.stringify(assemblyData.partsRisks, null, 2)}`;
    }

    const userPrompt = `Vehicle Make: ${vehicle.make || 'N/A'} | Model: ${vehicle.model || 'N/A'} | Faults: ${codes.join(', ')}`;

    executionTrace.stage = 'GROQ_DISPATCH';
    executionTrace.logs.push('[Groq Core] Dispatched structured instruction layout package to context API cluster.');
    
    const groqRes = await groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { max_tokens: 1500, temperature: 0.15 });

    const aiText = typeof groqRes === 'string' ? groqRes : (groqRes?.choices?.[0]?.message?.content || '');
    let parsed = extractJSON(aiText);
    if (!parsed || typeof parsed !== 'object') parsed = safeResult();

    const finalResult = { ...safeResult(), ...parsed };

    finalResult.diagnosticConfidence = confidence;
    finalResult.localVehicleTelemetry = riskAnalysis.profile.vehicleId !== 'GENERIC_VEHICLE_FALLBACK' ? { ...riskAnalysis.profile, dynamicCalculatedRisk: dynamicRisk } : null;
    finalResult.injectedFieldProtocols = assemblyData.protocols;
    finalResult.calculatedLaborBreakdown = assemblyData.breakdowns;
    finalResult.partsRiskAnalysis = assemblyData.partsRisks;
    finalResult.vinManufacturingTelemetry = riskAnalysis.vinBuildProfile;

    if (assemblyData.breakdowns.length > 0) {
      const totalHours = assemblyData.breakdowns.reduce((sum, item) => sum + (item.realWorldHours || 0), 0);
      finalResult.estimatedRepairTime = `${totalHours.toFixed(1)} Real-World Flat-Rate Hours`;
    }

    if (riskAnalysis.profile.baseRiskScore > 75 && matchedPatterns.length > 0) {
      finalResult.primaryCause = matchedPatterns[0].patternName.toUpperCase();
      finalResult.urgency = 'immediate';
      finalResult.safetyRisk = true;
    }

    if (riskAnalysis.localSafetyTriggered) {
      finalResult.safetyRisk = true;
      finalResult.urgency = 'immediate';
      finalResult.notes = `${riskAnalysis.safetyNotes} ${finalResult.notes}`.trim();
    }

    executionTrace.stage = 'PIPELINE_COMPLETE';
    res.json({ success: true, result: finalResult, traceLog: executionTrace });

  } catch (err) {
    executionTrace.stage = 'PIPELINE_CRASHED';
    executionTrace.logs.push(`[FATAL Core Exception]: ${err.message}`);
    console.error(`[Fatal Core Exception on Trace ${executionTrace.traceId}]:`, err.message);
    res.status(500).json({ success: false, error: 'Pipeline processing fault occurred.', trace: executionTrace });
  }
});

module.exports = router;