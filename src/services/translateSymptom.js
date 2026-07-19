const { runDiagnosticPipeline } = require('./pipeline.engine');

/**
 * Translates symptoms using orchestrated AI layer
 */
async function translateSymptom(prompt) {
  const result = await runDiagnosticPipeline({
    stage: "translate_symptom",
    context: { prompt }
  });

  return result;
}

module.exports = { translateSymptom };
