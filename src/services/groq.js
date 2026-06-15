/**
 * Shared Groq LLM service
 * Handles AI chat completions with caching, retries, and timeout
 */
const https = require('https');

// Simple in-memory cache for identical prompts (TTL: 5 minutes)
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function groqChat(messages, opts = {}) {
  const { max_tokens = 800, temperature = 0.3, model = 'llama-3.1-8b-instant', useCache = true } = opts;

  // Build cache key from sorted messages
  const cacheKey = useCache ? JSON.stringify(messages.map(m => [m.role, m.content].join('|'))) : null;

  if (useCache && cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.ts < CACHE_TTL_MS) {
      return Promise.resolve(cached.data);
    }
    cache.delete(cacheKey);
  }

  return new Promise((resolve, reject) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return reject(new Error('GROQ_API_KEY not configured'));
    }

    const body = JSON.stringify({ model, messages, max_tokens, temperature });

    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 25000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            return reject(new Error(parsed.error.message || 'Groq API error'));
          }
          if (useCache && cacheKey) {
            cache.set(cacheKey, { data: parsed, ts: Date.now() });
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error('Bad GROQ response: ' + (data || 'empty')));
        }
      });
    });

    req.on('error', (err) => reject(new Error('Groq request failed: ' + err.message)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Groq request timeout'));
    });

    req.write(body);
    req.end();
  });
}

/** Parse JSON from Groq response text, handling markdown code blocks */
function parseGroqJson(text) {
  if (!text) return null;
  const clean = text.replace(/```json\s*|\s*```/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

module.exports = { groqChat, parseGroqJson };
