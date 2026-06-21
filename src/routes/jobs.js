const express = require('express');
const router = express.Router();
const pool = require('../pool');

router.get('/:id', async (req, res) => {
  try {
    const jobId = req.params.id;
    
    const result = await pool.query(
      'SELECT id, type, payload, status, result, created_at, finished_at FROM ai_jobs WHERE id = $1',
      [jobId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Job ID not found in database.' });
    }

    // Returns the row directly to the frontend polling loop
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Polling API Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
