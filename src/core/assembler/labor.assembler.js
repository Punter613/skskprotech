const { calculateJobLabor } = require('../../knowledge/labor.matrix');

function assembleLaborAssets(matchedPatterns, laborRate, isRustBelt, trace) {
  trace.log('ASSEMBLER_LABOR', `Computing labor curves for ${matchedPatterns.length} failure tracks.`);
  return matchedPatterns.map(pattern => calculateJobLabor(pattern.patternId, laborRate, isRustBelt));
}

module.exports = { assembleLaborAssets };
