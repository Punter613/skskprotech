const { calculateJobLabor } = require('../knowledge/labor.matrix');
const { evaluatePartsIntegrity } = require('../knowledge/parts.accuracy');
const { REPAIR_INTELLIGENCE_VAULT } = require('../knowledge/repair.intelligence.library');
const { FAILURE_KEYS } = require('../knowledge/constants');

function assemblePatternPayload(matchedPatterns = [], laborRate = 65, isRustBelt = false, trace = { logs: [] }) {
  trace.logs.push(`[Pattern Assembler] Assembling mechanical asset maps for ${matchedPatterns.length} targets.`);
  
  const breakdowns = [];
  const partsRisks = [];
  const protocols = [];
  let activeKey = FAILURE_KEYS.GENERIC;

  for (const pattern of matchedPatterns) {
    // FIX 1: Enforce strict structural pattern.id matching across all layers (Issue #1)
    const normalizedKey = pattern.patternId; 
    trace.logs.push(`[Pattern Assembler] Resolving assets for locked pattern.id key: "${normalizedKey}"`);

    breakdowns.push(calculateJobLabor(normalizedKey, laborRate, isRustBelt));
    partsRisks.push(evaluatePartsIntegrity(normalizedKey));
    
    if (REPAIR_INTELLIGENCE_VAULT[pattern.linkProtocol]) {
      protocols.push(REPAIR_INTELLIGENCE_VAULT[pattern.linkProtocol]);
    }
    activeKey = normalizedKey;
  }

  return { breakdowns, partsRisks, protocols, activeKey };
}

module.exports = { assemblePatternPayload };
