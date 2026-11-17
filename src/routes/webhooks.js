'use strict';
const express = require('express');
const router = express.Router();
const Stripe = require('stripe');

// The webhook is mounted before JSON parsing in api/server.js so Stripe receives
// the original request bytes. Never accept a public or development signing fallback.
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey || !webhookSecret) {
    console.error('[Stripe Webhook] Stripe configuration missing; rejecting event');
    return res.status(503).json({ error: 'Stripe webhook not configured' });
  }

  const sig = req.headers['stripe-signature'];
  try {
    const stripe = new Stripe(stripeKey);
    stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  // Payment confirms a commercial transaction only, never vehicle condition.
  // No fleet, job, or commercial-ledger writes are performed here.
  return res.status(200).json({ received: true });
});

module.exports = router;
