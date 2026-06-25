const router = require('express').Router();
const { translateSymptom } = require('../services/translateSymptom');

router.post('/', async (req, res, next) => {
  try {
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: 'No text provided' });

    const result = await translateSymptom(text);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
