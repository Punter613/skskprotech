const { FAILURE_KEYS, SOURCE_TIERS } = require('./constants');

const PARTS_INTELLIGENCE_MATRIX = {
  [FAILURE_KEYS.TRITON_PLUG]: {
    recommendedOEM: 'Motorcraft SP-515 / SP-546 High-Temp Zinc',
    aftermarketRiskRating: 'SEVERE RISK',
    comebackProbabilityHeuristic: 68,
    metadata: { sourceTier: SOURCE_TIERS.HEURISTIC, lastUpdated: '2026-06' }
  },
  [FAILURE_KEYS.GM_LIFTER]: {
    recommendedOEM: 'GM Genuine VLOM Updated Lifter Kits',
    aftermarketRiskRating: 'HIGH RISK',
    comebackProbabilityHeuristic: 45,
    metadata: { sourceTier: SOURCE_TIERS.HEURISTIC, lastUpdated: '2026-06' }
  }
};

function evaluatePartsIntegrity(componentKey) {
  return PARTS_INTELLIGENCE_MATRIX[componentKey] || {
    recommendedOEM: 'Standard Replacement Target',
    aftermarketRiskRating: 'UNKNOWN',
    comebackProbabilityHeuristic: 5,
    metadata: { sourceTier: SOURCE_TIERS.HEURISTIC, lastUpdated: '2026-06' }
  };
}

module.exports = { evaluatePartsIntegrity };
