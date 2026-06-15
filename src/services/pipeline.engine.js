/**
 * SKSK ProTech - Pipeline Orchestration Core (v8 Compiler)
 * Enforces explicit parameter destructuring pass and centralized trace contracts.
 */
const { validateDiagnosticPayload } = require('./validator.service');
const { executeRiskAnalysis } = require('../core/risk.engine');
const { executePatternMatching } = require('../core/pattern.matcher');
const { assemblePatternPayload } = require('../core/pattern.assembler');
const { calculateConfidence, computeDynamicRiskScore } = require('../core/metrics/index');

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

function runDiagnosticPipeline(rawPayload = {}, trace) {
  trace.log('PIPELINE_INGESTION', 'Executing structural ingestion normalization checks.');
  
  // Enforce contract guard validations immediately at line input
  validateDiagnosticPayload(rawPayload);
  const payload = normalizePayload(rawPayload);

  // 1. Risk Analysis Core Compilation
  const riskAnalysis = executeRiskAnalysis(payload.vehicle, payload.vin, payload.axleCode, payload.symptoms, payload.codes, payload.notes, trace);
  
  // FIX 1: Explicit parameter destructuring propagation to prevent hidden structure bugs (Issue #1)
  const { profile, vinBuildProfile, localSafetyTriggered, safetyNotes } = riskAnalysis;

  // 2. Pattern Matcher Inference Pass
  const matchedPatterns = executePatternMatching(profile, payload.symptoms, payload.codes, payload.notes, trace);

  // 3. Decoupled Assembly Mapping Pass
  const assemblyData = assemblePatternPayload(matchedPatterns, payload.laborRate, profile.rustMultiplier > 1.0, trace);

  // 4. Calibrated Metrics Calculations Pass
  const dynamicRisk = computeDynamicRiskScore(profile.baseRiskScore, payload.mileage, profile.rustMultiplier, payload.codes.length);
  const confidence = calculateConfidence({
    patternMatches: matchedPatterns.length,
    codeCount: payload.codes.length,
    symptomCount: payload.symptoms.length,
    safetyTriggered: localSafetyTriggered
  });

  trace.log('PIPELINE_EMISSION', `Compiled output map loop. Metrics confidence settled: ${confidence.percentage}%`);

  return {
    profile,
    vinBuildProfile,
    localSafetyTriggered,
    safetyNotes,
    matchedPatterns,
    assemblyData,
    dynamicRisk,
    confidence
  };
}

module.exports = { runDiagnosticPipeline };
