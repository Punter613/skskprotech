/**
 * SKSK ProTech - Pipeline Orchestration Core (v9)
 * Intercepts vehicle validation loops and executes cross-scored telemetry calibrations.
 */
const { validateDiagnosticPayload } = require('./validator.service');
const { verifyVehicleSanity, evaluateSymptomClasses } = require('./sanitation.service');
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
  trace.log('PIPELINE_INGESTION', 'Running raw ingestion formatting validation routines.');
  validateDiagnosticPayload(rawPayload);

  const payload = normalizePayload(rawPayload);

  // CRITICAL SECURITY LOCKUP: Block impossible manufacturing configurations instantly (Issue #1)
  verifyVehicleSanity(payload.vehicle);

  // Run multi-system cross-scoring analysis
  const symptomTelemetry = evaluateSymptomClasses(payload.symptoms, payload.codes);
  trace.log('CROSS_SCORING', `System classification overlap evaluation complete. Overlaps count: ${symptomTelemetry.overlappingClassesCount}`);

  // 1. Risk Evaluation Run
  const riskAnalysis = executeRiskAnalysis(payload.vehicle, payload.vin, payload.axleCode, payload.symptoms, payload.codes, payload.notes, trace);
  const { profile, vinBuildProfile, localSafetyTriggered, safetyNotes } = riskAnalysis;

  // 2. Pattern Match pass
  const matchedPatterns = executePatternMatching(profile, payload.symptoms, payload.codes, payload.notes, trace);

  // 3. Domain Assembly pass
  const assemblyData = assemblePatternPayload(matchedPatterns, payload.laborRate, profile.rustMultiplier > 1.0, trace);

  // 4. Calibrated Metrics Execution Pass with structural confidence ceiling clamp rules (Issue #4)
  const dynamicRisk = computeDynamicRiskScore(profile.baseRiskScore, payload.mileage, profile.rustMultiplier, payload.codes.length);
  const confidence = calculateConfidence({
    patternMatches: matchedPatterns.length,
    codeCount: payload.codes.length,
    symptomCount: payload.symptoms.length,
    safetyTriggered: localSafetyTriggered,
    hasMismatchedSignals: symptomTelemetry.hasMismatchedSignals
  });

  return {
    profile,
    vinBuildProfile,
    localSafetyTriggered,
    safetyNotes,
    matchedPatterns,
    assemblyData,
    dynamicRisk,
    confidence,
    symptomTelemetry
  };
}

module.exports = { runDiagnosticPipeline };
