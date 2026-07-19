const router = require('express').Router();
const { groqChat, parseGroqJson } = require('../services/groq');

router.post('/', async (req, res, next) => {
  try {
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: 'No text provided' });

    const prompt = `You are an expert automotive technician. A customer described their car problem in plain everyday language. Translate it into precise technical mechanic language that a shop tech would write on a repair order.

Customer said: "${text}"

Respond with JSON ONLY:
{
  "translated": "technical mechanic description of the same symptom",
  "keywords": ["technical term 1", "technical term 2"]
}`;

    if (!process.env.GROQ_API_KEY) {
      return res.json({ translated: text, keywords: [] });
    }

    const groqRes = await groqChat([{ role: 'user', content: prompt }], { max_tokens: 300 });
    const raw = groqRes?.choices?.[0]?.message?.content || '';
    const parsed = parseGroqJson(raw);

    res.json({ translated: parsed?.translated || text, keywords: parsed?.keywords || [] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
