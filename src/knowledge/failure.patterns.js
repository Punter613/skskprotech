/**
 * SKSK ProTech - Strict Platform Failure Matrix
 * Locks down component lookup rules to eliminate false cross-model matching loops.
 */

const KNOWN_PATTERNS = [
  {
    id: 'spark_plug_separation',
    targetEngine: '5.4L 3V',
    patternName: 'Ford 3V Triton Spark Plug Fusing & Tip Separation',
    primaryCause: 'Lower smooth metal shroud/tip separated from plug body and carbon-fused into cylinder head wall.',
    likelihood: 95,
    linkProtocol: 'FORD_54_TRITON_SPARK_PLUG',
    keywords: ['spark plug', 'stuck', 'broken', 'misfire', 'p0300']
  },
  {
    id: 'afm_lifter_collapse',
    targetEngine: '5.3L AFM',
    patternName: 'GM 5.3L Active Fuel Management (AFM) Lifter Collapse',
    primaryCause: 'Specialized oil-pressure switched AFM locking lifters fail mechanically in the collapsed position.',
    likelihood: 90,
    linkProtocol: 'GM_53_AFM_LIFTER_REPLACE',
    keywords: ['lifter', 'ticking', 'valve noise', 'misfire', 'p0300']
  },
  {
    id: 'vct_phaser_rattle',
    targetEngine: '3.5L EcoBoost',
    patternName: 'Ford EcoBoost 3.5L Cam Phaser Off-Start Rattle',
    primaryCause: 'Internal locking pins inside variable camshaft timing phasers shear or lose holding oil pressure.',
    likelihood: 85,
    linkProtocol: 'DEFAULT_GENERIC',
    keywords: ['rattle', 'timing chain', 'knock', 'startup']
  },
  {
    id: 'hemi_lifter_seizure',
    targetEngine: '5.7L Hemi',
    patternName: 'Ram 5.7 Hemi Camshaft Needle Bearing Seizure',
    primaryCause: 'Conventional lifter roller needle bearings seize, locking the roller wheel and wiping the camshaft lobe down flat.',
    likelihood: 92,
    linkProtocol: 'RAM_57_HEMI_CAM_LIFTER',
    keywords: ['ticking', 'tick', 'chirp', 'misfire', 'p0303', 'p0305', 'p0300']
  },
  {
    id: 'tundra_water_pump_leak',
    targetEngine: '5.7L 3UR-FE',
    patternName: 'Toyota 5.7L Internal Water Pump Mechanical Seal Failure',
    primaryCause: 'Coolant weep hole bypass seal degradation leading to bearing fluid loss, noise, or thermal tracking drops.',
    likelihood: 78,
    linkProtocol: 'TOYOTA_57_WATER_PUMP',
    keywords: ['coolant leak', 'pink crust', 'sweet smell', 'overheating', 'water pump', 'p0128']
  },
  {
    id: 'vtc_actuator_rattle',
    targetEngine: '2.4L K24',
    patternName: 'Honda 2.4L VTC Actuator Cold Start Grunt',
    primaryCause: 'Variable Timing Control actuator lock-pin cavity wears loose, letting the internal vane slam on cold starts before oil pressure arrives.',
    likelihood: 88,
    linkProtocol: 'HONDA_24_VTC_RATTLE',
    keywords: ['grind on start', 'rattle startup', 'cold start rattle', 'p0341', 'timing chain']
  },
  {
    id: 'ecotec_oil_consumption',
    targetEngine: '2.4L Ecotec',
    patternName: 'GM 2.4L Ecotec Oil Control Ring Blow-By',
    primaryCause: 'Low-tension piston oil rings gum up and lose seal tension, devouring crankcase oil without smoke signs and dry-running timing chains.',
    likelihood: 94,
    linkProtocol: 'GM_24_ECOTEC_OIL_BURN',
    keywords: ['oil consumption', 'no oil', 'low oil pressure', 'rattle noise', 'p0016', 'p0017']
  },
  {
    id: 'powershift_clutch_shudder',
    targetEngine: '2.0L Duratec DPS6',
    patternName: 'Ford PowerShift DPS6 Dry Dual-Clutch Fluid Contamination',
    primaryCause: 'Input shaft oil seals fail, leaking gear lubricant onto dry friction plates, resulting in severe gear change hunting and torque stutter.',
    likelihood: 96,
    linkProtocol: 'FORD_DPS6_POWERSHIFT_CLUTCH',
    keywords: ['shudder', 'hesitation', 'slip', 'no reverse', 'p07a3', 'p0805', 'u0101']
  }
];

function findKnownPatterns(profile = {}, symptoms = [], codes = [], notes = []) {
  if (!profile || !profile.engineCode) return [];

  const matches = [];
  const combinedText = [...symptoms, ...codes, ...notes].join(' ').toLowerCase();

  for (const pattern of KNOWN_PATTERNS) {
    if (pattern.targetEngine !== profile.engineCode) continue;

    const hasKeywords = pattern.keywords.some(kw => combinedText.includes(kw));

    if (hasKeywords) {
      matches.push({
        patternId: pattern.id,
        patternName: pattern.patternName,
        primaryCause: pattern.primaryCause,
        likelihood: pattern.likelihood,
        linkProtocol: pattern.linkProtocol
      });
    }
  }
  return matches;
}

module.exports = { findKnownPatterns, KNOWN_PATTERNS };
