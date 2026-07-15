require('dotenv').config();
const orchestrator = require('../src/core/orchestrator/main.orchestrator');

async function runPipelineTest() {
  console.log("🚀 Initializing SKSK Rebuilt Platform Integration Test...");

  const mockVehicle = {
    make: "Ford",
    model: "Transit-250",
    year: 2021,
    mileage: 54200,
    vin: "1FTFW1ET5DFC10312"
  };

  const mockNotes = `
    P0302 active cylinder 2 misfire logged on arrival.
    Spark plugs original. Completely separate issue: Front brake pads measure 3mm. 
  `;

  try {
    const startTime = Date.now();
    const result = await orchestrator.process({
      input: mockNotes,
      vehicleProfile: mockVehicle,
      context: { forceSpecialist: 'diagnostic' }
    });
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n🟢 Execution Complete in ${duration}s!`);
    console.log("------------------------------------------");
    console.log("Decision Output:\n", JSON.stringify(result.decision, null, 2));
    console.log("------------------------------------------");

    if (result.status !== 'SUCCESS') throw new Error(`Pipeline status: ${result.status}`);
    if (!result.decision.action) throw new Error("Missing: decision.action");

    console.log("✅ Validation Test Passed: Rebuilt platform modular output verified.");
  } catch (error) {
    console.error("❌ Pipeline Validation Test Failed:", error.message);
    process.exit(1);
  }
}

runPipelineTest();
