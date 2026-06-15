/**
 * SKSK ProTech - Core Confidence Scorer Math Engine
 * Calculates true diagnostic weight based on data point density.
 */

function calculateConfidence(metrics = {}) {
  const {
    patternMatches = 0,
    codeCount = 0,
    symptomCount = 0,
    safetyTriggered = false
  } = metrics;

  let baseScore = 30; // Soft baseline score for loose descriptions

  // 1. Weight by hard trouble codes
  if (codeCount > 0) baseScore += (codeCount * 15);

  // 2. Weight heavily by verified local platform failure matches
  if (patternMatches > 0) baseScore += (patternMatches * 30);

  // 3. Weight by tech observation clues
  if (symptomCount > 0) baseScore += (symptomCount * 5);

  // 4. Boost score if safety is triggered (high data correlation)
  if (safetyTriggered) baseScore += 10;

  // Clip the bounds between 10% and 99% (leaving 1% room for actual hands-on test verification)
  const finalScore = Math.min(Math.max(baseScore, 10), 99);

  let rating = 'LOW';
  if (finalScore >= 50 && finalScore < 80) rating = 'MEDIUM';
  if (finalScore >= 80) rating = 'HIGH';

  return {
    percentage: finalScore,
    rating: rating
  };
}

module.exports = { calculateConfidence };
