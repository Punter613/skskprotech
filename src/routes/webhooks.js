const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const db = require('../db'); // 🔌 Taps into your centralized database connection module

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'mock_stripe_key');

// CRITICAL: Stripe requires the raw, unparsed request body string to securely verify signature validity
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Cryptographically verify that the event actually originated from Stripe
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || 'mock_secret');
  } catch (err) {
    console.error(`❌ Webhook Signature Verification Failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Payment confirms a commercial transaction only. It is not vehicle evidence.
  // In particular, checkout.session.completed must never clear fleet risk/status.
  // Procurement fulfillment belongs in a separate, idempotent commercial ledger.

  // Acknowledge receipt of the webhook securely to stop Stripe retries
  return res.status(200).json({ received: true });
});

module.exports = router;
