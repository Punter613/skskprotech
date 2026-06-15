const router = require('express').Router();
const https = require('https');

function groqChat(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'llama3-8b-8192',
      messages,
      max_tokens: 800,
      temperature: 0.3
    });
    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Bad GROQ response')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const laborRate = Number(b.laborRate || process.env.DEFAULT_LABOR_RATE || 65);
    const partsCost = Number(b.partsCost || 0);
    const vehicle = b.vehicle || {};
    const vehicleStr = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ');
    const symptoms = (b.customerStates || []).join(', ');
    const notices = (b.mechanicNotices || []).join(', ');
    const codes = (b.obdCodes || []).join(', ');

    const prompt = `You are an expert mobile mechanic estimator. Generate a professional repair estimate.

Vehicle: ${vehicleStr || 'Unknown'}
VIN: ${b.vin || 'N/A'}
Customer reports: ${symptoms || 'N/A'}
Mechanic notices: ${notices || 'N/A'}
OBD codes: ${codes || 'None'}
Labor rate: $${laborRate}/hr
Parts provided: $${partsCost}

Respond with a JSON object ONLY (no markdown, no explanation):
{
  "diagnosis": "brief diagnosis",
  "repairs": ["repair 1", "repair 2"],
  "estimatedHours": 2.5,
  "laborCost": 162.50,
  "partsCost": ${partsCost},
  "total": 242.50,
  "notes": "any important notes",
  "priority": "high|medium|low"
}`;

    let aiResult = null;
    if (process.env.GROQ_API_KEY) {
      const groqRes = await groqChat([{ role: 'user', content: prompt }]);
      const text = groqRes?.choices?.[0]?.message?.content || '';
      try {
        const clean = text.replace(/```json|```/g, '').trim();
        aiResult = JSON.parse(clean);
      } catch(e) {
        aiResult = { diagnosis: text, repairs: [], estimatedHours: 1, laborCost: laborRate, partsCost, total: laborRate + partsCost, notes: '', priority: 'medium' };
      }
    } else {
      aiResult = {
        diagnosis: 'GROQ_API_KEY not set',
        repairs: [],
        estimatedHours: 1,
        laborCost: laborRate,
        partsCost,
        total: laborRate + partsCost,
        notes: 'Configure GROQ_API_KEY in environment',
        priority: 'medium'
      };
    }

    // Optional Supabase save — won't crash if not configured
    try {
      const db = require('../services/db');
      if (db) {
        await db.from('estimates').insert({ total: aiResult.total, details: { ...aiResult, customer: b.customer, vehicle } });
      }
    } catch(e) { /* db optional */ }

    res.json({ success: true, estimate: aiResult });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
