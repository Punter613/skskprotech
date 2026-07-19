const express = require('express');
const router = express.Router();

// High-octane route to generate a factory-grounded step-by-step repair guide
router.post('/guide', async (req, res) => {
  const { vehicle, job, scrapedItems } = req.body;

  if (!vehicle || !job) {
    return res.status(400).json({ success: false, error: "Missing vehicle info or target job." });
  }

  // 1. Filter the scraped links to find sections relevant to the job
  const relevantManuals = (scrapedItems || [])
    .filter(item => {
      const titleLower = item.title.toLowerCase();
      const jobLower = job.toLowerCase();
      // Match keywords (e.g., "oil pump" or "brakes") to flag real factory pages
      return jobLower.split(' ').some(word => word.length > 3 && titleLower.includes(word));
    })
    .slice(0, 3); // Grab up to 3 closest document matches

  // 2. Build the context injection for Groq
  let factoryContext = "";
  if (relevantManuals.length > 0) {
    factoryContext = relevantManuals.map(m => `Manual Section: ${m.title}\nSource Link: ${m.url}`).join('\n\n');
  } else {
    factoryContext = "No specific manual page matched perfectly. Fall back to standard factory specs for this engine footprint.";
  }

  // 3. Draft the system guidelines for the AI shop foreman
  const systemPrompt = `You are an elite, blue-collar master field mechanic and shop foreman for SKSK ProTech.
Your job is to provide clear, bulletproof, step-by-step repair guides for field mechanics using small screens in tight spots.

Rules for your output:
1. Be direct, authoritative, and practical. Speak like a veteran mechanic.
2. Structure your answer strictly with these sections:
   - REQUIRED TOOLS: What wrenches, sockets, or special pullers are required.
   - SAFETY & PREPARATION: Critical warnings (hot fluids, battery disconnects).
   - STEP-BY-STEP REPAIR: Clear, sequentially ordered instructions.
   - TORQUE SPECS & FLUIDS: Exact numbers if known for this setup.
3. If factory manual references are provided, mention them explicitly so the user can trust the source.
4. Use Markdown formatting (bolding, lists) to make it highly scannable on mobile phones.`;

  const userPrompt = `Vehicle: ${vehicle}
Repair Job Needed: ${job}

--- FACTORY MANUAL CONTEXT ---
${factoryContext}
------------------------------

Generate the step-by-step field guide now. Make sure to reference the specific manual sections provided above where applicable.`;

  try {
    // 4. Fire the payload over to Groq
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192', // Blazing fast model perfect for quick field diagnostics
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3 // Kept ultra-low to prevent hallucinations and nail torque specs
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Groq connection failed');
    }

    const guideMarkdown = data.choices[0].message.content;

    res.json({
      success: true,
      vehicle,
      job,
      sourcesUsed: relevantManuals,
      guide: guideMarkdown
    });

  } catch (error) {
    console.error('[Groq Wire Error]:', error);
    res.status(500).json({ success: false, error: 'Failed to assemble the repair guide.' });
  }
});

module.exports = router;
