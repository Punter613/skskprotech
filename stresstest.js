// stress.test.js

const queue = require('./queue'); // adjust path if needed

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

async function runStressTest() {
  console.log("🔥 SKSK ProTech Stress Test Starting (50 Jobs)\n");

  const start = Date.now();
  const jobs = [];

  for (let i = 0; i < 50; i++) {
    const payload = {
      vin: randomItem(TEST_VINS),
      keyword: "steering clunk full lock test",
      fitment: {
        year: 2008,
        make: "KIA",
        model: "Sorento",
        engine: "3.8L"
      },
      items: TEST_URLS.map(url => ({
        url
      }))
    };

    const job = await queue.add("ai-jobs", {
      id: `stress-${i}-${Date.now()}`,
      payload
    });

    jobs.push(job.id);
    console.log(`Queued Job ${i + 1}/50 → ${job.id}`);
  }

  console.log("\n🚀 All jobs queued. Waiting for processing...\n");

  // simple wait window (adjust based on your avg runtime)
  const waitTime = 5 * 60 * 1000; // 5 minutes
  await new Promise(res => setTimeout(res, waitTime));

  const end = Date.now();

  console.log("\n📊 STRESS TEST COMPLETE");
  console.log("------------------------");
  console.log(`Jobs Sent: 50`);
  console.log(`Total Time Window: ${(end - start) / 1000}s`);
  console.log(`Avg per job window: ${(end - start) / 50 / 1000}s`);
  console.log(`Job IDs Sample:`, jobs.slice(0, 5));
}

runStressTest().catch(err => {
  console.error("Stress test failed:", err);
});
