const { evaluatePartsIntegrity } = require('../../knowledge/parts.accuracy');

function assemblePartsAssets(matchedPatterns, trace) {
  trace.log('ASSEMBLER_PARTS', `Resolving supply chain liabilities for ${matchedPatterns.length} tracks.`);
  return matchedPatterns.map(pattern => evaluatePartsIntegrity(pattern.patternId));
}

module.exports = { assemblePartsAssets };
