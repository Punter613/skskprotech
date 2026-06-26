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

  // 💳 Handle successful corporate procurement checkouts
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    const tenantId = session.metadata?.tenant_id;
    const manifestRaw = session.metadata?.procurement_manifest;

    if (tenantId && manifestRaw) {
      try {
        const componentsArray = JSON.parse(manifestRaw);
        console.log(`📦 Payment Confirmed. Clearing risk flags for Tenant: ${tenantId}`);

        // Automatically resolve asset conditions back to safe defaults inside Supabase
        const { data, error } = await db.supabase
          .from('fleet_vehicles')
          .update({
            status: 'OK', // Reset structural threshold
            next_predicted_failure: {
              predicted_failure_window: "None",
              primary_risk_component: "All Systems Stable"
            } // Fixed: Passed clean JS object payload. Supabase client handles JSONB mapping natively.
          })
          .eq('tenant_id', tenantId);

        if (error) throw error;
        console.log(`✅ Database State Synchronized. Operational flags safely restored.`);

      } catch (dbError) {
        console.error(`❌ Failed to update asset records following payment: ${dbError.message}`);
        return res.status(500).json({ error: 'Database update failed.' });
      }
    }
  }

  // Acknowledge receipt of the webhook securely to stop Stripe retries
  return res.status(200).json({ received: true });
});

module.exports = router;
