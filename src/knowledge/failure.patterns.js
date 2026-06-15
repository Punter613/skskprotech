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
    linkProtocol: 'DEFAULT_GENERIC', // Scalable map slot
    keywords: ['rattle', 'timing chain', 'knock', 'startup']
  }
];

/**
 * Scans vehicle context and faults to flag multi-system failures simultaneously
 */
function findKnownPatterns(profile = {}, symptoms = [], codes = [], notes = []) {
  if (!profile || !profile.engineCode) return [];

  const matches = [];
  const combinedText = [...symptoms, ...codes, ...notes].join(' ').toLowerCase();

  for (const pattern of KNOWN_PATTERNS) {
    // Rigid Gatekeeper 1: Exact powertrain engine structural match
    if (pattern.targetEngine !== profile.engineCode) continue;

    // Rigid Gatekeeper 2: Strict keyword match against active faults or text
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
