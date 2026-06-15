/**
 * SKSK ProTech - Core Vehicle Profile Database
 * Hardcodes fleet-level liabilities, risk indexes, and component wear thresholds.
 */

const VEHICLE_FLEET_DB = {
  'FORD_F150_5.4_TRITON': {
    vehicleId: 'FORD_F150_5.4_TRITON',
    make: 'Ford',
    model: 'F150',
    engine: '5.4',
    riskScore: 96,
    rustMultiplier: 1.25,
    safetyCriticalComponents: ['spark_plugs', 'brakes', 'exhaust_manifolds'],
    commonFailures: [
      'spark_plug_separation',
      'cam_phaser_failure',
      'timing_chain_wear',
      'coil_pack_failure',
      'manifold_stud_breakage'
    ],
    averageFailureMileage: {
      spark_plugs: 90000,
      cam_phasers: 120000,
      timing_chains: 150000,
      exhaust_manifolds: 110000
    }
  },
  'CHRYSLER_3.6_PENTASTAR': {
    vehicleId: 'CHRYSLER_3.6_PENTASTAR',
    make: 'Jeep', // Matches make lookups for Wrangler/Grand Cherokee/Ram clusters
    model: 'Wrangler',
    engine: '3.6',
    riskScore: 88,
    rustMultiplier: 1.10,
    safetyCriticalComponents: ['rocker_arms', 'oil_filter_housing'],
    commonFailures: [
      'needle_bearing_seizure',
      'camshaft_lobe_scoring',
      'oil_filter_housing_cracking',
      'cylinder_head_misfire'
    ],
    averageFailureMileage: {
      rocker_arms: 80000,
      oil_filter_housing: 70000,
      camshafts: 95000
    }
  },
  'FORD_3.5_ECOBOOST': {
    vehicleId: 'FORD_3.5_ECOBOOST',
    make: 'Ford',
    model: 'F150',
    engine: '3.5',
    riskScore: 85,
    rustMultiplier: 1.20,
    safetyCriticalComponents: ['cam_phasers', 'turbo_oil_lines'],
    commonFailures: [
      'vct_phaser_rattle',
      'timing_chain_stretch',
      'turbo_coolant_line_leaks',
      'intercooler_condensation_shudder'
    ],
    averageFailureMileage: {
      cam_phasers: 85000,
      timing_chain: 100000,
      turbo_lines: 90000
    }
  },
  'GM_5.3_VORTEC_AFM': {
    vehicleId: 'GM_5.3_VORTEC_AFM',
    make: 'Chevrolet',
    model: 'Silverado',
    engine: '5.3',
    riskScore: 92,
    rustMultiplier: 1.25,
    safetyCriticalComponents: ['afm_lifters', 'oil_pressure_screen', 'brake_lines'],
    commonFailures: [
      'afm_lifter_collapse',
      'oil_consumption_piston_rings',
      'oil_pressure_sensor_clog',
      'salt_belt_brake_line_rot'
    ],
    averageFailureMileage: {
      afm_lifters: 110000,
      oil_sensor_screen: 80000,
      brake_lines: 120000
    }
  }
};

/**
 * Queries local fleet records matching incoming vehicle profiles
 * @param {Object} vehicle { make, model, trim }
 * @returns {Object|null} Matching structured profile
 */
function getVehicleRiskProfile(vehicle = {}) {
  const make = (vehicle.make || '').toLowerCase();
  const model = (vehicle.model || '').toLowerCase();
  const trim = (vehicle.trim || '').toLowerCase();

  // Search core mapping indicators
  if (make.includes('ford') && (trim.includes('5.4') || trim.includes('triton'))) {
    return VEHICLE_FLEET_DB['FORD_F150_5.4_TRITON'];
  }
  if ((make.includes('jeep') || make.includes('ram') || make.includes('chrysler')) && trim.includes('3.6')) {
    return VEHICLE_FLEET_DB['CHRYSLER_3.6_PENTASTAR'];
  }
  if (make.includes('ford') && (trim.includes('3.5') || trim.includes('ecoboost'))) {
    return VEHICLE_FLEET_DB['FORD_3.5_ECOBOOST'];
  }
  if ((make.includes('chev') || make.includes('gm')) && trim.includes('5.3')) {
    return VEHICLE_FLEET_DB['GM_5.3_VORTEC_AFM'];
  }

  return null;
}

module.exports = { getVehicleRiskProfile, VEHICLE_FLEET_DB };
