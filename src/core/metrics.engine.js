/**
 * SKSK ProTech - Frozen Metrics Logic Center
 * Centralizes all mathematical scoring structures to eliminate import drift risks.
 */

function calculateConfidence(metrics = {}) {
  const { patternMatches = 0, codeCount = 0, symptomCount = 0, safetyTriggered = false } = metrics;

  let baseScore = 30;
  if (codeCount > 0) baseScore += (codeCount * 15);
  if (patternMatches > 0) baseScore += (patternMatches * 30);
  if (symptomCount > 0) baseScore += (symptomCount * 5);
  if (safetyTriggered) baseScore += 10;

  const finalScore = Math.min(Math.max(baseScore, 10), 99);
  let rating = 'LOW';
  if (finalScore >= 50 && finalScore < 80) rating = 'MEDIUM';
  if (finalScore >= 80) rating = 'HIGH';

  return { percentage: finalScore, rating };
}

function computeDynamicRiskScore(baseRisk = 50, mileage = 0, rustMultiplier = 1.0, activeFaults = 0) {
  let dynamicRisk = baseRisk;
  if (mileage > 100000) dynamicRisk += 5;
  if (mileage > 180000) dynamicRisk += 12;
  if (rustMultiplier > 1.1) dynamicRisk += (rustMultiplier * 4);
  if (activeFaults > 1) dynamicRisk += (activeFaults * 3);

  return Math.min(Math.round(dynamicRisk), 100);
}

module.exports = { calculateConfidence, computeDynamicRiskScore };
