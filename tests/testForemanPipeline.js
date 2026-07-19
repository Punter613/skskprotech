require('dotenv').config();
const { processSingleEstimate } = require('../src/services/estimator.js');

async function runPipelineTest() {
  console.log("🚀 Initializing SKSKFLEET AI Foreman Integration Test...");

  const mockVehicle = {
    year_make_model: "2021 Ford Transit-250 3.5L V6",
    mileage: 54200,
    status: "OK"
  };

  const mockTechnicianNotes = `
    Unit #14 multi-system check. P0302 active cylinder 2 misfire logged on arrival.
    Spark plugs original. Completely separate issue: Front brake pads measure 3mm. 
    Rotor surface showing light scoring.
  `;

  try {
    const startTime = Date.now();
    const result = await processSingleEstimate({ vehicle: mockVehicle, notes: mockTechnicianNotes });
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n🟢 Execution Complete in ${duration}s!`);
    console.log("------------------------------------------");
    console.log("Parsed AI Payload Output:\n", JSON.stringify(result, null, 2));
    console.log("------------------------------------------");

    if (!result.calculated_severity) throw new Error("Missing: calculated_severity");
    if (!Array.isArray(result.isolated_diagnostics)) throw new Error("Missing: isolated_diagnostics array");
    if (!result.predictive_horizon.predicted_failure_window) throw new Error("Missing: predictive_horizon payload");

    console.log("✅ Validation Test Passed: AI structure matches SKSKFLEET schema expectations perfectly.");
  } catch (error) {
    console.error("❌ Pipeline Validation Test Failed:", error.message);
    process.exit(1);
  }
}

runPipelineTest();
