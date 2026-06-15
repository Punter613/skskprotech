/**
 * SKSK ProTech - Relational Fleet Architecture Registry
 * Upgraded to enforce strict year brackets, specific engine variants, and plant histories.
 */

const VEHICLE_FLEET_DB = {
  'FORD_F150_3V_TRITON': {
    vehicleId: 'FORD_F150_3V_TRITON',
    make: 'Ford',
    model: 'F150',
    engineCode: '5.4L 3V',
    minYear: 2004,
    maxYear: 2010,
    baseRiskScore: 78,
    rustMultiplier: 1.25,
    safetyCriticalComponents: ['spark_plugs', 'brakes', 'exhaust_manifolds'],
    commonFailures: ['spark_plug_separation', 'cam_phaser_failure', 'timing_chain_wear']
  },
  'GM_SILVERADO_AFM_5.3': {
    vehicleId: 'GM_SILVERADO_AFM_5.3',
    make: 'Chevrolet',
    model: 'Silverado',
    engineCode: '5.3L AFM',
    minYear: 2007,
    maxYear: 2014,
    baseRiskScore: 72,
    rustMultiplier: 1.25,
    safetyCriticalComponents: ['afm_lifters', 'oil_pressure_screen', 'brake_lines'],
    commonFailures: ['afm_lifter_collapse', 'oil_pressure_sensor_clog', 'salt_belt_brake_line_rot']
  },
  'FORD_3.5_ECOBOOST_V1': {
    vehicleId: 'FORD_3.5_ECOBOOST_V1',
    make: 'Ford',
    model: 'F150',
    engineCode: '3.5L EcoBoost',
    minYear: 2011,
    maxYear: 2016,
    baseRiskScore: 70,
    rustMultiplier: 1.20,
    safetyCriticalComponents: ['cam_phasers', 'turbo_oil_lines'],
    commonFailures: ['vct_phaser_rattle', 'timing_chain_stretch', 'turbo_coolant_line_leaks']
  }
};

/**
 * Strict multi-point query encoder to locate exact fleet profile records
 */
function getVehicleRiskProfile(vehicle = {}, vin = '') {
  const make = (vehicle.make || '').toLowerCase();
  const model = (vehicle.model || '').toLowerCase();
  const trim = (vehicle.trim || '').toLowerCase();
  const year = parseInt(vehicle.year) || 0;
  const cleanVin = (vin || '').toUpperCase().trim();

  // Primary Route: Verify strict matching profiles
  for (const [key, profile] of Object.entries(VEHICLE_FLEET_DB)) {
    if (!make.includes(profile.make.toLowerCase())) continue;
    if (!model.includes(profile.model.toLowerCase())) continue;

    // Strict validation check across construction build years
    if (year >= profile.minYear && year <= profile.maxYear) {
      // Confirm engine variant matching boundaries
      if (trim.includes('5.4') || trim.includes('triton') || cleanVin.includes('5.4')) {
        if (profile.engineCode.includes('3V')) return profile;
      }
      if (trim.includes('5.3') || trim.includes('vortec') || trim.includes('afm')) {
        if (profile.engineCode.includes('AFM')) return profile;
      }
      if (trim.includes('3.5') || trim.includes('ecoboost')) {
        if (profile.engineCode.includes('EcoBoost')) return profile;
      }
    }
  }
  return null;
}

module.exports = { getVehicleRiskProfile, VEHICLE_FLEET_DB };
