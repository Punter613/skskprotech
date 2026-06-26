const { findKnownPatterns } = require('../knowledge/failure.patterns');

function executePatternMatching(riskProfile, symptoms, codes, notes, trace) {
  // CRITICAL GUARD 3: Strict profile validation checks before execution (Issue #3)
  if (!riskProfile || !riskProfile.engineCode || riskProfile.vehicleId === 'GENERIC_VEHICLE_FALLBACK') {
    trace.log('PATTERN_MATCHER', 'Invalid profile engine configuration shape or fallback detected. Aborting pattern lookup.');
    return [];
  }

  trace.log('PATTERN_MATCHER', `Running verification match against powertrain target line: ${riskProfile.engineCode}`);
  return findKnownPatterns(riskProfile, symptoms, codes, notes);
}

module.exports = { executePatternMatching };
