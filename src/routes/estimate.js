const express = require('express');
const router = express.Router();
const { runDiagnosticPipeline } = require('../brain/diagnosis.engine');
const { groqChat } = require('../services/groq');

/**
 * POST /api/estimate
 * Generates an itemized AI parts and labor estimate grounded by local brain data.
 */
router.post('/', async (req, res) => {
  try {
    const {
      vehicle = {},
      obdCodes = [],
      customerStates = [],
      mechanicNotices = [],
      laborRate = 65,
      partsCost = 0,
      mileage = 0
    } = req.body;

    // 1. Run through the local pipeline to see what we are dealing with
    const pipelineResults = runDiagnosticPipeline({
      obdCodes,
      customerStates,
      mechanicNotices,
      vehicle,
      mileage
    });

    // 2. Extract top priority matches to help steer the pricing AI
    const primaryDiagnosis = pipelineResults.topDiagnoses[0];
    let rustBeltMultiplier = 1.0;

    // Detect if our Rust Belt adjustment was applied to modify base labor expectations
    if (primaryDiagnosis && primaryDiagnosis.appliedModifiers.some(m => m.includes('Rust Belt'))) {
      rustBeltMultiplier = 1.25; // Slap a 25% tax on labor for fighting seized/rotted hardware
    }

    const systemPrompt = `You are the expert financial estimation module of SKSK ProTech, built for mobile mechanics. Your job is to output a clean, professional, itemized price quote.

Vehicle Configuration:
- ${vehicle.year || 'Unknown'} ${vehicle.make || 'Unknown'} ${vehicle.model || 'Unknown'} (${vehicle.trim || 'Standard'})
- Odometer: ${mileage ? mileage.toLocaleString() : 'Unknown'} miles
- Shop Base Labor Rate: $${laborRate}/hr
- Rust Belt Labor Penalty Multiplier: ${rustBeltMultiplier}x (Apply if working on rotted underside/brakes/chassis)

Pre-Calculated Local Brain Diagnostics:
${primaryDiagnosis ? `- Target Issue: ${primaryDiagnosis.title} (${primaryDiagnosis.confidence} Confidence)\n- Component Subsystems: ${primaryDiagnosis.possibleIssues.join(', ')}` : '- No direct TSB pattern matched. Quote based on field notes and generic shop guides.'}

Guidelines:
1. Provide a completely itemized breakdown: Estimated Labor Hours, Total Labor Cost, Required Parts, and Estimated Parts Cost.
2. If the Rust Belt Multiplier is ${rustBeltMultiplier}x and the job involves suspension, brakes, or exhaust, explicitly mention the extra time added for rust mitigation (e.g., torching, extracting seized bolts).
3. Format the final summary using clear headers so it fits neatly on a mobile screen (Samsung A15) and can be parsed into a clean PDF invoice later.
4. Keep the final total mathematically sound: Total = (Labor Hours * Labor Rate) + Parts Cost + Tax (assume 6.5% local transit sales tax).`;

    const userPrompt = `Generate a realistic line-item job estimate based on these inputs:
- Initial Parts Budget Input: $${partsCost}
- Diagnostic Target: ${primaryDiagnosis ? primaryDiagnosis.title : 'General Inspection'}
- Mechanic's On-Site Field Notes: "${mechanicNotices.join(', ') || 'None'}"`;

    console.log('[Route] Calculating smart estimate via Groq...');
    
    const aiResponse = await groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    res.json({
      success: true,
      appliedRustPenalty: rustBeltMultiplier > 1.0,
      localBrainSummary: pipelineResults,
      estimate: aiResponse
    });

  } catch (err) {
    console.error('[Route Error] Estimation failed:', err.message || err);
    res.status(500).json({
      success: false,
      error: 'Failed to generate financial estimate package.'
    });
  }
});

module.exports = router;
