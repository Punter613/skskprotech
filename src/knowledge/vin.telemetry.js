/**
 * SKSK ProTech - Advanced VIN Telemetry Database
 * Maps specific VIN string markers to plants, recalls, and axle configurations.
 */

const VIN_PLANT_REGISTRY = {
  '1': { plant: 'Dearborn, MI', history: 'High body assembly quality; typical rust belt chassis paint scaling.' },
  'F': { plant: 'Dearborn, MI', history: 'High body assembly quality; typical rust belt chassis paint scaling.' },
  'C': { plant: 'Kansas City, MO', history: 'Frequent mid-model harness routing variances; check firewall clearance.' }
};

const DYNAMIC_VIN_DATABASE = {
  'FORD_F150_2008_5.4': {
    recalls: [
      { ID: '08V208000', component: 'Brake Vacuum Hose', hazard: 'Hose separation leads to sudden loss of power braking assist.' }
    ],
    axleCodes: {
      '19': { ratio: '3.55', type: 'Conventional', application: 'Standard towing / highway mileage balance' },
      '26': { ratio: '3.73', type: 'Conventional', application: 'Heavy payload configuration' },
      'B6': { ratio: '3.73', type: 'Limited Slip', application: 'High traction / severe terrain performance' }
    }
  },
  'GM_SILVERADO_2011_5.3': {
    recalls: [
      { ID: '16V381000', component: 'Airbag Inflator', hazard: 'Passenger frontal airbag inflator rupture during deployment.' }
    ],
    axleCodes: {
      'GU6': { ratio: '3.42', type: 'Conventional', application: 'Fuel economy spec' },
      'GT4': { ratio: '3.73', type: 'Conventional', application: 'Towing package' },
      'G80': { ratio: 'Automatic Locking', type: 'Heavy Duty Differential', application: 'Severe traction duty' }
    }
  }
};

/**
 * Extracts manufacturing telemetry profiles from a 17-character VIN
 * @param {string} vin 
 * @param {string} vehicleKey e.g. 'FORD_F150_2008_5.4'
 * @param {string} rawAxleCode Door jamb axle code string
 * @returns {Object} Extracted build profile
 */
function getVinBuildTelemetry(vin = '', vehicleKey = '', rawAxleCode = '') {
  const cleanVin = vin.toUpperCase().trim();
  const profile = DYNAMIC_VIN_DATABASE[vehicleKey] || { recalls: [], axleCodes: {} };
  
  // 11th digit indicates the manufacturing plant assembly location
  const plantDigit = cleanVin.charAt(10);
  const plantInfo = VIN_PLANT_REGISTRY[plantDigit] || { plant: 'Unknown Assembly Location', history: 'No specific plant liability logs active.' };

  const axleInfo = profile.axleCodes[rawAxleCode.toUpperCase().trim()] || {
    ratio: 'Unknown Baseline',
    type: 'Verify via diff tag',
    application: 'Manual physical tracking required'
  };

  return {
    assemblyPlant: plantInfo.plant,
    manufacturingDefectsHistory: plantInfo.history,
    activeSafetyRecalls: profile.recalls,
    axleTelemetry: axleInfo
  };
}

module.exports = { getVinBuildTelemetry };
