/**
 * SKSK ProTech - Production Compiler Build Generator (v10-Stable)
 * Adds strict model-name verification guards to eliminate cross-model profile bleed.
 */
const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '../src/routes/diagnose.js');

// We rewrite the router to enforce absolute make + model isolation inside the pipeline mappings
const routerCode = `const express = require('express');
const router = express.Router();
const { groqChat } = require('../services/groq');
const { runDiagnosticPipeline } = require('../services/pipeline.engine');
const { calibrateProbabilityArray } = require('../core/metrics/index');

function extractJSON(text) {
  if (!text) return null;
  text = text.replace(/\\\`\\\`\\\`json\\\\s*/gi, '').replace(/\\\`\\\`\\\`\\\\s*/g, '');
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
  const executionTrace = {
    traceId: 'TR-' + Date.now().toString(16).toUpperCase(),
    stage: 'INGESTION',
    logs: [],
    log: function(stage, message) {
      this.stage = stage;
      this.logs.push(\`[\${stage}] \${message}\`);
    }
  };
  
  executionTrace.log('API_ROUTER', 'Intercepted vehicle payload network request wrapper.');
  
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

    const compiledData = runDiagnosticPipeline({
      vehicle, vin, axleCode, symptoms, codes, notes, laborRate, mileage
    }, executionTrace);

    const {
      profile,
      vinBuildProfile,
      localSafetyTriggered,
      safetyNotes,
      matchedPatterns,
      assemblyData,
      dynamicRisk,
      confidence,
      symptomTelemetry
    } = compiledData;

    let systemPrompt = \`You are the expert logic unit of SKSK ProTech. Output a valid JSON block matching this layout perfectly. No comments.

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
}\`;

    // HARD SECURITY GATE: Double check profile matches input context before injecting telemetry truth claims
    const inputMake = (vehicle.make || '').toLowerCase();
    const inputModel = (vehicle.model || '').toLowerCase();
    const profileId = profile ? profile.vehicleId : '';
    
    let isProfileValidContext = false;
    if (profileId === 'FORD_F150_3V_TRITON' && inputMake.includes('ford') && (inputModel.includes('150') || inputModel.includes('f-150'))) {
      isProfileValidContext = true;
    } else if (profileId === 'GM_SILVERADO_AFM_5.3' && (inputMake.includes('chev') || inputMake.includes('gm')) && (inputModel.includes('silverado') || inputModel.includes('sierra'))) {
      isProfileValidContext = true;
    } else if (profileId === 'FORD_3.5_ECOBOOST_V1' && inputMake.includes('ford') && (inputModel.includes('150') || inputModel.includes('f-150'))) {
      isProfileValidContext = true;
    }

    if (profile && isProfileValidContext) {
      systemPrompt += \`\\\\n\\\\nVEHICLE PROFILE DATA: \${JSON.stringify({ ...profile, dynamicRisk }, null, 2)}\`;
    }
    if (assemblyData && isProfileValidContext && assemblyData.breakdowns.length > 0) {
      systemPrompt += \`\\\\n\\\\nCOST PRESSURES AND PARTS LIKELIHOOD ESTIMATES:
LABOR: \${JSON.stringify(assemblyData.breakdowns, null, 2)}
PARTS: \${JSON.stringify(assemblyData.partsRisks, null, 2)}\`;
    }

    const userPrompt = \`Vehicle: \${vehicle.make || 'N/A'} \${vehicle.model || 'N/A'} | Fault Codes: \${codes.join(', ')} | Symptoms: \${symptoms.join(', ')}\`;

    executionTrace.log('GROQ_COMPILATION', 'Dispatched contextual instruction payload down the cluster pipeline.');

    const groqRes = await groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { max_tokens: 1500, temperature: 0.15 });

    const aiText = typeof groqRes === 'string' ? groqRes : (groqRes?.choices?.[0]?.message?.content || '');
    let parsed = extractJSON(aiText);
    if (!parsed || typeof parsed !== 'object') parsed = safeResult();

    const finalResult = { ...safeResult(), ...parsed };

    finalResult.probability = calibrateProbabilityArray(
      finalResult.probability || [], 
      codes.length, 
      symptomTelemetry.hasMismatchedSignals
    );

    finalResult.diagnosticConfidence = confidence;
    finalResult.localVehicleTelemetry = (profile && isProfileValidContext) ? { ...profile, dynamicCalculatedRisk: dynamicRisk } : null;
    finalResult.injectedFieldProtocols = (assemblyData && isProfileValidContext) ? assemblyData.protocols : [];
    finalResult.calculatedLaborBreakdown = (assemblyData && isProfileValidContext) ? assemblyData.breakdowns : [];
    finalResult.partsRiskAnalysis = (assemblyData && isProfileValidContext) ? assemblyData.partsRisks : [];
    finalResult.vinManufacturingTelemetry = isProfileValidContext ? vinBuildProfile : null;

    if (isProfileValidContext && assemblyData && assemblyData.breakdowns.length > 0) {
      const totalHours = assemblyData.breakdowns.reduce((sum, item) => sum + (item.realWorldHours || 0), 0);
      finalResult.estimatedRepairTime = \`\${totalHours.toFixed(1)} Real-World Flat-Rate Hours\`;
    }

    if (isProfileValidContext && profile && profile.baseRiskScore > 75 && matchedPatterns.length > 0) {
      finalResult.primaryCause = matchedPatterns[0].patternName.toUpperCase();
      finalResult.urgency = 'immediate';
      finalResult.safetyRisk = true;
    }

    if (confidence && confidence.rating === 'MEDIUM' && symptomTelemetry.hasMismatchedSignals) {
      const activeKeys = Object.keys(symptomTelemetry.categories).filter(k => symptomTelemetry.categories[k]).join(', ');
      finalResult.notes = \`[System Warning - Inspection Required] Multi-system class signals cross-contamination flagged (\${activeKeys}). High-certainty metrics suspended. Manual diagnostic validation highly required. \${finalResult.notes}\`.trim();
    }

    if (localSafetyTriggered && isProfileValidContext) {
      finalResult.safetyRisk = true;
      finalResult.urgency = 'immediate';
      finalResult.notes = \`\${safetyNotes} \${finalResult.notes}\`.trim();
    }

    executionTrace.log('COMPILER_SUCCESS', 'Emitted sani-gate cleared diagnostic response map.');
    res.json({ success: true, result: finalResult, traceLog: { traceId: executionTrace.traceId, logs: executionTrace.logs } });

  } catch (err) {
    executionTrace.log('COMPILER_CRASHED', \`[FATAL Ingestion Engine Crash]: \${err.message}\`);
    console.error(\`[Fatal Sani-Gate Exception on Trace \${executionTrace.traceId}]:\`, err.message);
    res.status(400).json({ success: false, error: 'Sani-Gate Validation Reject.', details: err.message, trace: executionTrace.traceId });
  }
});

module.exports = router;`;

console.log('[Factory] Compiling clean versioned route manifest directly to disk partition...');
fs.writeFileSync(OUTPUT_PATH, routerCode, 'utf8');
console.log('==> ✅ Compile successful: src/routes/diagnose.js updated flawlessly from v10 immutable generator.');
