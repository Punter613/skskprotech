const { executeRiskAnalysis } = require('../core/risk.engine');
const { executePatternMatching } = require('../core/pattern.engine');
const { calculateConfidence, computeDynamicRiskScore } = require('../knowledge/confidence.scorer');

function runDiagnosticPipeline(payload = {}) {
  const { vehicle, vin, axleCode, symptoms, codes, notes, laborRate } = payload;

  // 1. Risk Evaluation Layer Check
  const riskAnalysis = executeRiskAnalysis(vehicle, vin, axleCode, symptoms, codes, notes);
  
  // 2. Pattern Matching Rules Check
  const patternsAnalysis = executePatternMatching(riskAnalysis.profile, symptoms, codes, notes, laborRate);

  // 3. Compute Environmental Scoring Calibration
  const dynamicRisk = riskAnalysis.profile
    ? computeDynamicRiskScore(riskAnalysis.profile.baseRiskScore, payload.mileage, riskAnalysis.profile.rustMultiplier, codes.length)
    : 45;

  const confidence = calculateConfidence({
    patternMatches: patternsAnalysis.matchedPatterns.length,
    codeCount: codes.length,
    symptomCount: symptoms.length,
    safetyTriggered: riskAnalysis.localSafetyTriggered
  });

  return {
    riskAnalysis,
    patternsAnalysis,
    dynamicRisk,
    confidence
  };
}

module.exports = { runDiagnosticPipeline };
