async function groqChat(messages, options = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn('[Groq] API Key missing - Returning mock response');

    const sysPrompt = messages.find(m => m.role === 'system')?.content || '';
    const userPrompt = messages.find(m => m.role === 'user')?.content || '';

    let mockContent = {
      priority: "medium",
      diagnosis: "AI simulation: Manual inspection required",
      repairs: ["Diagnostic inspection required"]
    };

    if (sysPrompt.includes('diagnostic') || sysPrompt.includes('root cause') || userPrompt.includes('diagnostic')) {
      mockContent = {
        rootCauses: [{ cause: "General wear and tear", likelihood: 80, confidence: 90 }],
        diagnosticSteps: ["Visual inspection", "Road test"],
        relatedComponents: ["Brakes", "Suspension"],
        overallConfidence: 85
      };
    } else if (sysPrompt.includes('estimator') || sysPrompt.includes('parts') || sysPrompt.includes('labor')) {
      mockContent = {
        parts: [{ partNumber: "GEN-101", description: "Replacement Part", manufacturer: "OEM", price: 150, quantity: 1 }],
        labor: { hours: 2, rate: 100, subtotal: 200 },
        tax: 28,
        total: 378
      };
    } else if (sysPrompt.includes('buyer') || sysPrompt.includes('purchase')) {
      mockContent = {
        buy_score: 85,
        buy_recommendation: "Excellent Purchase",
        known_issues: [{ issue: "Water pump", likelihood_pct: 72 }],
        estimated_12_month_cost: 1200,
        fair_market_value: 14000,
        suggested_offer_range: { min: 13500, max: 14500 },
        deductive_reasoning: "Solid vehicle condition for the age."
      };
    }

    return {
      choices: [{
        message: {
          content: JSON.stringify(mockContent)
        }
      }]
    };
  }

  const model = options.model || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

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
    if (options.response_format?.type === 'json_object') {
       return {
         choices: [{
           message: {
             content: JSON.stringify({
               error: "AI_GENERATION_FAILED",
               fallback_active: true,
               diagnosis: "Pipeline execution encountered an AI provider error. System falling back to deterministic safety rules.",
               priority: "high"
             })
           }
         }]
       };
    }
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
