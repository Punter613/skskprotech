const express = require('express');
const router = express.Router();

router.post('/', async (req, res) => {
  const { part_number, name, vehicle, vin } = req.body || {};

  if (!part_number && !name) {
    return res.status(400).json({ success: false, error: 'part_number or name required' });
  }

  return res.json({
    success: true,
    local: [
      {
        source: 'Local Auto Store',
        price: 49.99,
        pickup_eta: 'Immediate pickup',
        order_url: 'https://www.autozone.com'
      }
    ],
    online: [
      {
        source: 'Online Distributor',
        price: 44.99,
        shipping_eta: '2-3 business days',
        order_url: 'https://www.napaonline.com'
      }
    ],
    meta: { part_number, name, vehicle, vin }
  });
});

module.exports = router;
