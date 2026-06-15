/**
 * SKSK ProTech - Core Labor Matrix Guide
 * Hardcodes real shop flat-rate hours and regional modifier indicators.
 */

const LABOR_MATRIX = {
  'spark_plug_separation': {
    baseHours: 3.5,
    difficulty: 'HIGH',
    requiresRustBeltTax: true,
    operationLabel: 'Extract broken/fused 3V Triton spark plug sleeves'
  },
  'afm_lifter_collapse': {
    baseHours: 8.0,
    difficulty: 'EXPERT',
    requiresRustBeltTax: false,
    operationLabel: 'Remove cylinder heads, inspect cam, and replace AFM lifter banks'
  },
  'vct_phaser_rattle': {
    baseHours: 6.5,
    difficulty: 'HIGH',
    requiresRustBeltTax: false,
    operationLabel: 'Replace VCT variable camshaft timing phasers and tensioners'
  },
  'needle_bearing_seizure': {
    baseHours: 4.5,
    difficulty: 'MEDIUM',
    requiresRustBeltTax: false,
    operationLabel: 'Replace rocker arm assemblies and inspect camshaft lobes'
  },
  'salt_belt_brake_line_rot': {
    baseHours: 4.0,
    difficulty: 'HIGH',
    requiresRustBeltTax: true,
    operationLabel: 'Fabricate and run complete safety brake line network replacement'
  }
};

/**
 * Calculates true mechanical labor parameters
 * @param {string} failureKey 
 * @param {number} shopRate 
 * @param {boolean} isRustBelt 
 * @returns {Object} Calculated labor block
 */
function calculateJobLabor(failureKey, shopRate = 65, isRustBelt = false) {
  const job = LABOR_MATRIX[failureKey];
  if (!job) {
    return {
      hours: 1.5,
      rate: shopRate,
      cost: 1.5 * shopRate,
      label: 'Standard manual inspection and component service'
    };
  }

  let finalHours = job.baseHours;
  let multiplierApplied = false;

  // Apply the 25% complexity penalty if the tool slips are highly likely due to rust
  if (job.requiresRustBeltTax && isRustBelt) {
    finalHours = parseFloat((job.baseHours * 1.25).toFixed(1));
    multiplierApplied = true;
  }

  return {
    hours: finalHours,
    rate: shopRate,
    cost: parseFloat((finalHours * shopRate).toFixed(2)),
    difficulty: job.difficulty,
    multiplierApplied,
    label: job.operationLabel
  };
}

module.exports = { calculateJobLabor, LABOR_MATRIX };
