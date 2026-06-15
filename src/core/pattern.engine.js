const { findKnownPatterns } = require('../knowledge/failure.patterns');
const { calculateJobLabor } = require('../knowledge/labor.matrix');
const { evaluatePartsIntegrity } = require('../knowledge/parts.accuracy');
const { REPAIR_INTELLIGENCE_VAULT } = require('../knowledge/repair.intelligence.library');
const { FAILURE_KEYS } = require('../knowledge/constants');

function executePatternMatching(riskProfile, symptoms, codes, notes, laborRate) {
  const matchedPatterns = findKnownPatterns(riskProfile, symptoms, codes, notes);
  const isRustBelt = riskProfile ? riskProfile.rustMultiplier > 1.0 : false;

  const breakdowns = [];
  const partsRisks = [];
  const protocols = [];
  let activeKey = FAILURE_KEYS.GENERIC;

  for (const pattern of matchedPatterns) {
    breakdowns.push(calculateJobLabor(pattern.patternId, laborRate, isRustBelt));
    partsRisks.push(evaluatePartsIntegrity(pattern.patternId));
    
    if (REPAIR_INTELLIGENCE_VAULT[pattern.linkProtocol]) {
      protocols.push(REPAIR_INTELLIGENCE_VAULT[pattern.linkProtocol]);
    }
    activeKey = pattern.patternId; 
  }

  return { matchedPatterns, breakdowns, partsRisks, protocols, activeKey };
}

module.exports = { executePatternMatching };
