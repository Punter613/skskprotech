/**
 * SKSK Intelligence API Routes
 * Express routes that expose the full orchestrator pipeline
 *
 * POST /api/intelligence/analyze - Main analysis endpoint
 * POST /api/intelligence/estimate - Quick estimate (diagnostic + estimate chain)
 * POST /api/intelligence/predict - Predictive maintenance forecast
 * POST /api/intelligence/economic - Economic analysis only
 * GET  /api/intelligence/health - System health check
 * GET  /api/intelligence/stats - Pipeline statistics
 */

const express = require('express');
const router = express.Router();
const orchestrator = require('../core/orchestrator/main.orchestrator');
const economicEngine = require('../core/economic/economic.engine');

const validateVehicleProfile = (req, res, next) => {
  const required = ['vin', 'make', 'model', 'year', 'mileage'];
  const missing = required.filter(field => !req.body.vehicleProfile?.[field]);

  if (missing.length > 0) {
    return res.status(400).json({
      error: 'Missing required vehicle profile fields',
      missing,
      example: {
        vehicleProfile: {
          vin: '1FTFW1ET5DFC10312',
          make: 'Ford',
          model: 'F-150',
          year: 2019,
          mileage: 85000,
          componentData: {
            brakes: { padThickness: 3.2, rotorRunout: 0.03 }
          }
        }
      }
    });
  }
  next();
};

router.post('/analyze', validateVehicleProfile, async (req, res) => {
  try {
    const { input, vehicleProfile, context = {} } = req.body;

    console.log(`[API] Intelligence request for VIN ${vehicleProfile.vin}: "${input}"`);

    const result = await orchestrator.process({
      input,
      vehicleProfile,
      context
    });

    res.json(result);

  } catch (error) {
    console.error('[API] Intelligence error:', error);
    res.status(500).json({
      status: 'ERROR',
      error: error.message,
      fallback: {
        action: 'HUMAN_HANDOFF',
        message: 'System error. Please contact a service advisor.',
        urgency: 'HIGH'
      }
    });
  }
});

router.post('/estimate', validateVehicleProfile, async (req, res) => {
  try {
    const { input, vehicleProfile, context = {} } = req.body;

    const result = await orchestrator.process({
      input,
      vehicleProfile,
      context: {
        ...context,
        forceSpecialist: 'estimate',
        suggestedChain: ['diagnostic', 'estimate', 'parts']
      }
    });

    res.json(result);

  } catch (error) {
    console.error('[API] Estimate error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/predict', validateVehicleProfile, async (req, res) => {
  try {
    const { vehicleProfile, context = {} } = req.body;

    const result = await orchestrator.process({
      input: 'Generate predictive maintenance forecast for all components',
      vehicleProfile,
      context: {
        ...context,
        forceSpecialist: 'prediction'
      }
    });

    res.json(result);

  } catch (error) {
    console.error('[API] Prediction error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/economic', async (req, res) => {
  try {
    const { recommendation, vehicleProfile } = req.body;

    if (!recommendation || !vehicleProfile) {
      return res.status(400).json({
        error: 'Requires recommendation and vehicleProfile'
      });
    }

    const result = await economicEngine.analyze(recommendation, vehicleProfile);
    res.json(result);

  } catch (error) {
    console.error('[API] Economic error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/batch', validateVehicleProfile, async (req, res) => {
  try {
    const { recommendations, vehicleProfile } = req.body;

    if (!Array.isArray(recommendations)) {
      return res.status(400).json({ error: 'recommendations must be an array' });
    }

    const results = await economicEngine.analyzeBatch(recommendations, vehicleProfile);
    res.json({
      status: 'SUCCESS',
      count: results.length,
      results,
      rankedByUrgency: true
    });

  } catch (error) {
    console.error('[API] Batch error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/health', (req, res) => {
  res.json(orchestrator.health());
});

router.get('/stats', (req, res) => {
  res.json({
    status: 'SUCCESS',
    stats: orchestrator.getStats(),
    economicAssumptions: economicEngine.getAssumptions()
  });
});

router.post('/feedback', async (req, res) => {
  try {
    const { repairKey, feedback } = req.body;

    const evidenceVerifier = require('../core/evidence/evidence.verifier');
    evidenceVerifier.recordFeedback(repairKey, feedback);

    res.json({
      status: 'SUCCESS',
      message: 'Feedback recorded for continuous learning',
      repairKey
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
