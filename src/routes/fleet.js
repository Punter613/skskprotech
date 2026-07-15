const express = require('express');
const router = express.Router();
const db = require('../db'); 
const orchestrator = require('../core/orchestrator/main.orchestrator');

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
  const { vins, notes, context = {} } = req.body;
  const tenantId = req.tenantId;

  if (!vins || !Array.isArray(vins)) {
    return res.status(400).json({ error: 'An array of target asset VINs is required.' });
  }

  try {
    const batchResults = await Promise.all(
      vins.map(async (vin) => {
        try {
          const { data: vehicle, error: fetchError } = await db.supabase
            .from('fleet_vehicles')
            .select('*')
            .eq('vin', vin)
            .eq('tenant_id', tenantId)
            .single();

          if (fetchError || !vehicle) {
            throw new Error(`Asset ${vin} missing from fleet database.`);
          }

          const vehicleProfile = {
            vin: vehicle.vin,
            make: vehicle.make || vehicle.year_make_model?.split(' ')[1],
            model: vehicle.model || vehicle.year_make_model?.split(' ')[2],
            year: vehicle.year || vehicle.year_make_model?.split(' ')[0],
            mileage: vehicle.mileage,
            isFleet: true,
            fleetData: {
              tenantId,
              lastServiceMiles: vehicle.last_service_miles,
              currentMiles: vehicle.mileage
            }
          };

          const result = await orchestrator.process({
            input: notes || 'Routine fleet health check',
            vehicleProfile,
            context: { ...context, forceSpecialist: 'fleet' }
          });

          // Update fleet vehicle status based on modular output
          const { error: updateError } = await db.supabase
            .from('fleet_vehicles')
            .update({ 
              status: result.decision?.urgency || 'OK',
              next_predicted_failure: result.decision?.economicAnalysis?.recommendation || null,
              last_intelligence_run: new Date().toISOString()
            })
            .eq('vin', vin)
            .eq('tenant_id', tenantId);

          if (updateError) throw updateError;

          return { vin, status: 'Success', result };
        } catch (individualError) {
          return { vin, status: 'Failed', error: individualError.message };
        }
      })
    );

    return res.status(200).json({
      summary: `Processed ${vins.length} assets.`,
      results: batchResults
    });
  } catch (globalError) {
    return res.status(500).json({ error: globalError.message });
  }
});

module.exports = router;
