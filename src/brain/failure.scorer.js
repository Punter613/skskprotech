function scoreFailures(candidates, vehicle, mileage = 0) {
  const scored = candidates.map(candidate => {
    let score = candidate.baseWeight;
    let modifiers = [];

    const makeLower = (vehicle.make || '').toLowerCase();
    const modelLower = (vehicle.model || '').toLowerCase();
    const yearNum = parseInt(vehicle.year, 10) || 0;

    if (makeLower.includes('ford')) {
      if (candidate.patternId === 'engine_rattle_warm_idle' || candidate.patternId === 'misfire_steady_cruise') {
        if (modelLower.includes('f150') || modelLower.includes('ranger')) {
          score += 0.25;
          modifiers.push("High failure rate bias for Ford truck engines");
        }
      }
      if (candidate.system === 'transmission') {
        score += 0.15;
        modifiers.push("Known internal snap ring or valve body wear on Ford transmissions");
      }
    }

    if (mileage > 120000) {
      if (candidate.system === 'transmission' || candidate.system === 'engine') {
        score += 0.12;
        modifiers.push("High mileage increases base engine/transmission mechanical risk");
      }
    } else if (mileage > 0 && mileage < 60000) {
      if (candidate.patternId === 'trans_gear_slip_whine_grind') {
        score -= 0.15;
        modifiers.push("Low mileage reduces probability of complete transmission structural failure");
      }
    }

    if (candidate.system === 'brakes' || candidate.system === 'drivetrain') {
      score += 0.22;
      modifiers.push("Rust Belt adjustment: Road salt causes frozen slider pins, rotted e-brake cables, and universal joint seize");
    }

    if (candidate.matchedCodes.length > 0 && candidate.matchedSymptoms.length > 0) {
      score += 0.15;
      modifiers.push("Strong correlation between logged OBD codes and physical symptoms");
    }

    const finalConfidence = Math.min(Math.max(score, 0.05), 0.98);
    const confidencePercentage = Math.round(finalConfidence * 100);

    return {
      ...candidate,
      confidence: `${confidencePercentage}%`,
      rawScore: finalConfidence,
      appliedModifiers: modifiers
    };
  });

  return scored.sort((a, b) => b.rawScore - a.rawScore);
}

module.exports = { scoreFailures };
