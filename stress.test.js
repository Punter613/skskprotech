// stress.test.js
// SKSK ProTech - API Stress Runner (50 Jobs)

const axios = require("axios");

const URL = "http://localhost:3000/api/parts/search";

const TEST_CASE = {
  year: 2006,
  make: "Ford",
  model: "F150",
  partType: "spark plugs"
};

const RUNS = 50;

function now() {
  return new Date().toISOString();
}

async function run() {
  console.log(`🔥 STRESS TEST START ${now()}`);
  console.log(`Target: ${URL}`);
  console.log(`Runs: ${RUNS}\n`);

  const times = [];

  for (let i = 0; i < RUNS; i++) {
    const start = Date.now();

    try {
      const res = await axios.post(URL, TEST_CASE, {
        headers: { "Content-Type": "application/json" }
      });

      const ms = Date.now() - start;
      times.push(ms);

      console.log(
        `[#${i + 1}] ${ms}ms | success=${res.data?.success === true}`
      );
    } catch (err) {
      const ms = Date.now() - start;
      console.log(`[#${i + 1}] FAILED after ${ms}ms`, err.message);
    }
  }

  const avg =
    times.reduce((a, b) => a + b, 0) / (times.length || 1);

  const min = Math.min(...times);
  const max = Math.max(...times);

  console.log("\n📊 RESULTS");
  console.log("----------------");
  console.log(`Total Runs: ${RUNS}`);
  console.log(`Successful: ${times.length}`);
  console.log(`Avg: ${avg.toFixed(2)}ms`);
  console.log(`Min: ${min}ms`);
  console.log(`Max: ${max}ms`);
  console.log(`End: ${now()}`);
}

run();
