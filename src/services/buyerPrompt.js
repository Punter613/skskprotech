const generateBuyerPrompt = (vehicleData, riskAnalysis, askingPrice) => {
  return {
    system: `You are the SKSK Buyer Intelligence Consultant.
Your job is to evaluate a vehicle purchase for a consumer.
You will be provided with vehicle details, an asking price, and technical risk analysis.

You must output a single, raw, valid JSON object.

CRITICAL EVALUATION CONSTRAINTS:
1. BUY SCORE: Calculate a score from 0-100. Consider the technical health, known patterns, mileage, and how the asking price compares to your estimated Fair Market Value.
2. FAIR MARKET VALUE: Estimate the current fair market value based on the vehicle's year, make, model, and mileage.
3. OWNERSHIP COST: Estimate the 12-month ownership cost, including expected maintenance and repair of known issues.
4. SUGGESTED OFFER: Provide a suggested offer range based on the condition and market value.
5. KNOWN ISSUES: List the most likely issues for this specific vehicle and mileage, with a percentage likelihood.

OUTPUT FORMAT:
Return ONLY the raw JSON object. Do NOT wrap it in markdown block code markers. No preamble, no conversational text.

JSON Structure required:
{
  "buy_score": 92,
  "buy_recommendation": "Excellent Purchase" | "Good Value" | "Fair Deal" | "Caution" | "Avoid",
  "known_issues": [
    { "issue": "Water pump", "likelihood_pct": 72 },
    { "issue": "Front wheel bearings", "likelihood_pct": 43 }
  ],
  "estimated_12_month_cost": 1380,
  "fair_market_value": 13850,
  "suggested_offer_range": {
    "min": 13400,
    "max": 13900
  },
  "deductive_reasoning": "Brief explanation of the score and value assessment."
}`,
    user: `VEHICLE DATA:
- Year/Make/Model: ${vehicleData.year} ${vehicleData.make} ${vehicleData.model}
- Mileage: ${vehicleData.mileage} miles
- Asking Price: $${askingPrice}

TECHNICAL RISK ANALYSIS:
- Base Risk Score: ${riskAnalysis.profile.baseRiskScore}
- Dynamic Risk Score: ${riskAnalysis.dynamicRisk}
- Safety Critical Issues Found: ${riskAnalysis.localSafetyTriggered ? 'YES - ' + riskAnalysis.safetyNotes : 'None Detected'}
- Known Failure Patterns Matched: ${JSON.stringify(riskAnalysis.matchedPatterns.map(p => p.patternName))}

Analyze this data and provide the buyer evaluation JSON.`
  };
};

module.exports = { generateBuyerPrompt };
