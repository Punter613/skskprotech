const { findKnownPatterns } = require('../knowledge/failure.patterns');

function executePatternMatching(riskProfile, symptoms, codes, notes, trace = { logs: [] }) {
  trace.logs.push(`[Pattern Matcher] Running strict verification against target line: ${riskProfile.engineCode}`);
  
  // Guard intercept if running fallback parameters
  if (riskProfile.vehicleId === 'GENERIC_VEHICLE_FALLBACK') {
    trace.logs.push('[Pattern Matcher] System dropped to fallback channel. Skipping matching.');
    return [];
  }

  const matches = findKnownPatterns(riskProfile, symptoms, codes, notes);
  trace.logs.push(`[Pattern Matcher] Analysis processing complete. Local database matches flagged: ${matches.length}`);
  
  return matches;
}

module.exports = { executePatternMatching };
