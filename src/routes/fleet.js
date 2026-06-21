const express = require('express');
const router = express.Router();
const db = require('../db'); // Taps into our shiny new unified Supabase module
const aiQueue = require('../queue'); // Taps into our active Redis dispatch hub

// 🔒 Tenant Security Checkpoint Middleware
async function requireTenant(req, res, next) {
  const tenantId = req.headers['x-tenant-id'];
  if (!tenantId) return res.status(401).json({ error: 'Missing corporate account context.' });
  req.tenantId = tenantId;
  next();
}

// 📋 GET: Fetch Entire Fleet Roster
router.get('/roster', requireTenant, async (req, res) => {
  try {
    const { data, error } = await db.getJobById.__proto__.constructor // Access dynamic clients
      ? await db.getJobById.__proto__.constructor.from('fleet_vehicles').select('*').eq('tenant_id', req.tenantId)
      : { data: [], error: null }; // Fallback protection placeholder
    
    // For this build block, we'll implement direct queries via your working SDK model
    res.json({ ok: true, roster: data || [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ⚡ POST: Trigger Bulk Pipeline Automation for Selected Fleet Units
router.post('/bulk-estimate', requireTenant, async (req, res) => {
  const { vins, keyword, labor_rate } = req.body;
  if (!vins || !Array.isArray(vins)) return res.status(400).json({ error: 'Array of target VINs required.' });

  const triggeredJobs = [];

  for (const vin of vins) {
    const jobId = require('uuid').v4();
    const jobPayload = {
      id: jobId,
      type: 'bulk_fleet_analysis',
      tenant_id: req.tenantId,
      payload: { vin, keyword, labor_rate },
      created_at: new Date().toISOString()
    };

    // Push right into your working Bull/Redis assembly line
    await aiQueue.add('ai-jobs', jobPayload);
    triggeredJobs.push({ vin, jobId });
  }

  res.json({ ok: true, message: `Dispatched ${triggeredJobs.length} units to the P613 crawler track.`, jobs: triggeredJobs });
});

module.exports = router;
