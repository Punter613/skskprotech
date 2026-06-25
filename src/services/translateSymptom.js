const { groqChat, parseGroqJson } = require('./groq');

async function translateSymptom(text) {
  if (!text) {
    return { translated: text, keywords: [] };
  }

  if (!process.env.GROQ_API_KEY) {
    return { translated: text, keywords: [] };
  }

  const prompt = `You are an expert automotive technician.
Translate the customer's plain-language complaint into a concise mechanic-style symptom description for a repair order.

Rules:
- Preserve the customer's meaning.
- Do not diagnose the cause.
- Do not add certainty or repair recommendations.
- Output only JSON.

Customer said: "${text}"

Respond with JSON ONLY:
{
  "translated": "concise mechanic-style symptom description",
  "keywords": ["short technical keyword 1", "short technical keyword 2"]
}`;

  try {
    const groqRes = await groqChat([{ role: 'user', content: prompt }], { max_tokens: 300 });
    const raw = groqRes?.choices?.[0]?.message?.content || '';
    const parsed = parseGroqJson(raw);

    return {
      translated: parsed?.translated || text,
      keywords: parsed?.keywords || []
    };
  } catch (err) {
    return { translated: text, keywords: [] };
  }
}

module.exports = { translateSymptom };
