/**
 * SKSK ProTech - Parts Accuracy & Risk Mitigation Engine
 * Analyzes component brand integrity to flag comeback probabilities before ordering.
 */

const PARTS_INTELLIGENCE_MATRIX = {
  'spark_plugs': {
    recommendedOEM: 'Motorcraft SP-515 / SP-546 High-Temp Zinc',
    aftermarketRiskRating: 'SEVERE RISK',
    knownFailureBrands: ['Generic No-Name Online Packs', 'Budget Copper Cores'],
    comebackProbability: 68,
    technicalWarning: 'Using cheap unshielded plugs in a 3V Triton causes rapid ceramic fracturing and immediate secondary ignition coil blowout.'
  },
  'afm_lifters': {
    recommendedOEM: 'GM Genuine VLOM Updated Lifter Kits',
    aftermarketRiskRating: 'HIGH RISK',
    knownFailureBrands: ['White-Box Remanufactured Sets', 'Discount Part Line Entries'],
    comebackProbability: 45,
    technicalWarning: 'Generic AFM lifters frequently drop internal locking pins within 5,000 miles. Stick to OEM or execute a full physical delete.'
  },
  'cam_phasers': {
    recommendedOEM: 'Ford Updated Design Cam Gear Assemblies',
    aftermarketRiskRating: 'HIGH RISK',
    knownFailureBrands: ['Dorman Standard Line (Pre-2022 inventory)', 'Unbranded Timing Kits'],
    comebackProbability: 55,
    technicalWarning: 'Aftermarket VCT gears often bleed internal oil pressure at hot idle, causing the startup slap to return within weeks.'
  }
};

/**
 * Evaluates part risks and brand liabilities
 * @param {string} componentKey e.g. 'spark_plugs', 'afm_lifters'
 * @returns {Object} Risk analysis data block
 */
function evaluatePartsIntegrity(componentKey) {
  const data = PARTS_INTELLIGENCE_MATRIX[componentKey];
  if (!data) {
    return {
      recommendedOEM: 'Standard Professional Grade Target',
      aftermarketRiskRating: 'LOW RISK',
      knownFailureBrands: [],
      comebackProbability: 5,
      technicalWarning: 'Verify standard fitment parameters against local parts counter ledger.'
    };
  }
  return data;
}

module.exports = { evaluatePartsIntegrity, PARTS_INTELLIGENCE_MATRIX };
