const express = require('express');
const router = express.Router();

// Small wrapper route to forward to the new orchestrator
const orchestrator = require('../core/orchestrator/main.orchestrator');

const validateVehicleProfile = (req, res, next) => {
  const required = ['vin', 'make', 'model', 'year', 'mileage'];
  const missing = required.filter(field => !req.body.vehicleProfile?.[field]);
  if (missing.length > 0) {
    return res.status(400).json({ error: 'Missing required vehicle profile fields', missing });
  }
  next();
};

router.post('/analyze', validateVehicleProfile, async (req, res) => {
  try {
    const { input, vehicleProfile, context = {} } = req.body;
    const result = await orchestrator.process({ input, vehicleProfile, context });
    res.json(result);
  } catch (err) {
    console.error('[INTELLIGENCE]', err);
    res.status(500).json({ status: 'ERROR', error: err.message });
  }
});

router.get('/health', (req, res) => {
  try {
    res.json(orchestrator.health());
  } catch (err) {
    res.status(500).json({ status: 'ERROR', error: err.message });
  }
});

module.exports = router;