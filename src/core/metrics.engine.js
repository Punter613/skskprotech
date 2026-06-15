/**
 * SKSK ProTech - Upgraded Metrics & Calibration Engine (v9)
 * Normalizes probability distributions and caps certainty when signal inputs clash.
 */

function calculateConfidence(metrics = {}) {
  const { 
    patternMatches = 0, 
    codeCount = 0, 
    symptomCount = 0, 
    safetyTriggered = false,
    hasMismatchedSignals = false 
  } = metrics;

  let baseScore = 30;
  if (codeCount > 0) baseScore += (codeCount * 15);
  if (patternMatches > 0) baseScore += (patternMatches * 30);
  if (symptomCount > 0) baseScore += (symptomCount * 5);
  if (safetyTriggered) baseScore += 10;

  let finalScore = Math.min(Math.max(baseScore, 10), 99);

  // CRITICAL CAP: If data mismatch or cross-class system overlap exists, clamp confidence ceilings (Issue #4)
  if (hasMismatchedSignals && finalScore > 65) {
    finalScore = 65; 
  }

  let rating = 'LOW';
  if (finalScore >= 50 && finalScore < 65) rating = 'MEDIUM';
  if (finalScore >= 65) rating = 'HIGH_CAPPED';

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

/**
 * Multi-Cause Probability Engine Balancing Matrix (Issue #2)
 * Calibrates probability arrays to guarantee diagnostic depth and prevent artificial single-cause inflation.
 */
function calibrateProbabilityArray(incomingProbs = [], codeCount = 0, hasMismatchedSignals = false) {
  let normalizedList = [...incomingProbs];

  // 1. Force a minimum of 3 tracking hypotheses if multiple trouble codes exist
  if (codeCount >= 2 && normalizedList.length < 3) {
    while (normalizedList.length < 3) {
      normalizedList.push({
        cause: `Secondary auxiliary system fault check - Physical shop inspection required`,
        likelihood: 15
      });
    }
  }

  // 2. Prevent single 80%+ certainty claims if mixed signal classes cross boundaries
  if (hasMismatchedSignals) {
    normalizedList = normalizedList.map(item => {
      if (item.likelihood >= 80) {
        return { ...item, likelihood: 65 }; // Dilute certainty down to match strict empirical limits
      }
      return item;
    });
  }

  // Ensure absolute sorted precision descending
  return normalizedList.sort((a, b) => b.likelihood - a.likelihood);
}

module.exports = { 
  calculateConfidence, 
  computeDynamicRiskScore,
  calibrateProbabilityArray
};
