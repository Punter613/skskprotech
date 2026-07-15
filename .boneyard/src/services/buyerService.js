const { decodeVinNhtsa } = require('./vin');
const { runDiagnosticPipeline } = require('./pipeline.engine');
const { groqChat } = require('./groq');
const { generateBuyerPrompt } = require('./buyerPrompt');

const evaluatePurchase = async ({ vin, year, make, model, mileage, askingPrice }) => {
  let vehicle = { year, make, model };

  // 1. Decode VIN if provided to get precise engine/trim for risk analysis
  if (vin) {
    try {
      const decoded = await decodeVinNhtsa(vin);
      if (decoded) {
        vehicle = { ...vehicle, ...decoded };
      }
    } catch (err) {
      console.warn('[BuyerService] VIN decode failed, proceeding with provided VMM:', err.message);
    }
  }

  // 2. Run technical risk analysis
  // We don't have codes or symptoms yet (it's a potential buy),
  // but we have mileage and VMM to check known patterns.
  const trace = { logs: [], log: (label, msg) => trace.logs.push(`[${label}] ${msg}`) };
  const riskAnalysis = runDiagnosticPipeline({
    vehicle,
    vin,
    mileage,
    symptoms: [],
    codes: [],
    notes: []
  }, trace);

  // 3. Generate AI Buyer Evaluation
  const prompts = generateBuyerPrompt(vehicle, riskAnalysis, askingPrice);

  const groqRes = await groqChat([
    { role: 'system', content: prompts.system },
    { role: 'user', content: prompts.user }
  ], {
    temperature: 0.2,
    response_format: { type: 'json_object' }
  });

  const aiContent = groqRes?.choices?.[0]?.message?.content;
  if (!aiContent) {
    throw new Error('AI Buyer Evaluation failed to generate content');
  }

  try {
    const evaluation = JSON.parse(aiContent);
    return {
      success: true,
      vehicle,
      riskAnalysis: {
        baseRiskScore: riskAnalysis.profile.baseRiskScore,
        dynamicRiskScore: riskAnalysis.dynamicRisk,
        matchedPatterns: riskAnalysis.matchedPatterns,
        safetyTriggered: riskAnalysis.localSafetyTriggered
      },
      evaluation,
      logs: trace.logs
    };
  } catch (parseErr) {
    console.error('[BuyerService] JSON parse failed:', aiContent);
    throw new Error('AI Buyer Evaluation returned invalid JSON');
  }
};

module.exports = { evaluatePurchase };
