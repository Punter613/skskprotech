const express = require('express');
const router = express.Router();
const { randomUUID } = require('crypto');

router.post('/', async (req, res) => {
  const { keyword, vin, fitment } = req.body || {};
  if (!keyword && !vin) {
    return res.status(400).json({ success: false, error: 'keyword or vin required' });
  }

  const jobId = randomUUID();
  global.__jobs = global.__jobs || {};
  global.__jobs[jobId] = {
    id: jobId,
    status: 'queued',
    createdAt: Date.now(),
    request: { keyword, vin, fitment }
  };

  setTimeout(() => {
    const job = global.__jobs?.[jobId];
    if (job && job.status === 'queued') {
      job.status = 'done';
      job.result = {
        success: true,
        labor_hours: 1.5,
        labor_rate: 65,
        total_parts: 0,
        total: 97.5,
        steps: [{ hours: 1.5, description: 'Inspect and diagnose requested system' }],
        parts: [],
        notes: 'Queued estimate completed.'
      };
    }
  }, 1500);

  res.json({ success: true, jobId, job: { id: jobId, status: 'queued' } });
});

module.exports = router;
