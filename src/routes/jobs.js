const express = require('express');
const router = express.Router();
const db = require('../db'); // 🔌 Clean link directly to your unified Supabase manager

router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const job = await db.getJobById(id);

    if (!job) return res.status(404).json({ error: 'job not found' });

    // Normalize response for your bulletproof client-side polling function
    const response = {
      id: job.id,
      status: job.status || 'queued',
      result: job.result || job.payload || null,
      created_at: job.created_at,
      finished_at: job.finished_at
    };

    return res.json(response);
  } catch (err) {
    console.error('jobs:get', err);
    return res.status(500).json({ error: 'internal error' });
  }
});

module.exports = router;
