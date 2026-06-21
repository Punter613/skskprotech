const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const db = require('../db'); 

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'mock_stripe_key_placeholder');

const requireTenant = (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'];
  if (!tenantId) return res.status(401).json({ error: 'Missing tenant account token.' });
  req.tenantId = tenantId;
  next();
};

router.post('/procure-parts', requireTenant, async (req, res) => {
  const { orderItems, companyName } = req.body; 
  const tenantId = req.tenantId;

  if (!orderItems || !Array.isArray(orderItems)) {
    return res.status(400).json({ error: 'Missing order items array manifest.' });
  }

  try {
    const lineItems = orderItems.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: `📦 Bulk Parts Allocation: ${item.component} (${item.tier || 'Standard'} Tier)`,
          description: `SKSKFLEET Automated Procurement for ${companyName || 'Corporate Fleet Partner'}`
        },
        unit_amount: item.price_cents,
      },
      quantity: 1,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `https://p613-backend.onrender.com/fleet?tenant_id=${tenantId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://p613-backend.onrender.com/fleet?tenant_id=${tenantId}&cancel=true`,
      metadata: {
        tenant_id: tenantId,
        procurement_manifest: JSON.stringify(orderItems.map(i => i.component))
      }
    });

    return res.status(200).json({ checkoutUrl: session.url });
  } catch (stripeError) {
    return res.status(500).json({ error: stripeError.message });
  }
});

module.exports = router;
