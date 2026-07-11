const { FAILURE_KEYS, SOURCE_TIERS } = require('./constants');

const LABOR_REALITY_TABLE = {
  [FAILURE_KEYS.TRITON_PLUG]: {
    baseHours: 3.5,
    avgShopTime: 4.2,
    worstCaseNightmare: 8.0,
    rustBeltFactor: 1.4,
    operationLabel: 'Extract broken/fused 3V Triton spark plug sleeves',
    metadata: { sourceTier: SOURCE_TIERS.TECH_KB, lastUpdated: '2026-06' }
  },
  [FAILURE_KEYS.GM_LIFTER]: {
    baseHours: 8.0,
    avgShopTime: 9.5,
    worstCaseNightmare: 14.0,
    rustBeltFactor: 1.2,
    operationLabel: 'Remove cylinder heads and service collapsed AFM lifter banks',
    metadata: { sourceTier: SOURCE_TIERS.TECH_KB, lastUpdated: '2026-06' }
  }
};

function calculateJobLabor(failureKey, shopRate = 65, isRustBelt = false) {
  const job = LABOR_REALITY_TABLE[failureKey];
  if (!job) {
    return {
      hours: 1.5,
      rate: shopRate,
      cost: 1.5 * shopRate,
      metadata: { sourceTier: SOURCE_TIERS.HEURISTIC, lastUpdated: '2026-06' }
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
    label: job.operationLabel,
    metadata: job.metadata
  };
}

module.exports = { calculateJobLabor };
