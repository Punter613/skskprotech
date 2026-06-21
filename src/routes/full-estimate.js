const express = require('express');
const router = express.Router();
const { scrapeLEMONManuals } = require('../services/lemon');
const { groqChat } = require('../services/groq');

// ─── UTILS ───

// Safely decodes VIN via NHTSA
async function decodeVinNhtsa(vin) {
  try {
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?format=json`);
    if (!res.ok) return null;
    
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
  } catch (err) {
    console.error('[VIN Decode Fetch Error]:', err.message);
    return null; 
  }
}

// Generates structural 3-Tier links using pricing calculated deterministically by the AI
function buildCommercialMatrix(make, basePartPrice) {
  const base = Number(basePartPrice) || 50.00;
  return [
    {
      tier: "Economy",
      brand: "Duralast / Everyday Aftermarket",
      price: parseFloat((base * 0.85).toFixed(2)),
      source: "Retail Center",
      availability: "In Stock (Local Store)",
      link: "https://www.autozone.com",
      eta: "Immediate Pick-up"
    },
    {
      tier: "OEM / Factory Spec",
      brand: `${make} Genuine Certified`,
      price: parseFloat((base * 1.40).toFixed(2)),
      source: "eBay Motors",
      availability: "Low Inventory",
      link: "https://www.ebay.com/b/Auto-Parts-Accessories/6028/bn_1853100",
      eta: "2-Day Express Shipping"
    },
    {
      tier: "Premium Performance",
      brand: "Brembo / Bosch SevereDuty",
      price: parseFloat((base * 1.95).toFixed(2)),
      source: "Commercial Supply",
      availability: "In Stock (Regional Hub)",
      link: "https://www.napaauto.com",
      eta: "Same-Day Delivery"
    }
  ];
}

// ─── UNIFIED ENGINE ENDPOINT ───
router.post('/', async (req, res) => {
  const startTime = Date.now();
  const {
    vin,
    customerStates = [],
    mechanicNotices = [],
    obdCodes = [],
    laborRate = 65,
    partType = '',
    mileage = 0
  } = req.body;

  if (!vin || vin.length !== 17) {
    return res.status(400).json({ success: false, error: 'Valid 17-character VIN required' });
  }

  const laborRateNum = Math.max(0, Number(laborRate));
  const logs = [];

  try {
    // STEP 1: FEDERAL VIN DECODE
    logs.push('[1/3] Decoding VIN via NHTSA...');
    const vehicle = await decodeVinNhtsa(vin);
    if (!vehicle || !vehicle.make) {
      return res.status(404).json({ success: false, error: 'VIN decode failed' });
    }
    const vehicleStr = `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.engine}`.trim();
    logs.push(`[1/3] OK resolved to: ${vehicleStr}`);

    // STEP 2: FACTORY MANUAL SCRAPE
    logs.push('[2/3] Executing LEMON manuals crawler...');
    let tsbs = [];
    try {
      const scrapeResult = await scrapeLEMONManuals(vehicle);
      if (scrapeResult && scrapeResult.items) {
        tsbs = scrapeResult.items
          .filter(item => item.title && item.url)
          .map(item => ({ title: item.title, url: item.url }));
        logs.push(`[2/3] OK Indexed ${tsbs.length} manual records`);
      }
    } catch (err) {
      logs.push(`[2/3] WARN Crawler fallback active: ${err.message}`);
    }

    // STEP 3: UNIFIED TOKENS INSULATION ENGINE
    logs.push('[3/3] Committing Single-Shot Token Engine payload...');
    
    const manualContext = tsbs.length > 0
      ? tsbs.slice(0, 5).map(t => `Manual: ${t.title} -> Reference: ${t.url}`).join('\n')
      : 'No dynamic factory specs caught. Provide baseline standard procedures.';

    const systemPrompt = `You are the master automotive pipeline engine for SKSK ProTech. 
    You must process diagnostic vectors into a perfectly structured JSON output matching the exact schema requested.

    MANDATORY CRITICAL RULES:
    1. DIAGNOSTIC PARAMETER ISOLATION: Keep vehicle sub-systems completely separated. Do not mix electrical failures with mechanical friction systems.
    2. MATH ENFORCEMENT: "laborCost" must exactly equal "calculatedLaborHours" multiplied by ${laborRateNum}.
    3. Output raw JSON object strings ONLY. No markdown formatting, no text padding.`;

    const userPrompt = `Vehicle Profile: ${vehicleStr}
    OBD-II Codes: ${obdCodes.join(', ') || 'None'}
    Customer Complaint: ${customerStates.join(', ') || 'None'}
    Mechanic Observations: ${mechanicNotices.join(', ') || 'None'}
    Current Mileage: ${mileage.toLocaleString()}
    Target Component to Quote: "${partType || 'Diagnostic Scan Only'}"
    
    ${manualContext}`;

    // Injecting JSON Schema layout directly into Groq options parsing layout
    const schemaPayload = {
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "sksk_unified_pipeline",
          strict: true,
          schema: {
            type: "object",
            properties: {
              priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
              primaryDiagnosis: { type: "string" },
              calculatedLaborHours: { type: "number" },
              suggestedBasePartPrice: { type: "number" },
              isolatedSubSystems: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    system: { type: "string", enum: ["Electrical", "Brake_Friction", "Powertrain_Mechanical", "Suspension_Steering", "HVAC", "Body_Trim"] },
                    findings: { type: "string" }
                  },
                  required: ["system", "findings"],
                  additionalProperties: false
                }
              },
              shafferFieldGuide: {
                type: "object",
                properties: {
                  requiredToolSizes: { type: "array", items: { type: "string" } },
                  safetyProtocols: { type: "array", items: { type: "string" } },
                  torqueSpecifications: { type: "string" },
                  stepByStepInstructions: { type: "array", items: { type: "string" } }
                },
                required: ["requiredToolSizes", "safetyProtocols", "torqueSpecifications", "stepByStepInstructions"],
                additionalProperties: false
              }
            },
            required: ["priority", "primaryDiagnosis", "calculatedLaborHours", "suggestedBasePartPrice", "isolatedSubSystems", "shafferFieldGuide"],
            additionalProperties: false
          }
        }
      },
      max_tokens: 2000,
      temperature: 0.1
    };

    const groqRes = await groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], schemaPayload);

    const rawResponseText = groqRes?.choices?.[0]?.message?.content || '{}';
    const engineOutput = JSON.parse(rawResponseText);

    // Compute deterministic math on the server
    const totalLaborCost = parseFloat((engineOutput.calculatedLaborHours * laborRateNum).toFixed(2));
    const dynamicBasePartsCost = engineOutput.suggestedBasePartPrice || 45.00;

    // Compile parts matrix tiers on demand
    const dynamicPartsMatrix = buildCommercialMatrix(vehicle.make, dynamicBasePartsCost);
    const selectedTierCost = dynamicPartsMatrix[1].price;

    const pipelineDuration = Date.now() - startTime;
    logs.push(`[3/3] OK Complete pipeline executed in ${pipelineDuration}ms`);

    // FINAL UNIFIED PAYLOAD PACKAGING
    res.json({
      success: true,
      duration_ms: pipelineDuration,
      vehicle,
      vin,
      tsbs: tsbs.slice(0, 15),
      estimate: {
        priority: engineOutput.priority,
        diagnosis: engineOutput.primaryDiagnosis,
        estimatedHours: engineOutput.calculatedLaborHours,
        laborCost: totalLaborCost,
        partsCost: selectedTierCost,
        total: parseFloat((totalLaborCost + selectedTierCost).toFixed(2)),
        isolatedSubSystems: engineOutput.isolatedSubSystems
      },
      parts: dynamicPartsMatrix,
      shafferFieldGuide: engineOutput.shafferFieldGuide,
      meta: {
        labor_rate: laborRateNum,
        mileage,
        pipeline_logs: logs
      }
    });

  } catch (err) {
    console.error('[Engine Pipeline Fatal Collapse]:', err);
    res.status(500).json({
      success: false,
      error: 'SKSK Core Pipeline Engine Exception Raised',
      details: err.message,
      pipeline_logs: logs
    });
  }
});

module.exports = router;
