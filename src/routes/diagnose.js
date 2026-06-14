const router = require('express').Router();
const db = require('../services/db');
const { decodeVin } = require('../services/vin');

router.post('/', async (req, res, next) => {
  try {
    const input = req.body || {};
    const vinDecoded = await decodeVin(input.vin);

    const result = {
      jobType: 'Diagnosis',
      vin: input.vin || '',
      vinDecoded,
      notes: input.notes || [],
      codes: input.codes || [],
      symptoms: input.symptoms || []
    };

    await db.from('diagnostics').insert({
      input,
      result
    });

    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
