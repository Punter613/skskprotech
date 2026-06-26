const { matchSymptoms } = require('./symptom.matcher');
const { scoreFailures } = require('./failure.scorer');
const { groundDiagnoses } = require('./grounding.guard');

/**
 * The core controller that runs raw data through the entire diagnostic pipeline.
 * Wraps matching, scoring, and grounding into one simple handshake for the routes.
 * * @param {Object} requestData
 * @param {Array<string>} requestData.obdCodes
 * @param {Array<string>} requestData.customerStates
 * @param {Array<string>} requestData.mechanicNotices
 * @param {Object} requestData.vehicle
 * @param {number} [requestData.mileage]
 * @returns {Object} Complete payload of structured diagnostic results
 */
function runDiagnosticPipeline(requestData) {
  const { obdCodes = [], customerStates = [], mechanicNotices = [], vehicle = {}, mileage = 0 } = requestData;

  console.log(`[Engine] Starting diagnostic run for ${vehicle.year || 'Unknown'} ${vehicle.make || ''} ${vehicle.model || ''}`);

  // 1. Run text and code matching
  const rawMatches = matchSymptoms({ obdCodes, customerStates, mechanicNotices });
  
  // 2. Adjust scores based on vehicle bias and regional factors
  const scoredFailures = scoreFailures(rawMatches, vehicle, mileage);
  
  // 3. Filter out mechanical impossibilities
  const groundedResults = groundDiagnoses(scoredFailures, vehicle);

  console.log(`[Engine] Pipeline finished. Found ${groundedResults.length} grounded candidate issues.`);

  return {
    success: true,
    timestamp: new Date().toISOString(),
    vehicleSummary: {
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
      mileage
    },
    topDiagnoses: groundedResults.map(res => ({
      patternId: res.patternId,
      title: res.title,
      system: res.system,
      confidence: res.confidence,
      possibleIssues: res.possibleIssues,
      reasons: res.reasons,
      appliedModifiers: res.appliedModifiers
    }))
  };
}

module.exports = { runDiagnosticPipeline };
