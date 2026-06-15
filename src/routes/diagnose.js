const router = require('express').Router();
const https = require('https');

function groqChat(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'llama3-8b-8192',
      messages,
      max_tokens: 900,
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
    const symptoms = (b.symptoms || []).join(', ');
    const codes = (b.codes || []).join(', ');
    const notes = (b.notes || []).join(', ');

    const prompt = `You are an expert automotive diagnostic technician. Analyze the following and provide a clear diagnosis.

VIN: ${b.vin || 'N/A'}
Mileage: ${b.mileage || 'N/A'}
Symptoms: ${symptoms || 'N/A'}
OBD Codes: ${codes || 'None'}
Tech Notes: ${notes || 'N/A'}

Respond with JSON ONLY (no markdown):
{
  "primaryCause": "most likely cause",
  "secondaryCauses": ["other possibility 1", "other possibility 2"],
  "codeExplanations": {"P0300": "explanation"},
  "recommendedTests": ["test 1", "test 2"],
  "recommendedRepairs": ["repair 1", "repair 2"],
  "urgency": "immediate|soon|monitor",
  "safetyRisk": true,
  "estimatedRepairTime": "2-3 hours",
  "notes": "additional notes"
}`;

    let aiResult = null;
    if (process.env.GROQ_API_KEY) {
      const groqRes = await groqChat([{ role: 'user', content: prompt }]);
      const text = groqRes?.choices?.[0]?.message?.content || '';
      try {
        const clean = text.replace(/```json|```/g, '').trim();
        aiResult = JSON.parse(clean);
      } catch(e) {
        aiResult = { primaryCause: text, secondaryCauses: [], codeExplanations: {}, recommendedTests: [], recommendedRepairs: [], urgency: 'soon', safetyRisk: false, estimatedRepairTime: 'unknown', notes: '' };
      }
    } else {
      aiResult = { primaryCause: 'GROQ_API_KEY not configured', secondaryCauses: [], codeExplanations: {}, recommendedTests: [], recommendedRepairs: [], urgency: 'soon', safetyRisk: false, estimatedRepairTime: 'N/A', notes: 'Set GROQ_API_KEY env var' };
    }

    try {
      const db = require('../services/db');
      if (db) {
        await db.from('diagnostics').insert({ input: b, result: aiResult });
      }
    } catch(e) { /* db optional */ }

    res.json({ success: true, result: aiResult });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
