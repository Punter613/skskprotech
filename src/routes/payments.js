const router = require('express').Router();

// Lazy-load stripe only when the key is available
let stripe = null;
function getStripe() {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw Object.assign(new Error('Stripe not configured'), { statusCode: 503 });
    }
    stripe = require('stripe')(key);
  }
  return stripe;
}

router.post('/charge', async (req, res, next) => {
  try {
    const { amount, currency = 'usd' } = req.body;

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, error: 'Valid amount is required' });
    }

    const paymentIntent = await getStripe().paymentIntents.create({
      amount: Math.round(Number(amount) * 100),
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true }
    });

    res.json({ success: true, clientSecret: paymentIntent.client_secret });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
