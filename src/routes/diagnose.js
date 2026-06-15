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

    // Explicitly command the AI to use strict keys so the frontend split engine maps to the UI cards perfectly
    const systemPrompt = `You are the core diagnostic module of SKSK ProTech, an AI assistant built for mobile mechanics working in the field. Your job is to output a structured diagnostic breakdown.

CRITICAL: You must use the exact bold headers specified below so the mobile app can parse your lines into visual UI display cards. Do not omit any section.

Vehicle Profile:
- Year/Make/Model: ${vehicle.year || 'Unknown'} ${vehicle.make || 'Unknown'} ${vehicle.model || 'Unknown'}
- Trim: ${vehicle.trim || 'N/A'}
- Odometer: ${mileage ? mileage.toLocaleString() : 'Unknown'} miles

Grounded Mechanic Brain Matches:
${topMatchesText}

REQUIRED OUTPUT FORMAT STRUCTURE:
Primary Cause: [Put the absolute main fault component or system match here on a single line]
Est. repair time: [Put just the estimated time range here, e.g., 1.5 - 3.0 hours]
Diagnostic Breakdown:
[Provide a direct, concise bulleted list of root causes, field verification test steps, and severe hot-spots ideal for mobile screens here]`;

    const userPrompt = `Analyze this vehicle data and provide a diagnostic breakthrough:
- Logged OBD-II Codes: ${obdCodes.length > 0 ? obdCodes.join(', ') : 'None'}
- Customer Complaint: "${customerStates.join(', ') || 'None'}"
- Field Mechanic Observations: "${mechanicNotices.join(', ') || 'None'}"`;

    console.log('[Route] Calling Groq with structured diagnostic layout rules...');

    // 3. Dispatch to Groq LLM service
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
