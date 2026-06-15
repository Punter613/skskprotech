const express = require('express');
const router = express.Router();
const { runDiagnosticPipeline } = require('../brain/diagnosis.engine');
const { groqChat } = require('../services/groq');

/**
 * POST /api/diagnose
 * AI-powered diagnostic engine backed by local mechanic rules & TSB matching.
 */
router.post('/', async (req, res) => {
  try {
    const {
      vehicle = {},
      obdCodes = [],
      customerStates = [],
      mechanicNotices = [],
      mileage = 0
    } = req.body;

    // 1. Run data through our local diagnostic logic block
    const pipelineResults = runDiagnosticPipeline({
      obdCodes,
      customerStates,
      mechanicNotices,
      vehicle,
      mileage
    });

    // 2. Format a tight system prompt using our local engine's ranked insights
    const topMatchesText = pipelineResults.topDiagnoses.length > 0
      ? pipelineResults.topDiagnoses.map(d => 
          `- [${d.confidence} Confidence] ${d.title} (${d.system.toUpperCase()}). Possible Fixes: ${d.possibleIssues.join(', ')}. Context Modifiers: ${d.appliedModifiers.join('; ')}`
        ).join('\n')
      : '- No explicit local TSB pattern matched. Rely on general vehicle mechanical diagnostics.';

    const systemPrompt = `You are the core diagnostic module of SKSK ProTech, an AI assistant built for mobile mechanics working in the field. Your job is to analyze data and output a structured, professional diagnostic report.

Vehicle Profile:
- Year/Make/Model: ${vehicle.year || 'Unknown'} ${vehicle.make || 'Unknown'} ${vehicle.model || 'Unknown'}
- Trim: ${vehicle.trim || 'N/A'}
- Odometer: ${mileage ? mileage.toLocaleString() : 'Unknown'} miles

Grounded Mechanic Brain Matches (Pre-Calculated Priorities):
${topMatchesText}

Guidelines:
1. Prioritize and heavily discuss any high-confidence local brain matches listed above. They account for real-world failure biases and regional rust adjustments.
2. Keep your phrasing direct, concise, and professional—ideal for field access on mobile screens.
3. Provide an itemized breakdown including: Possible Root Cause, Recommended Verification Steps, and Estimated Labor Severity.
4. Do not hallucinate or suggest components that are physically impossible for this vehicle configuration.`;

    const userPrompt = `Analyze this vehicle data and provide a diagnostic breakthrough:
- Logged OBD-II Codes: ${obdCodes.length > 0 ? obdCodes.join(', ') : 'None'}
- Customer Complaint: "${customerStates.join(', ') || 'None'}"
- Field Mechanic Observations: "${mechanicNotices.join(', ') || 'None'}"`;

    console.log('[Route] Calling Groq with local diagnostic guidance...');
    
    // 3. Dispatch to Groq LLM service with our custom rules
    const aiResponse = await groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    // 4. Return everything cleanly back to the client app
    res.json({
      success: true,
      localBrainSummary: pipelineResults,
      diagnosis: aiResponse
    });

  } catch (err) {
    console.error('[Route Error] Diagnosis failed:', err.message || err);
    res.status(500).json({
      success: false,
      error: 'Failed to process diagnostic analysis pool.'
    });
  }
});

module.exports = router;
