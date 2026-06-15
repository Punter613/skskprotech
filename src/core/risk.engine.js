const { getVehicleRiskProfile } = require('../knowledge/vehicle.risk.table');
const { getVinBuildTelemetry } = require('../knowledge/vin.telemetry');

function executeRiskAnalysis(vehicle, vin, axleCode, symptoms, codes, notes) {
  const profile = getVehicleRiskProfile(vehicle, vin);
  const vinBuildProfile = getVinBuildTelemetry(vin, profile ? profile.vehicleId : '', axleCode);

  let localSafetyTriggered = false;
  let safetyNotes = '';

  if (profile) {
    const combinedText = [...symptoms, ...codes, ...notes].join(' ').toLowerCase();
    const hazardousElements = profile.safetyCriticalComponents || [];
    for (const component of hazardousElements) {
      if (combinedText.includes(component.replace('_', ' '))) {
        localSafetyTriggered = true;
        safetyNotes = `[Database Critical Alert] Component matched to telemetry safety vectors for ${profile.vehicleId}.`;
      }
    }
  }

  return {
    profile,
    vinBuildProfile,
    localSafetyTriggered,
    safetyNotes
  };
}

module.exports = { executeRiskAnalysis };
