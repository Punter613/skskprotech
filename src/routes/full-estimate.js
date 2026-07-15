const express = require('express');
const router = express.Router();
const orchestrator = require('../core/orchestrator/main.orchestrator');
const { decodeVinNhtsa } = require('../services/vin');

router.post('/', async (req, res) => {
  const {
    vin,
    customerStates = [],
    mechanicNotices = [],
    obdCodes = [],
    mileage = 0,
    history = [],
    context = {}
  } = req.body;

  try {
    let vehicleProfile = { vin, mileage: Number(mileage) };

    // 1. Resolve vehicle details via VIN decoding if not provided
    if (vin && (!req.body.make || !req.body.model)) {
      const decoded = await decodeVinNhtsa(vin);
      if (decoded) {
        vehicleProfile = { ...vehicleProfile, ...decoded };
      }
    } else {
      vehicleProfile = {
        ...vehicleProfile,
        make: req.body.make,
        model: req.body.model,
        year: req.body.year,
        trim: req.body.trim,
        engine: req.body.engine
      };
    }

    // 2. Prepare input string for AI Specialists
    const input = [
      ...customerStates,
      ...mechanicNotices,
      ...obdCodes,
      history.length ? `History: ${history.join(', ')}` : ''
    ].filter(Boolean).join('. ');

    // 3. Process through the modular pipeline
    const result = await orchestrator.process({
      input: input || 'Standard vehicle health check',
      vehicleProfile,
      context: {
        ...context,
        history
      }
    });

    res.json(result);

  } catch (err) {
    console.error('[FullEstimate Refactored] Error:', err);
    res.status(500).json({
      success: false,
      error: 'Refactored pipeline failed',
      details: err.message
    });
  }
});

module.exports = router;
