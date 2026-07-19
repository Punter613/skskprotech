const express = require('express');
const router = express.Router();
const orchestrator = require('../core/orchestrator/main.orchestrator');
const { decodeVinNhtsa } = require('../services/vin');

router.post('/evaluate', async (req, res) => {
  const { vin, year, make, model, mileage, askingPrice, context = {} } = req.body;

  if (!mileage || !askingPrice) {
    return res.status(400).json({
      success: false,
      error: 'Mileage and Asking Price are required for evaluation.'
    });
  }

  try {
    let vehicleProfile = { vin, mileage: Number(mileage), purchasePrice: Number(askingPrice) };

    if (vin && (!make || !model)) {
      const decoded = await decodeVinNhtsa(vin);
      if (decoded) {
        vehicleProfile = { ...vehicleProfile, ...decoded };
      }
    } else {
      vehicleProfile = { ...vehicleProfile, year, make, model };
    }

    const result = await orchestrator.process({
      input: `Evaluate purchase of ${vehicleProfile.year} ${vehicleProfile.make} ${vehicleProfile.model} with ${mileage} miles for $${askingPrice}`,
      vehicleProfile,
      context: { ...context, forceSpecialist: 'buyer' }
    });

    res.json(result);
  } catch (err) {
    console.error('[Buyer Refactored] error:', err);
    res.status(500).json({
      success: false,
      error: 'Buyer evaluation pipeline failed.',
      details: err.message
    });
  }
});

module.exports = router;
