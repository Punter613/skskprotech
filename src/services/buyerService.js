const { runDiagnosticPipeline } = require('./pipeline.engine');

/**
 * Evaluates purchase decisions via orchestration layer
 */
async function evaluatePurchase(input) {
  const result = await runDiagnosticPipeline({
    stage: "buyer_evaluation",
    context: input
  });

  return result;
}

module.exports = { evaluatePurchase };
