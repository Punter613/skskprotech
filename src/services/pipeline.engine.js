/**
 * SKSK ProTech - Pipeline Orchestration Core (v7 Hardened)
 * Enforces rigid defensive payload mapping and strict trace tracking observability.
 */

const { executeRiskAnalysis } = require('../core/risk.engine');
const { executePatternMatching } = require('../core/pattern.matcher');
const { assemblePatternPayload } = require('../core/pattern.assembler');
const { calculateConfidence, computeDynamicRiskScore } = require('../core/metrics.engine');

/**
 * Defensive Entry Guard: Force absolute structural validation at line input (Issue #3)
 */
function normalizePayload(payload = {}) {
  return {
    vehicle: payload.vehicle && typeof payload.vehicle === 'object' ? payload.vehicle : {},
    vin: (payload.vin || '').toString().toUpperCase().trim(),
    symptoms: Array.isArray(payload.symptoms) ? payload.symptoms : [],
    codes: Array.isArray(payload.codes) ? payload.codes : [],
    notes: Array.isArray(payload.notes) ? payload.notes : [],
    mileage: Number(payload.mileage || 0),
    laborRate: Number(payload.laborRate || 65),
    axleCode: (payload.axleCode || '').toString().toUpperCase().trim()
  };
}

function runDiagnosticPipeline(rawPayload = {}, trace = { traceId: '0', logs: [] }) {
  trace.logs.push('[Pipeline Entry] Executing strict sanitation normalization guards.');
  const payload = normalizePayload(rawPayload);

  // 1. Core Risk Analysis Run
  const riskAnalysis = executeRiskAnalysis(payload.vehicle, payload.vin, payload.axleCode, payload.symptoms, payload.codes, payload.notes, trace);
  
  // 2. Isolated Pattern Matcher Phase (Issue #4 Split Part 1)
  const matchedPatterns = executePatternMatching(riskAnalysis.profile, payload.symptoms, payload.codes, payload.notes, trace);

  // 3. Isolated Assembly Mapping Phase (Issue #4 Split Part 2)
  const assemblyData = assemblePatternPayload(matchedPatterns, payload.laborRate, riskAnalysis.profile.rustMultiplier > 1.0, trace);

  // 4. Frozen Metrics Calculations Run (Issue #6)
  const dynamicRisk = computeDynamicRiskScore(riskAnalysis.profile.baseRiskScore, payload.mileage, riskAnalysis.profile.rustMultiplier, payload.codes.length);
  const confidence = calculateConfidence({
    patternMatches: matchedPatterns.length,
    codeCount: payload.codes.length,
    symptomCount: payload.symptoms.length,
    safetyTriggered: riskAnalysis.localSafetyTriggered
  });

  trace.logs.push(`[Pipeline Exit] Completed routing logic loop successfully. Matches found: ${matchedPatterns.length}`);

  return {
    riskAnalysis,
    matchedPatterns,
    assemblyData,
    dynamicRisk,
    confidence
  };
}

module.exports = { runDiagnosticPipeline };
