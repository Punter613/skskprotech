const express = require('express');
const router = express.Router();
const axios = require('axios');
const { persistAndEnqueue } = require('../services/processScrape');

router.post('/', async (req, res) => {
  try {
    const { url, keyword, vin, fitment } = req.body;

    // Call out to our low-level Render Rust crawler node
    const scrapeRes = await axios.post(
      'https://p613-backend.onrender.com/api/scrape',
      { url }
    );

    const parsed = {
      items: scrapeRes.data.results || [],
      duration_ms: scrapeRes.data.duration_ms || 0
    };

    // Hands off to persistence engine and queues background processing
    const jobInfo = await persistAndEnqueue(parsed, { keyword, vin, fitment });

    res.json({
      ok: true,
      scraped: parsed.items.length,
      job: jobInfo
    });
  } catch (err) {
    console.error('[Ingestion Route Error]:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
