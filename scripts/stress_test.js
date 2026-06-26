const http = require('http');

const HOST = process.env.HOST || 'http://localhost:3000';
const TARGET_ENDPOINT = '/api/full-estimate'; 

// Production payload pool matching your full-estimate pipeline structure
const payloadPool = [
  { vin: 'KNDJC736385765089', customerStates: ['P0301 engine misfire', 'rough idle'], laborRate: 65 },
  { vin: 'KNDJC736385765089', customerStates: ['Ac blows warm air', 'squealing noise'], laborRate: 65 },
  { vin: '3FA6P0D98GR123456', customerStates: ['Brakes grinding', 'steering wheel shaking'], laborRate: 85 },
  { vin: '2C4RC1BG8GR123456', customerStates: ['Vehicle cranks but will not start', 'no fuel pressure'], laborRate: 65 },
  { vin: 'KNDJC736385765089', customerStates: ['Service engine soon light on', 'transmission slipping'], laborRate: 95 }
];

function getRandomPayload() {
  return payloadPool[Math.floor(Math.random() * payloadPool.length)];
}

async function sendPostRequest(url, data) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payloadStr = JSON.stringify(data);

    const options = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payloadStr)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          // Attempt to parse JSON response body
          const jsonBody = JSON.parse(body);
          resolve({ statusCode: res.statusCode, body: jsonBody });
        } catch (e) {
          // Fallback if response is raw text/html
          resolve({ statusCode: res.statusCode, body: { error: body } });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(payloadStr);
    req.end();
  });
}

// Simple delay utility to prevent overwhelming concurrent limits
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runStressTest() {
  const totalRuns = 50;
  console.log(`[StressTest] Firing ${totalRuns} estimates to ${HOST}${TARGET_ENDPOINT} with debug tracing...`);
  
  const startTime = Date.now();
  const results = { success: 0, failed: 0, durations: [] };

  for (let i = 0; i < totalRuns; i++) {
    const runStart = Date.now();
    const payload = getRandomPayload();
    
    // Slight 50ms pacing to keep the queue stable and prevent socket drops
    await delay(50);
    
    try {
      const { statusCode, body } = await sendPostRequest(`${HOST}${TARGET_ENDPOINT}`, payload);
      const duration = Date.now() - runStart;
      
      if (statusCode === 200 && body.success) {
        results.success++;
        console.log(`[Run ${i + 1}/${totalRuns}] Status: 200 | Time: ${duration}ms`);
      } else {
        results.failed++;
        const errorMsg = body.error || body.details || JSON.stringify(body);
        console.log(`[Run ${i + 1}/${totalRuns}] Status: ${statusCode} | Time: ${duration}ms | Body: ${errorMsg}`);
      }
      results.durations.push(duration);
    } catch (err) {
      results.failed++;
      results.durations.push(Date.now() - runStart);
      console.error(`[Run ${i + 1}/${totalRuns}] Crash:`, err.message);
    }
  }

  const totalDuration = Date.now() - startTime;
  const avgDuration = results.durations.length ? results.durations.reduce((a, b) => a + b, 0) / results.durations.length : 0;

  console.log('\n================ STRESS TEST DEBUG COMPLETE ================');
  console.log(`Total Runs      : ${totalRuns}`);
  console.log(`Successful      : ${results.success}`);
  console.log(`Failed          : ${results.failed}`);
  console.log(`Avg Round-Trip  : ${avgDuration.toFixed(2)}ms`);
  console.log(`Total Time      : ${(totalDuration / 1000).toFixed(2)}s`);
  console.log('============================================================');
}

runStressTest();
