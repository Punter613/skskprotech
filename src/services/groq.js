async function groqChat(messages, options = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY missing');

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
}

module.exports = { groqChat };
