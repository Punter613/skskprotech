const router = require('express').Router();
const db = require('../services/db');
const { decodeVin } = require('../services/vin');

router.post('/', async (req, res, next) => {
  try {
    const incoming = req.body || {};
    const vinDecoded = await decodeVin(incoming.vin);

    const estimate = {
      labor: Number(incoming.labor || 100),
      parts: Number(incoming.parts || 50),
      total: Number(incoming.labor || 100) + Number(incoming.parts || 50),
      vin: incoming.vin || '',
      vinDecoded
    };

    await db.from('estimates').insert({
      total: estimate.total,
      details: estimate
    });

    res.json({ success: true, estimate });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
