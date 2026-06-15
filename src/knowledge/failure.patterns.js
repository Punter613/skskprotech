/**
 * SKSK ProTech - Platform Failure Pattern Library
 * Maps vehicle profiles and symptoms directly to known high-confidence failure patterns.
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
    notes: 'CRITICAL: Requires the Shaffer Custom Extraction Protocol if standard specialty kits fail.'
  },
  {
    id: 'FORD_500_REAR_CALIPER_FREEZE',
    condition: { make: 'Ford', models: ['500', 'five hundred', 'freestyle'], keywords: ['rear brake', 'grinding', 'caliper', 'piston'] },
    patternName: 'Ford D3 Platform Rear Caliper Slide Contamination',
    primaryCause: 'Rear brake caliper slider pins seized or internal parking brake actuator piston locked inside bore.',
    likelihood: 90,
    knownIssues: [
      'Salt belt rust penetrates pin boots, locking the assembly and burning through inner brake pads down to raw metal-on-metal steel.',
      'Requires verified slide pin service or complete caliper assembly swap.'
    ],
    notes: 'Prioritize slider pin bore hone and grease inspection.'
  },
  {
    id: 'KIA_SORENTO_THRU_BOLT_STRIP',
    condition: { make: 'Kia', models: ['sorento'], keywords: ['head bolt', 'overheating', 'stripped', 'coolant'] },
    patternName: 'Kia Lambda/Theta Engine Block Aluminum Head Bolt Thread Strip',
    primaryCause: 'Cylinder head bolt threads stripping out of the soft aluminum block casing during normal thermal expand cycles.',
    likelihood: 80,
    knownIssues: [
      'Causes sudden blown head gasket symptoms without external hose failures.',
      'Requires complete block thread restoration using Time-Sert inserts.'
    ],
    notes: 'Check for trailing exhaust gases inside the coolant expansion tank to confirm block deck breach.'
  }
];

/**
 * Evaluates vehicle specs and text blocks against known shop failure lists
 * @param {Object} vehicle { make, model, trim }
 * @param {Array<string>} symptoms
 * @param {Array<string>} codes
 * @returns {Array<Object>} Matched patterns
 */
function findKnownPatterns(vehicle = {}, symptoms = [], codes = []) {
  const matches = [];
  const make = (vehicle.make || '').toLowerCase();
  const model = (vehicle.model || '').toLowerCase();
  const trimAndEngine = (vehicle.trim || '').toLowerCase();
  const combinedText = [...symptoms, ...codes].join(' ').toLowerCase();

  for (const pattern of KNOWN_PATTERNS) {
    const cond = pattern.condition;
    
    // Check baseline make
    if (!make.includes(cond.make.toLowerCase())) continue;

    let modelMatch = true;
    let engineMatch = true;
    let keywordMatch = false;

    // Check optional specific model targets
    if (cond.models && !cond.models.some(m => model.includes(m.toLowerCase()))) {
      modelMatch = false;
    }

    // Check optional specific engine designations
    if (cond.engines && !cond.engines.some(e => trimAndEngine.includes(e.toLowerCase()))) {
      engineMatch = false;
    }

    // Check keyword flags inside symptoms or codes
    if (cond.keywords && cond.keywords.some(kw => combinedText.includes(kw.toLowerCase()))) {
      keywordMatch = true;
    }

    // If it lines up with the platform or text keywords, log it as a match
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

module.exports = {
  findKnownPatterns,
  KNOWN_PATTERNS
};
