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
  // FIX 2: Controlled execution trace API contract management (Issue #2)
  const executionTrace = {
    traceId: 'TR-' + Date.now().toString(16).toUpperCase(),
    stage: 'INGESTION',
    logs: [],
    log: function(stage, message) {
      this.stage = stage;
      this.logs.push(`[${stage}] ${message}`);
    }
  };
  
  executionTrace.log('API_ROUTER', 'Intercepted network diagnostic payload packet request wrapper.');
  
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

    console.log(`[Compiler Trace: ${executionTrace.traceId}] Processing architecture blocks...\n`);

    // Fire the complete v8 compiler pipeline engine pass
    const compiledData = runDiagnosticPipeline({
      vehicle, vin, axleCode, symptoms, codes, notes, laborRate, mileage
    }, executionTrace);

    // Explicitly destructure destructured tracking variables out of our clean emission engine payload
    const {
      profile,
      vinBuildProfile,
      localSafetyTriggered,
      safetyNotes,
      matchedPatterns,
      assemblyData,
      dynamicRisk,
      confidence
    } = compiledData;

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

    if (profile.vehicleId !== 'GENERIC_VEHICLE_FALLBACK') {
      systemPrompt += `\\n\\nVEHICLE PROFILE DATA: ${JSON.stringify({ ...profile, dynamicRisk }, null, 2)}`;
    }
    if (assemblyData.breakdowns.length > 0) {
      systemPrompt += `\\n\\nCOST PRESSURES AND PARTS LIKELIHOOD ESTIMATES:
LABOR: ${JSON.stringify(assemblyData.breakdowns, null, 2)}
PARTS: ${JSON.stringify(assemblyData.partsRisks, null, 2)}`;
    }

    const userPrompt = `Vehicle Make: ${vehicle.make || 'N/A'} | Model: ${vehicle.model || 'N/A'} | Faults: ${codes.join(', ')}`;

    executionTrace.log('GROQ_COMPILATION', 'Dispatched instruction packet layout to context cluster.');

    const groqRes = await groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { max_tokens: 1500, temperature: 0.15 });

    const aiText = typeof groqRes === 'string' ? groqRes : (groqRes?.choices?.[0]?.message?.content || '');
    let parsed = extractJSON(aiText);
    if (!parsed || typeof parsed !== 'object') parsed = safeResult();

    const finalResult = { ...safeResult(), ...parsed };

    finalResult.diagnosticConfidence = confidence;
    finalResult.localVehicleTelemetry = profile.vehicleId !== 'GENERIC_VEHICLE_FALLBACK' ? { ...profile, dynamicCalculatedRisk: dynamicRisk } : null;
    finalResult.injectedFieldProtocols = assemblyData.protocols;
    finalResult.calculatedLaborBreakdown = assemblyData.breakdowns;
    finalResult.partsRiskAnalysis = assemblyData.partsRisks;
    finalResult.vinManufacturingTelemetry = vinBuildProfile;

    if (assemblyData.breakdowns.length > 0) {
      const totalHours = assemblyData.breakdowns.reduce((sum, item) => sum + (item.realWorldHours || 0), 0);
      finalResult.estimatedRepairTime = `${totalHours.toFixed(1)} Real-World Flat-Rate Hours`;
    }

    if (profile.baseRiskScore > 75 && matchedPatterns.length > 0) {
      finalResult.primaryCause = matchedPatterns[0].patternName.toUpperCase();
      finalResult.urgency = 'immediate';
      finalResult.safetyRisk = true;
    }

    if (localSafetyTriggered) {
      finalResult.safetyRisk = true;
      finalResult.urgency = 'immediate';
      finalResult.notes = `${safetyNotes} ${finalResult.notes}`.trim();
    }

    executionTrace.log('COMPILER_SUCCESS', 'Emitted validated diagnostic JSON payload packet block.');
    res.json({ success: true, result: finalResult, traceLog: { traceId: executionTrace.traceId, logs: executionTrace.logs } });

  } catch (err) {
    executionTrace.log('COMPILER_CRASHED', `[FATAL Core Exception]: ${err.message}`);
    console.error(`[Fatal Compiler Core Exception on Trace ${executionTrace.traceId}]:`, err.message);
    res.status(500).json({ success: false, error: 'Pipeline processing fault occurred.', trace: { traceId: executionTrace.traceId, logs: executionTrace.logs } });
  }
});

module.exports = router;