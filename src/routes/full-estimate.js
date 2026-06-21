const express = require('express');
const router = express.Router();
const { scrapeLEMONManuals } = require('../services/lemon');
const { groqChat } = require('../services/groq');

// ─── UTILS ───

function extractJSON(text) {
  if (!text) return null;
  // Remove markdown code blocks safely
  let clean = text;
  clean = clean.replace(/```json/gi, '');
  clean = clean.replace(/
```/g, '');
  clean = clean.trim();
  
  const start = clean.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < clean.length; i++) {
    if (clean[i] === '{') depth++;
    else if (clean[i] === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(clean.slice(start, i + 1)); }
        catch { return null; }
      }
    }
  }
  return null;
}

function safeEstimate(laborRate, partsCost, overrides = {}) {
  return {
    priority: 'medium',
    diagnosis: 'Manual inspection required',
    estimatedHours: 1,
    laborCost: laborRate,
    partsCost: partsCost,
    total: laborRate + partsCost,
    repairs: ['Diagnostic inspection required'],
    probability: [],
    knownIssues: [],
    repairSteps: [],
    proTips: [],
    additionalChecks: [],
    notes: '',
    ...overrides
  };
}

// Decode VIN directly via NHTSA (no localhost self-call)
async function decodeVinNhtsa(vin) {
  const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?format=json`);
  const data = await res.json();
  const v = data.Results?.[0];
  if (!v || !v.Make) return null;
  return {
    year: v.ModelYear || '',
    make: v.Make || '',
    model: v.Model || '',
    trim: v.Trim || '',
    engine: v.DisplacementL ? `${v.DisplacementL}L` : (v.EngineModel || '')
  };
}

// Heuristic parts pricing (same logic as your parts.js)
function getPartsEstimate(year, make, model, partType) {
  let basePrice = 50.00;
  const target = (partType || '').toLowerCase();
  if (target.includes('pad')) basePrice = 35.00;
  else if (target.includes('rotor')) basePrice = 65.00;
  else if (target.includes('plug')) basePrice = 8.50;
  else if (target.includes('oil')) basePrice = 28.00;
  else if (target.includes('gasket')) basePrice = 22.00;
  else if (target.includes('filter')) basePrice = 15.00;
  else if (target.includes('belt')) basePrice = 35.00;
  else if (target.includes('hose')) basePrice = 25.00;
  else if (target.includes('bearing')) basePrice = 45.00;
  else if (target.includes('pump')) basePrice = 55.00;
  else if (target.includes('alternator')) basePrice = 85.00;
  else if (target.includes('starter')) basePrice = 75.00;

  return [
    {
      tier: "Economy",
      brand: "Duralast / Everyday Aftermarket",
      price: parseFloat((basePrice * 0.85).toFixed(2)),
      source: "Retail Center",
      availability: "In Stock (Local Store)",
      link: "https://www.autozone.com",
      eta: "Immediate Pick-up"
    },
    {
      tier: "OEM / Factory Spec",
      brand: `${make} Genuine Certified`,
      price: parseFloat((basePrice * 1.40).toFixed(2)),
      source: "eBay Motors",
      availability: "Low Inventory",
      link: "https://www.ebay.com/b/Auto-Parts-Accessories/6028/bn_1853100",
      eta: "2-Day Express Shipping"
    },
    {
      tier: "Premium Performance",
      brand: "Brembo / Bosch SevereDuty",
      price: parseFloat((basePrice * 1.95).toFixed(2)),
      source: "Commercial Supply",
      availability: "In Stock (Regional Hub)",
      link: "https://www.napaauto.com",
      eta: "Same-Day Delivery"
    }
  ];
}

// ─── MAIN ENDPOINT ───
router.post('/', async (req, res) => {
  const startTime = Date.now();
  const {
    vin,
    customerStates = [],
    mechanicNotices = [],
    obdCodes = [],
    laborRate = 65,
    partsCost = 0,
    partType = '',
    mileage = 0,
    customer = {}
  } = req.body;

  if (!vin || vin.length !== 17) {
    return res.status(400).json({ success: false, error: 'Valid 17-character VIN required' });
  }

  const laborRateNum = Math.max(0, Number(laborRate));
  const partsCostNum = Math.max(0, Number(partsCost));
  const logs = [];

  try {
    // STEP 1: VIN DECODE
    logs.push('[1/5] Decoding VIN...');
    const vehicle = await decodeVinNhtsa(vin);
    if (!vehicle || !vehicle.make) {
      return res.status(404).json({ success: false, error: 'VIN decode failed' });
    }
    logs.push(`[1/5] OK ${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.engine}`);

    // STEP 2: SCRAPE LEMON MANUALS
    logs.push('[2/5] Scraping LEMON manuals...');
    let scrapeResult = null;
    let tsbs = [];
    try {
      scrapeResult = await scrapeLEMONManuals(vehicle);
      if (scrapeResult && scrapeResult.items) {
        tsbs = scrapeResult.items
          .filter(item => item.title && item.url)
          .map(item => ({
            title: item.title,
            url: item.url,
            category: item.title.includes('Bulletin') ? 'TSB' :
                      item.title.includes('Diagnostic') ? 'Diagnostic' :
                      item.title.includes('Repair') ? 'Repair Procedure' : 'Manual'
          }));
        logs.push(`[2/5] OK Found ${tsbs.length} manual pages`);
      } else {
        logs.push('[2/5] WARN No manual pages found');
      }
    } catch (err) {
      logs.push(`[2/5] WARN Scraper failed: ${err.message}`);
    }

    // STEP 3: AI ESTIMATE
    logs.push('[3/5] Generating AI estimate...');
    const vehicleStr = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim, vehicle.engine]
      .filter(Boolean).join(' ');

    const manualsContext = tsbs.length > 0
      ? `\n\nRELEVANT FACTORY MANUAL SECTIONS:\n${tsbs.slice(0, 10).map(t => `- ${t.title} (${t.url})`).join('\n')}`
      : '';

    const systemPrompt = `You are the expert estimation module of SKSK ProTech - a master automotive mechanic with 25 years of real shop experience.

Output a single valid JSON object ONLY. No backticks, no markdown, no text before or after.
{
  "priority": "high",
  "diagnosis": "string",
  "estimatedHours": 2.5,
  "laborCost": 162.50,
  "partsCost": ${partsCostNum},
  "total": 162.50,
  "repairs": ["string"],
  "probability": [{"cause": "string", "likelihood": 80}],
  "knownIssues": ["string"],
  "repairSteps": ["string"],
  "proTips": ["string"],
  "additionalChecks": ["string"],
  "notes": "string"
}

RULES:
- priority: exactly "high", "medium", or "low"
- laborCost = estimatedHours x ${laborRateNum}
- total = laborCost + partsCost
- All array values must be strings
- Output raw JSON only
${manualsContext}`;

    const userPrompt = `Vehicle: ${vehicleStr}
VIN: ${vin}
Shop Rate: $${laborRateNum}/hr
OBD Codes: ${obdCodes.join(', ') || 'None'}
Customer Reports: ${customerStates.join(', ') || 'N/A'}
Mechanic Notices: ${mechanicNotices.join(', ') || 'N/A'}
Mileage: ${mileage.toLocaleString()}`;

    let estimate = null;
    try {
      const groqRes = await groqChat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], { max_tokens: 1400, temperature: 0.2 });

      const aiText = groqRes?.choices?.[0]?.message?.content || '';
      estimate = extractJSON(aiText);
      if (!estimate) throw new Error('JSON extraction failed');
      logs.push('[3/5] OK AI estimate generated');
    } catch (aiErr) {
      logs.push(`[3/5] WARN AI failed: ${aiErr.message} - using fallback`);
      estimate = safeEstimate(laborRateNum, partsCostNum, {
        notes: 'AI estimation unavailable - manual inspection required'
      });
    }

    // Normalize estimate math
    estimate.estimatedHours = estimate.estimatedHours || 1;
    estimate.laborCost = estimate.laborCost || (estimate.estimatedHours * laborRateNum);
    estimate.partsCost = estimate.partsCost || partsCostNum;
    estimate.total = estimate.total || (estimate.laborCost + estimate.partsCost);
    if (!['high', 'medium', 'low'].includes(estimate.priority)) {
      estimate.priority = 'medium';
    }

    // STEP 4: PARTS SEARCH
    logs.push('[4/5] Searching parts...');
    const parts = partType
      ? getPartsEstimate(vehicle.year, vehicle.make, vehicle.model, partType)
      : [];
    logs.push(`[4/5] OK ${parts.length} parts tiers found`);

    // STEP 5: REPAIR GUIDE
    logs.push('[5/5] Generating repair guide...');
    let guide = null;
    if (tsbs.length > 0 && estimate.repairs && estimate.repairs.length > 0) {
      try {
        const repairJob = estimate.repairs[0];
        const relevantManuals = tsbs.filter(t => {
          const tl = t.title.toLowerCase();
          return repairJob.toLowerCase().split(' ').some(w => w.length > 3 && tl.includes(w));
        }).slice(0, 3);

        const factoryContext = relevantManuals.length > 0
          ? relevantManuals.map(m => `Manual Section: ${m.title}\nSource: ${m.url}`).join('\n\n')
          : 'No specific manual page matched. Use standard factory specs.';

        const guidePrompt = `You are an elite master field mechanic for SKSK ProTech.

Vehicle: ${vehicleStr}
Repair Job: ${repairJob}

${factoryContext}

Generate a concise, mobile-friendly step-by-step repair guide with:
- REQUIRED TOOLS
- SAFETY & PREPARATION
- STEP-BY-STEP REPAIR
- TORQUE SPECS & FLUIDS

Use Markdown. Be direct and practical. Max 400 words.`;

        const guideRes = await groqChat([
          { role: 'system', content: 'You are a veteran mobile mechanic writing field repair guides for phone screens.' },
          { role: 'user', content: guidePrompt }
        ], { max_tokens: 1000, temperature: 0.3 });

        guide = guideRes?.choices?.[0]?.message?.content || null;
        logs.push('[5/5] OK Repair guide generated');
      } catch (guideErr) {
        logs.push(`[5/5] WARN Guide failed: ${guideErr.message}`);
      }
    } else {
      logs.push('[5/5] SKIP No TSBs or repairs to guide');
    }

    // ASSEMBLE RESPONSE
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      duration_ms: duration,
      vehicle,
      vin,
      tsbs: tsbs.slice(0, 20),
      tsb_count: tsbs.length,
      estimate: {
        ...estimate,
        laborCost: estimate.laborCost,
        total: estimate.total
      },
      parts,
      guide,
      meta: {
        labor_rate: laborRateNum,
        part_type_searched: partType || null,
        mileage,
        ai_used: estimate.diagnosis !== 'Manual inspection required',
        pipeline_logs: logs
      }
    });

  } catch (err) {
    console.error('[FullEstimate] Pipeline crash:', err);
    res.status(500).json({
      success: false,
      error: 'Full estimate pipeline failed',
      details: process.env.NODE_ENV === 'development' ? err.message : 'Internal error',
      pipeline_logs: logs
    });
  }
});

module.exports = router;
