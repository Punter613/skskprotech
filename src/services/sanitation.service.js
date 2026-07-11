/**
 * SKSK ProTech - Ingestion Sani-Gate & Cross-Scoring Engine
 * Validates powertrain combinations, categorizes faults, and clamps confidence ceilings.
 */

/**
 * Rigid Gatekeeper: Block impossible manufacturing combinations (Issue #1)
 */
function verifyVehicleSanity(vehicle = {}) {
  const make = (vehicle.make || '').toLowerCase().trim();
  const trim = (vehicle.trim || '').toLowerCase().trim();

  if (make.includes('hyundai') || make.includes('kia')) {
    if (trim.includes('5.4') || trim.includes('triton') || trim.includes('5.3') || trim.includes('vortec')) {
      throw new Error('POWERTRAIN_SANITY_CRASH: Impossible manufacturing configuration. Domestic truck powertrains cannot be mapped to import passenger frames.');
    }
  }

  if (make.includes('ford') && trim.includes('3.6') && trim.includes('pentastar')) {
    throw new Error('POWERTRAIN_SANITY_CRASH: Impossible manufacturing configuration. Chrysler Pentastar lines cannot be mapped to a Ford chassis.');
  }

  return true;
}

/**
 * Multi-System Class Weighting & Cross-Score Overlap Optimizer (Issue #3)
 */
function evaluateSymptomClasses(symptoms = [], codes = []) {
  const categories = {
    VISUAL_FAULT: false,     // smoke, leaks, steam
    ELECTRICAL_FUEL: false,  // codes, sensors, wiring
    THERMAL_SYSTEM: false    // heat, coolant, radiator
  };

  const combinedText = [...symptoms, ...codes].join(' ').toLowerCase();

  if (combinedText.includes('smoke') || combinedText.includes('steam') || combinedText.includes('leak')) {
    categories.VISUAL_FAULT = true;
  }
  if (codes.length > 0 || combinedText.includes('wiring') || combinedText.includes('sensor')) {
    categories.ELECTRICAL_FUEL = true;
  }
  if (combinedText.includes('heat') || combinedText.includes('hot') || combinedText.includes('overheat') || combinedText.includes('coolant')) {
    categories.THERMAL_SYSTEM = true;
  }

  // Count active overlapping system classes
  const overlappingClassesCount = Object.values(categories).filter(Boolean).length;

  return {
    categories,
    overlappingClassesCount,
    hasMismatchedSignals: overlappingClassesCount >= 2
  };
}

module.exports = {
  verifyVehicleSanity,
  evaluateSymptomClasses
};
