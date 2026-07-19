const express = require('express');
const router = express.Router();
const db = require('../db'); 
const { processSingleEstimate } = require('../services/estimator');

async function requireTenant(req, res, next) {
  const tenantId = req.headers['x-tenant-id'];
  if (!tenantId) return res.status(401).json({ error: 'Missing corporate account context.' });
  req.tenantId = tenantId;
  next();
}

router.get('/roster', requireTenant, async (req, res) => {
  try {
    const { data, error } = await db.supabase
      .from('fleet_vehicles')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .order('status', { ascending: false });

    if (error) throw error;
    res.json({ ok: true, roster: data || [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/bulk-estimate', requireTenant, async (req, res) => {
  const { vins, notes, labor_rate } = req.body;
  const tenantId = req.tenantId;

  if (!vins || !Array.isArray(vins)) {
    return res.status(400).json({ error: 'An array of target asset VINs is required.' });
  }

  try {
    const batchResults = await Promise.all(
      vins.map(async (vin) => {
        try {
          if (!vin || vin.length !== 17) {
            throw new Error(`Invalid VIN format length: ${vin?.length || 0} chars.`);
          }

          const { data: vehicle, error: fetchError } = await db.supabase
            .from('fleet_vehicles')
            .select('year_make_model, mileage, status')
            .eq('vin', vin)
            .eq('tenant_id', tenantId)
            .single();

          if (fetchError || !vehicle) {
            throw new Error(`Asset profile missing from fleet log database.`);
          }

          const rawResult = await processSingleEstimate({ vehicle, notes });

          const { error: updateError } = await db.supabase
            .from('fleet_vehicles')
            .update({ 
              next_predicted_failure: rawResult.predictive_horizon,
              status: rawResult.calculated_severity
            })
            .eq('vin', vin)
            .eq('tenant_id', tenantId);

          if (updateError) throw updateError;

          return { vin, status: 'Success', error: null };
        } catch (individualError) {
          return { vin, status: 'Failed', error: individualError.message };
        }
      })
    );

    const failedCount = batchResults.filter(r => r.status === 'Failed').length;

    return res.status(200).json({
      summary: `Processed ${vins.length} assets. Success: ${vins.length - failedCount}, Failures: ${failedCount}`,
      results: batchResults
    });
  } catch (globalError) {
    return res.status(500).json({ error: globalError.message });
  }
});

module.exports = router;
