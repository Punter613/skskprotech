/**
 * Sanity-checks ranked diagnoses against actual physical vehicle specs.
 * Prevents the AI from suggesting impossible mechanical components.
 * * @param {Array<Object>} rankedFailures - Output from failure.scorer.js
 * @param {Object} vehicle - Vehicle data from the request
 * @returns {Array<Object>} Cleaned, physically grounded diagnoses
 */
function groundDiagnoses(rankedFailures, vehicle) {
  const makeLower = (vehicle.make || '').toLowerCase();
  const modelLower = (vehicle.model || '').toLowerCase();
  const trimLower = (vehicle.trim || '').toLowerCase();
  
  // High-level architecture flags
  const isElectric = modelLower.includes('tesla') || trimLower.includes('ev') || trimLower.includes('electric');
  
  // Common configurations for filtering drivetrain layout issues
  const isFwdOnly = modelLower.includes('civic') || modelLower.includes('corolla') || modelLower.includes('focus') || modelLower.includes('cruze');
  const isManual = trimLower.includes('manual') || trimLower.includes('5-speed') || trimLower.includes('6-speed');

  return rankedFailures.filter(failure => {
    // Rule 1: Electric vehicles don't have spark plugs, engine oil, or exhaust leaks
    if (isElectric && (failure.system === 'engine' || failure.system === 'ignition_fuel' || failure.system === 'emissions')) {
      console.warn(`[Guard] Blocked internal combustion diagnosis (${failure.patternId}) on an EV vehicle.`);
      return false;
    }

    // Rule 2: Front-Wheel Drive compacts do not have conventional driveshafts or rear U-joints
    if (isFwdOnly && failure.patternId === 'drivetrain_highway_vibration') {
      // If the possible issues focus heavily on components they don't have
      if (failure.possibleIssues.includes('u_joint_wear') || failure.possibleIssues.includes('pinion_angle_issue')) {
        console.warn(`[Guard] Blocked rear-driveline diagnosis on a FWD platform.`);
        return false;
      }
    }

    // Rule 3: Manual transmissions do not experience automatic torque converter slip or shift flares
    if (isManual && (failure.patternId === 'trans_3_4_shift_flare' || failure.patternId === 'trans_gear_slip_whine_grind')) {
      if (failure.possibleIssues.includes('valve_body_issue') || failure.possibleIssues.includes('solenoid_control')) {
        console.warn(`[Guard] Blocked automatic transmission hydraulic valve diagnosis on a manual gearbox.`);
        return false;
      }
    }

    return true;
  });
}

module.exports = { groundDiagnoses };
