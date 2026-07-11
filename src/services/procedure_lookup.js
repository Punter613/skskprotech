const { PROCEDURE_DB } = require('../knowledge/procedure.data');
const { REPAIR_INTELLIGENCE_VAULT } = require('../knowledge/repair.intelligence.library');

function findKnowledgeProcedure(vehicle, repairJob) {
  const job = (repairJob || '').toLowerCase();
  const make = (vehicle.make || '').toLowerCase();

  // Try to match specific patterns
  if (make.includes('ford') && job.includes('spark plug') && (vehicle.engine || '').includes('5.4')) {
    return REPAIR_INTELLIGENCE_VAULT['FORD_54_TRITON_SPARK_PLUG'];
  }

  if (make.includes('ram') && (job.includes('cam') || job.includes('lifter')) && (vehicle.engine || '').includes('5.7')) {
    return PROCEDURE_DB['RAM_57_HEMI_CAM_LIFTER'];
  }

  if (make.includes('gm') && job.includes('lifter') && (vehicle.engine || '').includes('5.3')) {
    return REPAIR_INTELLIGENCE_VAULT['GM_53_AFM_LIFTER_REPLACE'];
  }

  return null;
}

module.exports = { findKnowledgeProcedure };
