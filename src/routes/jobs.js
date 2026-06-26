const express = require('express');
const router = express.Router();

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  global.__jobs = global.__jobs || {};
  const job = global.__jobs[id];

  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }

  return res.json({
    success: true,
    status: job.status,
    job,
    result: job.result || null,
    estimate: job.result || null
  });
});

module.exports = router;
