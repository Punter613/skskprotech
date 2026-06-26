const axios = require('axios');

const VINS = [
  '1FADP5CU0JF123456', // Ford
  '5NPE84AF2GH123456', // Hyundai
  '1GKS1HKC2H1123456', // GMC
  'WAUGBVAF1K1123456', // Audi
  'JTDZN3EU0J1123456'  // Toyota
];

const SYMPTOMS = [
  'Brake pedal feels spongy',
  'Squealing noise when turning left',
  'Engine stumbles at idle',
  'Check engine light is flashing',
  'Transmission slipping in second gear',
  'Vibration at highway speeds',
  'Leaking green fluid under the radiator'
];

const CODES = [
  'P0300', 'P0420', 'P0171', 'P0302', 'P0442', 'P0505', 'B1234'
];

async function runRandomTest() {
  const vin = VINS[Math.floor(Math.random() * VINS.length)];
  const symptom = SYMPTOMS[Math.floor(Math.random() * SYMPTOMS.length)];
  const code = CODES[Math.floor(Math.random() * CODES.length)];

  const payload = {
    vin,
    customerStates: [symptom],
    obdCodes: [code],
    mechanicNotices: ['Initial inspection confirms customer report.'],
    laborRate: 85,
    partType: symptom.toLowerCase().includes('brake') ? 'brake pads' : 'spark plugs'
  };

  console.log('--- Random Test Execution ---');
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post('http://localhost:3000/api/full-estimate', payload);
    console.log('Status:', response.status);
    console.log('Duration:', response.data.duration_ms, 'ms');
    console.log('AI Used:', response.data.meta.ai_used);
    console.log('Repairs Found:', response.data.estimate.repairs);
    console.log('Parts Tiers:', response.data.parts.length);
    console.log('Guide Generated:', !!response.data.guide);
  } catch (error) {
    console.error('Test Failed:', error.response ? error.response.data : error.message);
  }
}

// Start a local server mock if needed, or just assume the server is running
// For the purpose of this task, we will just create the script.
// If we want to run it, we'd need the server up.

if (require.main === module) {
  runRandomTest();
}
