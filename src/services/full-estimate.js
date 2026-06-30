const { runDiagnosticPipeline } = require('./pipeline.engine');
const { scrapeLEMONManuals } = require('../services/lemon');
const { decodeVinNhtsa } = require('../services/vin');
const { extractJSON, uniqueStrings, clampNumber } = require('../services/estimateHelpers');
const { sanitizeEstimate } = require('../services/estimateSanitizer');
const { findKnowledgeProcedure } = require('../services/procedure_lookup');
const { translateSymptom } = require('../services/translateSymptom');

/**
 * FULL ESTIMATE CORE PIPELINE (CLEAN VERSION)
 * No direct AI calls allowed.
 */
async function fullEstimate(input) {

  const vinData = await decodeVinNhtsa(input.vin);
  const manualData = await scrapeLEMONManuals(vinData);

  const context = {
    vinData,
    manualData,
    symptoms: input.symptoms,
    mileage: input.mileage
  };

  const raw = await runDiagnosticPipeline({
    stage: "estimate_generation",
    context
  });

  return sanitizeEstimate(raw);
}

module.exports = { fullEstimate };
