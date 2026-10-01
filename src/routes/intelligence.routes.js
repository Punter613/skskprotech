/**
 * SKSK learning/audit intelligence routes.
 *
 * Diagnostic and estimate orchestration does NOT live here. The only production
 * authority path is the persisted lifecycle:
 * Intake -> Diagnose -> Test -> Verify -> Estimate -> Authorize -> Work Order
 * -> Completed Work -> Final Invoice -> Outcome.
 *
 * These endpoints record/review learning signals only. They must never create
 * diagnostic verification or commercial truth.
 */
const express = require('express');
const router = express.Router();

router.post('/feedback', async (req, res) => {
  try {
    const { repairKey, feedback } = req.body;

    // Legacy in-memory tag (kept for backwards compat, non-fatal either way)
    try {
      const evidenceVerifier = require('../core/evidence/evidence.verifier');
      if (evidenceVerifier && typeof evidenceVerifier.recordFeedback === 'function') {
        evidenceVerifier.recordFeedback(repairKey, feedback);
      }
    } catch (e) {
      console.log(`[Feedback Proxy Tracked Log] Key: ${repairKey}, Data:`, feedback);
    }

    // Real persistent learning loop (Supabase-backed when configured)
    let stored = null;
    try {
      const { feedbackLoop, usingSupabase } = require('../core/learning');
      stored = await feedbackLoop.recordRepairOutcome({ requestId: repairKey, ...feedback });
      return res.json({
        status: 'SUCCESS',
        message: 'Feedback recorded for continuous learning',
        repairKey,
        persisted: usingSupabase,
        exampleId: stored?.id || null
      });
    } catch (learningErr) {
      console.warn('[Feedback] learning loop failed, feedback only logged legacy-side:', learningErr.message);
      return res.json({ status: 'SUCCESS', message: 'Feedback recorded (legacy log only)', repairKey, persisted: false });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Lightweight thumbs up/down on a single AI response - high volume, low detail
router.post('/feedback/quick', async (req, res) => {
  try {
    const { requestId, provider, model, verdict, metadata } = req.body;
    if (!['up', 'down', 'neutral'].includes(verdict)) {
      return res.status(400).json({ error: "verdict must be 'up', 'down', or 'neutral'" });
    }
    const { feedbackLoop, usingSupabase } = require('../core/learning');
    const stored = await feedbackLoop.recordQuickFeedback({ requestId, provider, model, verdict, metadata });
    return res.json({ status: 'SUCCESS', persisted: usingSupabase, feedback: stored });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Where the AI keeps getting it wrong or missing things - repeat offenders by vehicle/component
router.get('/feedback/blindspots', async (req, res) => {
  try {
    const { feedbackLoop } = require('../core/learning');
    const blindspots = await feedbackLoop.getAIBlindspots();
    return res.json({ status: 'SUCCESS', count: blindspots.length, blindspots });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// A given mechanic's accuracy track record against AI recommendations
router.get('/feedback/mechanic/:mechanicId', async (req, res) => {
  try {
    const { feedbackLoop } = require('../core/learning');
    const insights = await feedbackLoop.getMechanicInsights(req.params.mechanicId);
    return res.json({ status: 'SUCCESS', insights });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Pending queue: AI outputs the deterministic completed-work-guard caught
// and filtered, waiting on a mechanic to confirm the catch was real
// before it counts as a training signal.
router.get('/guard-catches', async (req, res) => {
  try {
    const { listPendingGuardCatches } = require('../core/learning/guard.catch.recorder');
    const catches = await listPendingGuardCatches(Number(req.query.limit) || 50);
    return res.json({ status: 'SUCCESS', count: catches.length, catches });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// body: { correct: boolean, mechanicId?: string, note?: string }
// correct=true feeds the catch into the real learning loop as an
// AI_HALLUCINATED-weighted example. correct=false marks it a false
// positive - logged for guard tuning, never trains anything.
router.post('/guard-catches/:id/verify', async (req, res) => {
  try {
    const { correct, mechanicId, note } = req.body;
    if (typeof correct !== 'boolean') {
      return res.status(400).json({ error: '"correct" must be true or false' });
    }
    const { recordVerification } = require('../core/learning/guard.catch.recorder');
    const { feedbackLoop } = require('../core/learning');
    const result = await recordVerification(req.params.id, correct, { mechanicId, note, feedbackLoop });
    return res.json({ status: 'SUCCESS', ...result });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});


module.exports = router;
