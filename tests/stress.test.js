// stress.test.js

const queue = require("./queue"); // adjust path if needed

const TEST_VINS = [
  "KNDJC736385765089",
  "1FTFW1ET1EKE12345",
  "2HGFC2F59JH123456",
  "5NMS3CADXKH123456",
  "1GCHK23D97F123456"
];

const TEST_URLS = [
  "https://example.com/manual1",
  "https://example.com/manual2",
  "https://example.com/manual3",
  "https://example.com/manual4",
  "https://example.com/manual5"
];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

// Wait for actual job completion
async function waitForJob(job, timeout = 300000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const state = await job.getState();

    if (state === "completed") {
      return {
        id: job.id,
        state,
        duration: Date.now() - start,
        result: await job.returnvalue
      };
    }

    if (state === "failed") {
      return {
        id: job.id,
        state,
        duration: Date.now() - start,
        error: job.failedReason
      };
    }

    await sleep(500);
  }

  return {
    id: job.id,
    state: "timeout",
    duration: timeout
  };
}

async function runStressTest() {
  console.log("🔥 SKSK ProTech STRESS TEST STARTING (50 JOBS)\n");

  const start = Date.now();
  const jobs = [];

  // -----------------------------
  // 1. QUEUE STRESS GENERATION
  // -----------------------------
  for (let i = 0; i < 50; i++) {
    const payload = {
      vin: randomItem(TEST_VINS),
      keyword: `steering clunk test ${i}`,
      fitment: {
        year: 2008 + (i % 3),
        make: "KIA",
        model: "Sorento",
        engine: "3.8L"
      },
      items: TEST_URLS.map(url => ({ url }))
    };

    const job = await queue.add("ai-jobs", {
      id: `stress-${i}-${Date.now()}`,
      payload
    });

    jobs.push(job);

    console.log(`Queued ${i + 1}/50 → ${job.id}`);
  }

  console.log("\n🚀 All jobs queued. Waiting for completion...\n");

  // -----------------------------
  // 2. WAIT FOR COMPLETION
  // -----------------------------
  const results = [];

  for (let i = 0; i < jobs.length; i++) {
    const r = await waitForJob(jobs[i]);
    results.push(r);

    console.log(
      `[${i + 1}/50] ${r.state.toUpperCase()} | ${r.duration}ms | ${r.id}`
    );
  }

  const end = Date.now();

  // -----------------------------
  // 3. METRICS
  // -----------------------------
  const success = results.filter(r => r.state === "completed").length;
  const failed = results.filter(r => r.state === "failed").length;
  const timeouts = results.filter(r => r.state === "timeout").length;

  const durations = results.map(r => r.duration).sort((a, b) => a - b);

  const avg =
    durations.reduce((a, b) => a + b, 0) / durations.length;

  const p95 = durations[Math.floor(durations.length * 0.95)];
  const min = durations[0];
  const max = durations[durations.length - 1];

  console.log("\n📊 ================= STRESS RESULTS =================");
  console.log(`Total Jobs: 50`);
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
  console.log(`Timeouts: ${timeouts}`);
  console.log(`Total Wall Time: ${(end - start) / 1000}s`);

  console.log("\n⏱ Latency Metrics");
  console.log(`Avg: ${avg.toFixed(2)} ms`);
  console.log(`Min: ${min} ms`);
  console.log(`Max: ${max} ms`);
  console.log(`P95: ${p95} ms`);

  console.log("\n🔥 Sample Results:");
  console.log(results.slice(0, 5));
}

runStressTest().catch(err => {
  console.error("❌ Stress test failed:", err);
});
