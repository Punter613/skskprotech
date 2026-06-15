const router = require('express').Router();
const { groqChat, parseGroqJson } = require('../services/groq');
const db = require('../services/db');

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
      try {
        const groqRes = await groqChat([{ role: 'user', content: prompt }], { max_tokens: 900 });
        const text = groqRes?.choices?.[0]?.message?.content || '';
        aiResult = parseGroqJson(text);

        if (!aiResult) {
          aiResult = {
            primaryCause: text.substring(0, 500),
            secondaryCauses: [],
            codeExplanations: {},
            recommendedTests: ['Visual inspection'],
            recommendedRepairs: [],
            urgency: 'soon',
            safetyRisk: false,
            estimatedRepairTime: 'unknown',
            notes: 'AI returned non-JSON; manual review needed'
          };
        }
      } catch (groqErr) {
        console.warn('[Diagnose] Groq error:', groqErr.message);
        aiResult = {
          primaryCause: 'AI temporarily unavailable',
          secondaryCauses: [],
          codeExplanations: {},
          recommendedTests: ['Manual diagnostic inspection'],
          recommendedRepairs: [],
          urgency: 'soon',
          safetyRisk: false,
          estimatedRepairTime: 'unknown',
          notes: `AI error: ${groqErr.message}`
        };
      }
    } else {
      aiResult = {
        primaryCause: 'GROQ_API_KEY not configured',
        secondaryCauses: [],
        codeExplanations: {},
        recommendedTests: ['Set up AI API key'],
        recommendedRepairs: [],
        urgency: 'soon',
        safetyRisk: false,
        estimatedRepairTime: 'N/A',
        notes: 'Set GROQ_API_KEY env var for AI diagnostics'
      };
    }

    if (db) {
      try {
        await db.from('diagnostics').insert({ input: b, result: aiResult });
      } catch (e) {
        console.warn('[Diagnose] DB save skipped:', e.message);
      }
    }

    res.json({ success: true, result: aiResult });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
