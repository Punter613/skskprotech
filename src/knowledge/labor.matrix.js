/**
 * SKSK ProTech - Advanced Shop Labor Reality Guide
 * Hardcodes flat-rate baselines alongside real-world worst-case scenario durations.
 */

const LABOR_REALITY_TABLE = {
  'spark_plug_separation': {
    baseHours: 3.5,
    avgShopTime: 4.2,
    worstCaseNightmare: 8.0,
    rustBeltFactor: 1.4,
    operationLabel: 'Extract broken/fused 3V Triton spark plug sleeves'
  },
  'afm_lifter_collapse': {
    baseHours: 8.0,
    avgShopTime: 9.5,
    worstCaseNightmare: 14.0,
    rustBeltFactor: 1.2,
    operationLabel: 'Remove cylinder heads and service collapsed AFM lifter banks'
  },
  'vct_phaser_rattle': {
    baseHours: 6.5,
    avgShopTime: 7.2,
    worstCaseNightmare: 11.0,
    rustBeltFactor: 1.15,
    operationLabel: 'Replace VCT variable camshaft phasers and tensioner tracks'
  }
};

/**
 * Computes exact shop labor reality metrics
 * @param {string} failureKey 
 * @param {number} shopRate 
 * @param {boolean} isRustBelt 
 * @returns {Object} Real-world labor profile
 */
function calculateJobLabor(failureKey, shopRate = 65, isRustBelt = false) {
  const job = LABOR_REALITY_TABLE[failureKey];
  if (!job) {
    return {
      hours: 1.5,
      rate: shopRate,
      cost: 1.5 * shopRate,
      worstCaseCost: 3.0 * shopRate,
      label: 'Standard component diagnostic verification hours'
    };
  }

  let calculatedHours = job.baseHours;
  if (isRustBelt) {
    calculatedHours = parseFloat((job.baseHours * job.rustBeltFactor).toFixed(1));
  }

  return {
    bookHours: job.baseHours,
    realWorldHours: calculatedHours,
    avgShopExecutionTime: job.avgShopTime,
    worstCaseNightmareDuration: job.worstCaseNightmare,
    laborCost: parseFloat((calculatedHours * shopRate).toFixed(2)),
    nightmareScenarioCost: parseFloat((job.worstCaseNightmare * shopRate).toFixed(2)),
    label: job.operationLabel,
    rustTaxApplied: isRustBelt
  };
}

module.exports = { calculateJobLabor, LABOR_REALITY_TABLE };
