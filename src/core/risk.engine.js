const { getVehicleRiskProfile } = require('../knowledge/vehicle.risk.table');
const { getVinBuildTelemetry } = require('../knowledge/vin.telemetry');

/**
 * Normalizes a guaranteed null-safe vehicle profile object block structure
 */
function buildNullSafeProfile(foundProfile) {
  if (foundProfile) return foundProfile;
  return {
    vehicleId: 'GENERIC_VEHICLE_FALLBACK',
    make: 'Unknown',
    model: 'Unknown',
    engineCode: 'GENERIC_ENGINE',
    baseRiskScore: 45,
    rustMultiplier: 1.0,
    safetyCriticalComponents: [],
    commonFailures: []
  };
}

function executeRiskAnalysis(vehicle, vin, axleCode, symptoms, codes, notes, trace = { logs: [] }) {
  trace.logs.push(`[Risk Engine] Checking fleet registry against Make: ${vehicle.make}, Model: ${vehicle.model}`);
  
  const rawProfile = getVehicleRiskProfile(vehicle, vin);
  const profile = buildNullSafeProfile(rawProfile);
  
  trace.logs.push(`[Risk Engine] Profile settled as ID: ${profile.vehicleId}. Mapping VIN factory tracks.`);
  const vinBuildProfile = getVinBuildTelemetry(vin, rawProfile ? profile.vehicleId : '', axleCode);

  let localSafetyTriggered = false;
  let safetyNotes = '';

  const combinedText = [...symptoms, ...codes, ...notes].join(' ').toLowerCase();
  const hazardousElements = profile.safetyCriticalComponents || [];
  
  for (const component of hazardousElements) {
    if (combinedText.includes(component.replace('_', ' '))) {
      localSafetyTriggered = true;
      safetyNotes = `[Database Critical Alert] Component match locked onto safety vectors for ${profile.vehicleId}.`;
      trace.logs.push(`[Risk Engine Critical ALERT] Safety component threat verified: ${component}`);
    }
  }

  return { profile, vinBuildProfile, localSafetyTriggered, safetyNotes };
}

module.exports = { executeRiskAnalysis };
