/**
 * SKSK ProTech Groq AI Communication Layer
 * Handles strict-boundary API dispatching for deterministic translations and estimations.
 */

async function groqChat(messages, options = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn('[Groq] API Key missing - Returning mock response');
    return {
      choices: [{
        message: {
          content: JSON.stringify({
            priority: "medium",
            diagnosis: "AI simulation: Manual inspection required",
            repairs: ["Diagnostic inspection required"]
          })
        }
      }]
    };
  }

  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  const payload = {
    model,
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.max_tokens ?? 1500
  };

  if (options.response_format) {
    payload.response_format = options.response_format;
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Groq request failed: ${res.status} ${text}`);
    }

    return res.json();
  } catch (err) {
    console.error('[Groq Error]:', err.message);
    throw err;
  }
}

function parseGroqJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (inner) {}
    }
  }
  return null;
}

module.exports = { groqChat, parseGroqJson };
