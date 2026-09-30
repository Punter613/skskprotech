const express = require('express');
const router = express.Router();
const db = require('../db'); 
const { processSingleEstimate } = require('../services/estimator');

async function requireTenant(req, res, next) {
  // Verified user sessions are bound to the shop assigned by trusted server-side
  // identity metadata. Never let a browser header override that membership.
  const authenticatedShopId = req.auth?.type === 'supabase_user'
    ? String(req.auth.shopId || '').trim()
    : '';

  // Transitional shop keys do not yet carry tenant membership. Keep the legacy
  // header only for that migration path; remove it when shop keys are retired.
  const legacyTenantId = req.auth?.type === 'shop_key'
    ? String(req.headers['x-tenant-id'] || '').trim()
    : '';

  const tenantId = authenticatedShopId || legacyTenantId;
  if (!tenantId) return res.status(403).json({ error: 'Authenticated shop context is required.' });
  if (!db.supabase) return res.status(503).json({ error: 'Fleet storage not configured (SUPABASE_URL/KEY missing).' });

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

router.post('/add', requireTenant, async (req, res) => {
  const { vin, year, make, model, mileage } = req.body || {};

  if (!vin || vin.length !== 17) {
    return res.status(400).json({ ok: false, error: 'A valid 17-character VIN is required.' });
  }

  try {
    const year_make_model = [year, make, model].filter(Boolean).join(' ') || null;
    const { data, error } = await db.supabase
      .from('fleet_vehicles')
      .upsert({
        tenant_id: req.tenantId,
        vin,
        year_make_model,
        mileage: Number(mileage) || 0,
        status: 'Healthy'
      }, { onConflict: 'tenant_id,vin' })
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, vehicle: data });
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
