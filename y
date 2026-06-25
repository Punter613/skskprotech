const http = require('http');

const HOST = process.env.HOST || 'http://localhost:10000';
// Adjust the endpoint path to match your actual routing setup
const TARGET_ENDPOINT = '/api/protech/estimate'; 

const payloadPool = [
  { vin: '1FTFW1E86EFA55555', symptoms: 'P0301 engine misfire rough idle' },
  { vin: '5XYZC28286B123456', symptoms: 'Ac blows warm air squealing noise' },
  { vin: '3FA6P0D98GR123456', symptoms: 'Brakes grinding steering wheel shaking' },
  { vin: '2C4RC1BG8GR123456', symptoms: 'Vehicle cranks but will not start no fuel pressure' },
  { vin: '1GCUKNE07JF123456', symptoms: 'Service engine soon light on transmission slipping' }
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
        resolve({ statusCode: res.statusCode, body });
      });
    });

    req.on('error', (e) => reject(e));
    req.write(payloadStr);
    req.end();
  });
}

async function runStressTest() {
  const totalRuns = 50;
  console.log(`[StressTest] Firing up ${totalRuns} simulated estimation requests to ${HOST}${TARGET_ENDPOINT}...`);
  
  const startTime = Date.now();
  const results = { success: 0, failed: 0, durations: [] };

  for (let i = 0; i < totalRuns; i++) {
    const runStart = Date.now();
    const payload = getRandomPayload();
    
    try {
      const { statusCode } = await sendPostRequest(`${HOST}${TARGET_ENDPOINT}`, payload);
      const duration = Date.now() - runStart;
      
      if (statusCode === 200 || statusCode === 201) {
        results.success++;
      } else {
        results.failed++;
      }
      results.durations.push(duration);
      console.log(`[Run ${i + 1}/${totalRuns}] Status: ${statusCode} | Time: ${duration}ms`);
    } catch (err) {
      results.failed++;
      console.error(`[Run ${i + 1}/${totalRuns}] Failed:`, err.message);
    }
  }

  const totalDuration = Date.now() - startTime;
  const avgDuration = results.durations.reduce((a, b) => a + b, 0) / results.durations.length;

  console.log('\n================ STRESS TEST COMPLETE ================');
  console.log(`Total Runs : ${totalRuns}`);
  console.log(`Successful : ${results.success}`);
  console.log(`Failed     : ${results.failed}`);
  console.log(`Avg Time   : ${avgDuration.toFixed(2)}ms`);
  console.log(`Total Time : ${(totalDuration / 1000).toFixed(2)}s`);
  console.log('========================================================');
}

runStressTest();

