const router = require('express').Router();
const { groqChat, parseGroqJson } = require('../services/groq');
const db = require('../services/db');

router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};

    // Input validation
    const laborRate = Math.max(0, Number(b.laborRate || process.env.DEFAULT_LABOR_RATE || 65));
    const partsCost = Math.max(0, Number(b.partsCost || 0));
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
      try {
        const groqRes = await groqChat([{ role: 'user', content: prompt }], { max_tokens: 800 });
        const text = groqRes?.choices?.[0]?.message?.content || '';
        aiResult = parseGroqJson(text);

        if (!aiResult) {
          // Fallback: treat the text as the diagnosis
          const fallbackHours = 1;
          aiResult = {
            diagnosis: text.substring(0, 500),
            repairs: [],
            estimatedHours: fallbackHours,
            laborCost: Math.round(laborRate * fallbackHours * 100) / 100,
            partsCost,
            total: Math.round((laborRate * fallbackHours + partsCost) * 100) / 100,
            notes: 'AI returned non-JSON; manual review needed',
            priority: 'medium'
          };
        }
      } catch (groqErr) {
        console.warn('[Estimate] Groq error:', groqErr.message);
        aiResult = {
          diagnosis: 'AI temporarily unavailable — using fallback estimate',
          repairs: ['Diagnostic inspection required'],
          estimatedHours: 1,
          laborCost: laborRate,
          partsCost,
          total: laborRate + partsCost,
          notes: `AI error: ${groqErr.message}`,
          priority: 'medium'
        };
      }
    } else {
      aiResult = {
        diagnosis: 'AI not configured — set GROQ_API_KEY',
        repairs: ['Manual inspection required'],
        estimatedHours: 1,
        laborCost: laborRate,
        partsCost,
        total: laborRate + partsCost,
        notes: 'Configure GROQ_API_KEY in environment',
        priority: 'medium'
      };
    }

    // Optional Supabase save — won't crash if not configured
    if (db) {
      try {
        await db.from('estimates').insert({
          total: aiResult.total,
          details: { ...aiResult, customer: b.customer, vehicle }
        });
      } catch (e) {
        console.warn('[Estimate] DB save skipped:', e.message);
      }
    }

    res.json({ success: true, estimate: aiResult });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
