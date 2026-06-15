/**
 * SKSK ProTech - Pattern Assembly Coordinator (v8 Hardened)
 * Clean coordinator pass executing isolated domain sub-assemblers.
 */
const { assembleLaborAssets } = require('./assembler/labor.assembler');
const { assemblePartsAssets } = require('./assembler/parts.assembler');
const { assembleProtocolAssets } = require('./assembler/protocol.assembler');
const { FAILURE_KEYS } = require('../knowledge/constants');

function assemblePatternPayload(matchedPatterns = [], laborRate = 65, isRustBelt = false, trace) {
  trace.log('ASSEMBLER_ORCHESTRATION', `Coordinating asset mapping for locked failure keys count: ${matchedPatterns.length}`);

  const breakdowns = assembleLaborAssets(matchedPatterns, laborRate, isRustBelt, trace);
  const partsRisks = assemblePartsAssets(matchedPatterns, trace);
  const protocols = assembleProtocolAssets(matchedPatterns, trace);
  
  const activeKey = matchedPatterns.length > 0 ? matchedPatterns[matchedPatterns.length - 1].patternId : FAILURE_KEYS.GENERIC;

  return { breakdowns, partsRisks, protocols, activeKey };
}

module.exports = { assemblePatternPayload };
