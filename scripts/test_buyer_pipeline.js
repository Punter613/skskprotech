const axios = require('axios');

const testBuyer = async () => {
  const payload = {
    year: 2014,
    make: 'Ram',
    model: '1500',
    mileage: 110000,
    askingPrice: 18500
  };

  console.log('--- TESTING SKSK BUYER PIPELINE ---');
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    // We'll call the server directly if it's running, or we can use the service directly for testing
    // Since I'm in a sandbox, I'll try to run the server in the background first.
    console.log('Sending request to /api/buyer/evaluate...');
    const response = await axios.post('http://localhost:3000/api/buyer/evaluate', payload);

    console.log('\n--- EVALUATION RESULT ---');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (err) {
    console.error('Error:', err.response ? err.response.data : err.message);
  }
};

testBuyer();
