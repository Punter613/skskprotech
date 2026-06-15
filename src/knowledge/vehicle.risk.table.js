/**
 * SKSK ProTech - Core Vehicle Safety Risk Matrix
 * Intercepts incoming telemetry to flag critical system failures instantly.
 */

const SAFETY_CRITICAL_KEYWORDS = [
  'brake', 'caliper', 'rotor', 'master cylinder', 'fluid leak',
  'steering', 'tie rod', 'ball joint', 'pitman arm', 'control arm',
  'wheel bearing', 'hub assembly', 'fuel leak', 'gas lines',
  'subframe rotted', 'frame snap', 'brake line rotted'
];

const PLATFORM_SPECIFIC_RISKS = [
  {
    make: 'Ford',
    models: ['F150', 'Ranger', 'Explorer'],
    keywords: ['cruise control switch', 'brake pressure switch'],
    riskNotes: 'Historical liability: SCDS switch leak can cause engine bay fires even when vehicle is turned off.'
  },
  {
    make: 'Ford',
    models: ['500', 'Freestyle'],
    keywords: ['caliper', 'rear brake grinding'],
    riskNotes: 'Rear caliper pins are prone to freezing solid in the salt belt, causing premature pad destruction and un-even clamping pressure.'
  }
];

/**
 * Scans symptoms and mechanic notes to determine safety risks
 * @param {Array<string>} symptoms 
 * @param {Array<string>} notes 
 * @param {Object} vehicle 
 * @returns {Object} { safetyRisk: boolean, forcedUrgency: string|null, riskNotes: string }
 */
function evaluateSafetyRisk(symptoms = [], notes = [], vehicle = {}) {
  const combinedText = [...symptoms, ...notes].join(' ').toLowerCase();
  const vMake = (vehicle.make || '').toLowerCase();
  const vModel = (vehicle.model || '').toLowerCase();

  // 1. Scan global safety keywords
  for (const keyword of SAFETY_CRITICAL_KEYWORDS) {
    if (combinedText.includes(keyword)) {
      return {
        safetyRisk: true,
        forcedUrgency: 'immediate',
        riskNotes: `Safety Risk Flagged: Critical system component detected (${keyword}). Manual inspection required immediately.`
      };
    }
  }

  // 2. Scan platform-specific liabilities
  for (const platform of PLATFORM_SPECIFIC_RISKS) {
    if (vMake.includes(platform.make.toLowerCase()) && platform.models.some(m => vModel.includes(m.toLowerCase()))) {
      for (const kw of platform.keywords) {
        if (combinedText.includes(kw)) {
          return {
            safetyRisk: true,
            forcedUrgency: 'immediate',
            riskNotes: `Platform Risk Pattern Matched: ${platform.riskNotes}`
          };
        }
      }
    }
  }

  return {
    safetyRisk: false,
    forcedUrgency: null,
    riskNotes: ''
  };
}

module.exports = {
  evaluateSafetyRisk,
  SAFETY_CRITICAL_KEYWORDS
};
