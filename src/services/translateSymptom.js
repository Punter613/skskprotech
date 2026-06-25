const { groqChat, parseGroqJson } = require('./groq');

async function translateSymptom(text) {
  if (!text) {
    return { translated: text, keywords: [] };
  }

  if (!process.env.GROQ_API_KEY) {
    return { translated: text, keywords: [] };
  }

  const prompt = `You are an expert automotive technician. A customer described their car problem in plain everyday language. Translate it into precise technical mechanic language that a shop tech would write on a repair order.

Customer said: "${text}"

Respond with JSON ONLY:
{
  "translated": "technical mechanic description of the same symptom",
  "keywords": ["technical term 1", "technical term 2"]
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
