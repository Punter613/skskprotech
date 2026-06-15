/**
 * SKSK ProTech - Upgraded Platform Failure Pattern Library
 * Expanded to index core fleet truck liabilities including Pentastar, EcoBoost, and Silverado blocks.
 */

const KNOWN_PATTERNS = [
  {
    id: 'FORD_54_TRITON_PLUG_SEPARATION',
    condition: { make: 'Ford', engines: ['5.4l', '5.4', 'triton'], keywords: ['spark plug', 'stuck', 'broken', 'misfire'] },
    patternName: 'Ford 3V Triton Spark Plug Fusing & Tip Separation',
    primaryCause: 'Lower smooth metal shroud/tip separated from plug body and carbon-fused into the cylinder head wall.',
    likelihood: 95,
    knownIssues: [
      'Original Motorcraft two-piece spark plug design seizes due to carbon accumulation in combustion gap.',
      'High rate of standard tool truck extraction tools slipping or stripping the thread head walls.'
    ],
    notes: 'CRITICAL: Requires Shaffer Custom Extraction Protocol.'
  },
  {
    id: 'CHRYSLER_PENTASTAR_TICK',
    condition: { make: 'Jeep', models: ['Wrangler', 'Grand Cherokee', 'Ram'], engines: ['3.6', 'pentastar'], keywords: ['ticking', 'misfire', 'valve train'] },
    patternName: 'Chrysler Pentastar 3.6L Camshaft Needle Bearing Failure',
    primaryCause: 'Rocker arm roller needle bearings fail and seize, leading to direct scoring of the camshaft lobes and cylinder misfires.',
    likelihood: 88,
    knownIssues: [
      'Pronounced ticking sound from left or right cylinder bank heads.',
      'Can throw P0300, P0302, or P0304 codes when lift limits fail.'
    ],
    notes: 'Inspect rocker rollers manually; replace rocker assemblies and affected cams instantly.'
  },
  {
    id: 'FORD_ECOBOOST_PHASER_RATTLE',
    condition: { make: 'Ford', models: ['F150', 'Expedition'], engines: ['3.5', 'ecoboost', '2.7'], keywords: ['rattle on start', 'timing chain', 'knock'] },
    patternName: 'Ford EcoBoost 3.5L/2.7L Cam Phaser Off-Start Rattle',
    primaryCause: 'Internal locking pins inside the variable camshaft timing (VCT) phasers shear or wear out, losing oil hold pressure.',
    likelihood: 85,
    knownIssues: [
      'Loud metallic rattling noise lasting 2-5 seconds immediately following a cold startup sequence.',
      'Timing chain stretch issues caused by prolonged pin slack wobble.'
    ],
    notes: 'Requires updated VCT phaser components and fresh primary chain tensioners.'
  },
  {
    id: 'GM_SILVERADO_AFM_LIFTER_COLLAPSE',
    condition: { make: 'Chevrolet', models: ['Silverado', 'Sierra', 'Tahoe'], engines: ['5.3', 'vortec', 'ecotec'], keywords: ['misfire P0300', 'lifter lock', 'valve noise'] },
    patternName: 'GM 5.3L Active Fuel Management (AFM) Lifter Collapse',
    primaryCause: 'Specialized oil-pressure switched AFM locking lifters fail mechanically in the collapsed position, disabling valves permanently.',
    likelihood: 90,
    knownIssues: [
      'Sudden severe misfire on cylinder 1, 4, 6, or 7 accompanied by hard engine ticking noise.',
      'Prone to severe pushrod bending and potential camshaft damage if run long while locked.'
    ],
    notes: 'Requires mechanical lifter replacement; physical AFM delete kit recommended for high mileage blocks.'
  }
];

function findKnownPatterns(vehicle = {}, symptoms = [], codes = []) {
  const matches = [];
  const make = (vehicle.make || '').toLowerCase();
  const model = (vehicle.model || '').toLowerCase();
  const trimAndEngine = (vehicle.trim || '').toLowerCase();
  const combinedText = [...symptoms, ...codes, ...notes = []].join(' ').toLowerCase();

  for (const pattern of KNOWN_PATTERNS) {
    const cond = pattern.condition;
    if (!make.includes(cond.make.toLowerCase())) continue;

    let modelMatch = cond.models ? cond.models.some(m => model.includes(m.toLowerCase())) : true;
    let engineMatch = cond.engines ? cond.engines.some(e => trimAndEngine.includes(e.toLowerCase())) : true;
    let keywordMatch = cond.keywords ? cond.keywords.some(kw => combinedText.includes(kw.toLowerCase())) : false;

    if ((modelMatch && engineMatch) || keywordMatch) {
      matches.push({
        patternId: pattern.id,
        patternName: pattern.patternName,
        primaryCause: pattern.primaryCause,
        likelihood: pattern.likelihood,
        knownIssues: pattern.knownIssues,
        notes: pattern.notes
      });
    }
  }
  return matches;
}

module.exports = { findKnownPatterns, KNOWN_PATTERNS };
