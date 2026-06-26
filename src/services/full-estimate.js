const express = require('express');
const router = express.Router();

const { scrapeLEMONManuals } = require('../services/lemon');
const { groqChat } = require('../services/groq');
const { decodeVinNhtsa } = require('../services/vin');
const { extractJSON, uniqueStrings, clampNumber } = require('../services/estimateHelpers');
const { sanitizeEstimate, safeEstimate } = require('../services/estimateSanitizer');
const { findKnowledgeProcedure } = require('../services/procedure_lookup');
const { translateSymptom } = require('../services/translateSymptom');

function validateRequestBody(body) {
  const allowed = new Set([
    'vin',
    'customerStates',
    'mechanicNotices',
    'obdCodes',
    'laborRate',
    'partsCost',
    'partType',
    'mileage',
    'customer',
    'history'
  ]);

  if (!body || typeof body !== 'object') return 'Request body must be an object';

  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) {
      return `Unexpected field: ${key}`;
    }
  }

  // VIN Hardening: Must be 17 chars and alphanumeric
  if (!body.vin || String(body.vin).trim().length !== 17) return 'Valid 17-character VIN required';
  if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(body.vin)) return 'VIN contains invalid characters (I, O, Q are not allowed)';

  if (body.customerStates && !Array.isArray(body.customerStates)) return 'customerStates must be an array';
  if (body.mechanicNotices && !Array.isArray(body.mechanicNotices)) return 'mechanicNotices must be an array';
  if (body.obdCodes && !Array.isArray(body.obdCodes)) return 'obdCodes must be an array';
  if (body.history && !Array.isArray(body.history)) return 'history must be an array';

  // Deep array validation
  if (body.customerStates && body.customerStates.some(s => typeof s !== 'string')) return 'All customerStates must be strings';
  if (body.obdCodes && body.obdCodes.some(c => typeof c !== 'string')) return 'All obdCodes must be strings';

  return null;
}

function buildSystemPrompt(laborRate, partsCost, history, manualsContext) {
  const historyList = uniqueStrings(history);
  const historyStr = historyList.length > 0
    ? `FAILED REPAIR HISTORY:${historyList.map(h => `- ${h}`).join('')}CRITICAL RULE: Never suggest any item from FAILED REPAIR HISTORY. Assign 0% likelihood to those components and exclude them from diagnosis.`
    : '';

  return `You are a deterministic automotive diagnostic engine.

Rules:
- Never guess.
- Never include a component listed in FAILED REPAIR HISTORY.
- If data is insufficient, return a conservative fallback-style answer.
- Use only JSON.

Output shape:
{
  "priority": "high|medium|low",
  "diagnosis": "string",
  "estimatedHours": number,
  "laborCost": number,
  "partsCost": number,
  "total": number,
  "repairs": [string],
  "probability": [{"cause":"string","likelihood":number}],
  "knownIssues": [string],
  "repairSteps": [string],
  "proTips": [string],
  "additionalChecks": [string],
  "notes": "string",
  "deductiveReasoning": "string",
  "excludedComponents": [string],
  "recommendedInspection": [string]
}

Constraints:
- laborCost = estimatedHours * ${laborRate}
- total = laborCost + partsCost
- excludedComponents must list all failed repairs
- recommendedInspection must include specific measurements/tests
- If insufficient data, set priority to low and request measurements.

${manualsContext}${historyStr}`;
}

function getPartsEstimate(year, make, model, partType) {
  let basePrice = 50.0;
  const target = String(partType || '').toLowerCase();

  if (target.includes('pad')) basePrice = 35.0;
  else if (target.includes('rotor')) basePrice = 65.0;
  else if (target.includes('plug')) basePrice = 8.5;
  else if (target.includes('oil')) basePrice = 28.0;
  else if (target.includes('gasket')) basePrice = 22.0;
  else if (target.includes('filter')) basePrice = 15.0;
  else if (target.includes('belt')) basePrice = 35.0;
  else if (target.includes('hose')) basePrice = 25.0;
  else if (target.includes('bearing')) basePrice = 45.0;
  else if (target.includes('pump')) basePrice = 55.0;
  else if (target.includes('alternator')) basePrice = 85.0;
  else if (target.includes('starter')) basePrice = 75.0;
  else if (target.includes('axle')) basePrice = 120.0;
  else if (target.includes('joint')) basePrice = 65.0;
  else if (target.includes('arm')) basePrice = 85.0;
  else if (target.includes('converter')) basePrice = 450.0;
  else if (target.includes('gearbox')) basePrice = 350.0;
  else if (target.includes('transmission')) basePrice = 2800.0;

  return [
    {
      tier: 'Economy',
      brand: 'Duralast / Everyday Aftermarket',
      price: parseFloat((basePrice * 0.85).toFixed(2)),
      source: 'Retail Center',
      availability: 'In Stock (Local Store)',
      link: 'https://www.autozone.com',
      eta: 'Immediate Pick-up'
    },
    {
      tier: 'OEM / Factory Spec',
      brand: `${make} Genuine Certified`,
      price: parseFloat((basePrice * 1.4).toFixed(2)),
      source: 'eBay Motors',
      availability: 'Low Inventory',
      link: 'https://www.ebay.com/b/Auto-Parts-Accessories/6028/bn_1853100',
      eta: '2-Day Express Shipping'
    },
    {
      tier: 'Premium Performance',
      brand: 'Brembo / Bosch SevereDuty',
      price: parseFloat((basePrice * 1.95).toFixed(2)),
      source: 'Commercial Supply',
      availability: 'In Stock (Regional Hub)',
      link: 'https://www.napaauto.com',
      eta: 'Same-Day Delivery'
    }
  ];
}

router.post('/', async (req, res) => {
  console.log('FULL ESTIMATE BODY:', req.body);
  const startTime = Date.now();
  const validationError = validateRequestBody(req.body);

  if (validationError) {
    return res.status(400).json({
      success: false,
      error: validationError,
      deductiveReasoning: 'Request validation failed before diagnostic pipeline started'
    });
  }

  const {
    vin,
    customerStates = [],
    mechanicNotices = [],
    obdCodes = [],
    laborRate = 65,
    partsCost = 0,
    partType = '',
    mileage = 0,
    customer = {},
    history = []
  } = req.body;

  const laborRateNum = clampNumber(laborRate, 0);
  const partsCostNum = clampNumber(partsCost, 0);
  const cleanHistory = uniqueStrings(history);
  const logs = [];

  try {
    logs.push('[1/6] Decoding VIN...');
    const vehicle = await decodeVinNhtsa(vin);
    if (!vehicle || !vehicle.make) {
      return res.status(404).json({
        success: false,
        error: 'VIN decode failed - no factory records',
        deductiveReasoning: 'NHTSA database returned no match for this VIN'
      });
    }

    logs.push(`[1/6] OK ${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.engine}`);

    logs.push('[2/6] Scraping LEMON manuals...');
    let tsbs = [];
    try {
      const scrapeResult = await scrapeLEMONManuals(vehicle);
      if (scrapeResult?.items?.length) {
        tsbs = scrapeResult.items
          .filter(item => item?.title && item?.url)
          .map(item => ({
            title: item.title,
            url: item.url,
            category: item.title.includes('Bulletin') ? 'TSB'
              : item.title.includes('Diagnostic') ? 'Diagnostic'
              : item.title.includes('Repair') ? 'Repair Procedure'
              : 'Manual'
          }));
        logs.push(`[2/6] OK Found ${tsbs.length} manual pages`);
      } else {
        logs.push('[2/6] WARN No manual pages found');
      }
    } catch (err) {
      logs.push(`[2/6] WARN Scraper failed: ${err.message}`);
    }

    // STEP 3: AUTOMATIC SYMPTOM TRANSLATION
    logs.push('[3/6] Translating customer symptoms...');
    const rawCustomerStates = customerStates;
    let translatedCustomerStates = rawCustomerStates;
    let translationKeywords = [];

    try {
      const translatedResults = await Promise.all(
        rawCustomerStates
          .filter(s => typeof s === 'string' && s.trim().length > 0)
          .map(s => translateSymptom(s))
      );
      translatedCustomerStates = translatedResults.map(r => r.translated);
      translationKeywords = translatedResults.flatMap(r => r.keywords || []);
      logs.push(`[3/6] OK Translated ${translatedCustomerStates.length} symptom statement(s)`);
    } catch (translateErr) {
      logs.push(`[3/6] WARN Translation failed: ${translateErr.message} - using raw customer text`);
      translatedCustomerStates = rawCustomerStates;
    }

    logs.push('[4/6] Generating AI estimate...');
    const vehicleStr = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim, vehicle.engine]
      .filter(Boolean)
      .join(' ');

    const manualsContext = tsbs.length > 0
      ? `RELEVANT FACTORY MANUAL SECTIONS:${tsbs.slice(0, 10).map(t => `- ${t.title} (\n${t.url})`).join('')}`
      : '';

    const systemPrompt = buildSystemPrompt(laborRateNum, partsCostNum, cleanHistory, manualsContext);

    const userPrompt = `Vehicle: ${vehicleStr}
VIN: ${vin}
Shop Rate: $${laborRateNum}/hr
OBD Codes: ${obdCodes.join(', ') || 'None'}
Customer Reports: ${translatedCustomerStates.join(', ') || 'N/A'}
Mechanic Notices: ${mechanicNotices.join(', ') || 'N/A'}
Mileage: ${Number(mileage || 0).toLocaleString()}
${cleanHistory.length ? `Previously Replaced (Failed to Fix): ${cleanHistory.join(', ')}` : ''}`;

    let estimate;
    let aiUsed = true;

    try {
      const groqRes = await groqChat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        {
          max_tokens: 1800,
          temperature: 0.15,
          response_format: { type: 'json_object' }
        }
      );

      const aiText = groqRes?.choices?.[0]?.message?.content || '';
      const parsed = extractJSON(aiText);
      const sanitized = sanitizeEstimate(parsed, cleanHistory);

      if (!sanitized) throw new Error('AI output failed deterministic sanitization');
      estimate = sanitized;
      estimate.source = 'ai';

      logs.push('[4/6] OK AI estimate generated and sanitized');
    } catch (aiErr) {
      logs.push(`[4/6] WARN AI failed: ${aiErr.message}`);
      estimate = safeEstimate(laborRateNum, partsCostNum, {
        source: 'fallback',
        notes: 'AI estimation unavailable or rejected by deterministic gating',
        excludedComponents: cleanHistory,
        deductiveReasoning: 'AI parsing or sanitization failed; history items remain excluded; manual inspection required.'
      });
      aiUsed = false;
    }

    estimate.estimatedHours = Number(estimate.estimatedHours || 1);
    estimate.laborCost = Number.isFinite(Number(estimate.laborCost))
      ? Number(estimate.laborCost)
      : parseFloat((estimate.estimatedHours * laborRateNum).toFixed(2));
    estimate.partsCost = Number.isFinite(Number(estimate.partsCost)) ? Number(estimate.partsCost) : partsCostNum;
    estimate.total = Number.isFinite(Number(estimate.total))
      ? Number(estimate.total)
      : parseFloat((estimate.laborCost + estimate.partsCost).toFixed(2));

    logs.push('[5/6] Searching parts...');
    const parts = partType ? getPartsEstimate(vehicle.year, vehicle.make, vehicle.model, partType) : [];
    logs.push(`[5/6] OK ${parts.length} parts tiers found`);

    logs.push('[6/6] Generating repair guide...');
    let guide = null;

    if (estimate.repairs?.length > 0) {
      try {
        const repairJob = estimate.repairs[0];

        // KNOWLEDGE INJECTION: Check internal library first
        const internalProcedure = findKnowledgeProcedure(vehicle, repairJob);
        const internalContext = internalProcedure
          ? `KNOWLEDGE BASE OVERRIDE: Use this verified field protocol: ${JSON.stringify(internalProcedure)}`
          : '';

        const relevantManuals = tsbs.filter(t => {
          const tl = t.title.toLowerCase();
          return repairJob.toLowerCase().split(' ').some(w => w.length > 3 && tl.includes(w));
        }).slice(0, 3);

        const factoryContext = relevantManuals.length > 0
          ? relevantManuals.map(m => `Manual Section: ${m.title} Source: ${m.url}`).join('')
          : 'No specific manual page matched. Use standard factory specs.';

        const guidePrompt = `You are an elite master field mechanic.

Vehicle: ${vehicleStr}
Repair Job: ${repairJob}

${internalContext}
${factoryContext}

Generate a concise, mobile-friendly step-by-step repair guide with:
- REQUIRED TOOLS
- SAFETY & PREPARATION
- STEP-BY-STEP REPAIR
- TORQUE SPECS & FLUIDS

Use Markdown. Be direct and practical. Max 400 words.`;

        const guideRes = await groqChat(
          [
            { role: 'system', content: 'You are a veteran mobile mechanic writing field repair guides for phone screens.' },
            { role: 'user', content: guidePrompt }
          ],
          {
            max_tokens: 1000,
            temperature: 0.3
          }
        );

        guide = guideRes?.choices?.[0]?.message?.content || null;
        logs.push('[6/6] OK Repair guide generated');
      } catch (guideErr) {
        logs.push(`[6/6] WARN Guide failed: ${guideErr.message}`);
      }
    } else {
      logs.push('[6/6] SKIP No repairs to guide');
    }

    const duration = Date.now() - startTime;

    return res.json({
      success: true,
      duration_ms: duration,
      vehicle,
      vin,
      tsbs: tsbs.slice(0, 20),
      tsb_count: tsbs.length,
      estimate: {
        ...estimate,
        excludedComponents: cleanHistory,
        recommendedInspection: Array.isArray(estimate.recommendedInspection)
          ? estimate.recommendedInspection
          : ['Visual inspection', 'Component measurement']
      },
      parts,
      guide,
      meta: {
        labor_rate: laborRateNum,
        part_type_searched: partType || null,
        mileage: Number(mileage || 0),
        ai_used: aiUsed,
        history_injected: cleanHistory.length > 0,
        history_count: cleanHistory.length,
        raw_customer_states: rawCustomerStates,
        translated_customer_states: translatedCustomerStates,
        translation_keywords: translationKeywords,
        pipeline_logs: logs,
        customer
      }
    });
  } catch (err) {
    console.error('[FullEstimate] Pipeline crash:', err);
    return res.status(500).json({
      success: false,
      error: 'Full estimate pipeline failed',
      details: process.env.NODE_ENV === 'development' ? err.message : 'Internal error',
      deductiveReasoning: 'Pipeline exception - deterministic analysis aborted',
      excludedComponents: cleanHistory,
      pipeline_logs: logs
    });
  }
});

module.exports = router;
