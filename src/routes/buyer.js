const express = require('express');
const router = express.Router();
const { evaluatePurchase } = require('../services/buyerService');

router.post('/evaluate', async (req, res) => {
  const { vin, year, make, model, mileage, askingPrice } = req.body;

  if (!mileage || !askingPrice) {
    return res.status(400).json({
      success: false,
      error: 'Mileage and Asking Price are required for evaluation.'
    });
  }

  if (!vin && (!year || !make || !model)) {
    return res.status(400).json({
      success: false,
      error: 'Either a VIN or Year/Make/Model details are required.'
    });
  }

  try {
    const result = await evaluatePurchase({
      vin,
      year,
      make,
      model,
      mileage: Number(mileage),
      askingPrice: Number(askingPrice)
    });
    res.json(result);
  } catch (err) {
    console.error('[Buyer Route] Evaluation error:', err);
    res.status(500).json({
      success: false,
      error: 'Buyer evaluation pipeline failed.',
      details: err.message
    });
  }
});

module.exports = router;
