/**
 * PIPELINE ENGINE (PLANNER ONLY)
 * - NO AI CALLS INSIDE
 * - ONLY RETURNS STRUCTURED WORKFLOW
 */

function runDiagnosticPipeline(input) {
  return buildPlan(input);
}

/**
 * Pure deterministic planner
 */
function buildPlan(input) {
  return {
    type: 'diagnostic_plan',
    steps: [
      {
        step: 'analyze_symptoms',
        input
      },
      {
        step: 'generate_diagnosis'
      }
    ]
  };
}

module.exports = {
  runDiagnosticPipeline
};
