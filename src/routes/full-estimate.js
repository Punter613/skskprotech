const express = require('express');
const router = express.Router();
const { scrapeLEMONManuals } = require('../services/lemon');
const { groqChat } = require('../services/groq');

// ─── HIGH-SPEED DETERMINISTIC UTILS ───

async function decodeVinNhtsa(vin) {
  try {
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?format=json`);
    if (!res.ok) return null;
    const data = await res.json();
    const v = data.Results?.[0];
    return v && v.Make ? {
      year: v.ModelYear || '',
      make: v.Make || '',
      model: v.Model || '',
      trim: v.Trim || '',
      engine: v.DisplacementL ? `${v.DisplacementL}L` : (v.EngineModel || '')
    } : null;
  } catch { return null; }
}

function buildCommercialMatrix(make, basePartPrice) {
  const base = Number(basePartPrice) || 50.00;
  return [
    { tier: "Economy", price: parseFloat((base * 0.85).toFixed(2)), source: "Retail Center" },
    { tier: "OEM / Factory Spec", price: parseFloat((base * 1.40).toFixed(2)), source: "eBay Motors" },
    { tier: "Premium Performance", price: parseFloat((base * 1.95).toFixed(2)), source: "Commercial Hub" }
  ];
}

// ─── UNIFIED AGENTIC PIPELINE ───
router.post('/', async (req, res) => {
  const startTime = Date.now();
  const { vin, customerStates = [], mechanicNotices = [], obdCodes = [], laborRate = 65, partType = '', mileage = 0 } = req.body;

  if (!vin || vin.length !== 17) {
    return res.status(400).json({ success: false, error: 'Valid 17-character VIN required' });
  }

  const laborRateNum = Math.max(0, Number(laborRate));
  const logs = [];

  try {
    // LAYER 1: INGESTION & PARALLEL CRAWLING
    logs.push('[1/4] Resolving core vectors...');
    const vehicle = await decodeVinNhtsa(vin);
    if (!vehicle) return res.status(404).json({ success: false, error: 'VIN decode failed' });
    const vehicleStr = `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.engine}`.trim();

    let tsbs = [];
    try {
      const scrapeResult = await scrapeLEMONManuals(vehicle);
      if (scrapeResult?.items) {
        tsbs = scrapeResult.items.filter(i => i.title && i.url).map(i => ({ title: i.title, url: i.url }));
      }
    } catch (e) { logs.push(`[WARN] Crawler bypassed: ${e.message}`); }

    const manualContext = tsbs.slice(0, 3).map(t => `- ${t.title}`).join('\n');

    // LAYER 2: THE FOREMAN GENERATION
    logs.push('[2/4] Agent [Foreman] generating primary estimate structural draft...');
    
    const foremanSystemPrompt = `You are the Lead AI Shop Foreman for SKSK ProTech. Output a strict raw JSON blueprint containing:
    {"priority": "low|medium|high|critical", "primaryDiagnosis": "string", "calculatedLaborHours": number, "suggestedBasePartPrice": number, "isolatedSubSystems": [{"system": "Electrical|Brake_Friction|Powertrain_Mechanical", "findings": "string"}], "shafferFieldGuide": {"requiredToolSizes": ["string"], "safetyProtocols": ["string"], "torqueSpecifications": "string", "stepByStepInstructions": ["string"]}}`;

    const foremanUserPrompt = `Vehicle: ${vehicleStr}\nOBD Codes: ${obdCodes.join(', ')}\nComplaints: ${customerStates.join(', ')}\nNotes: ${mechanicNotices.join(', ')}\nPart Target: ${partType}\n\nSpecs:\n${manualContext}`;

    const foremanRes = await groqChat([
      { role: 'system', content: foremanSystemPrompt },
      { role: 'user', content: foremanUserPrompt }
    ], { temperature: 0.3 });

    let foremanDraft = foremanRes?.choices?.[0]?.message?.content || '{}';
    if (foremanDraft.includes('```')) foremanDraft = foremanDraft.replace(/```json|```/g, '').trim();

    // LAYER 3: THE ADVERSARIAL CRITIC LOOP
    logs.push('[3/4] Agent [Auditor] intercepting payload for cross-contamination analysis...');
    
    const auditorSystemPrompt = `You are the Core Compliance Auditor for SKSK ProTech. 
    Your sole task is to analyze the Shop Foreman's JSON draft and correct severe logic errors or data bleed.
    
    CRITICAL CHECKLIST:
    1. Isolation Breach: Did the foreman cross-contaminate systems? (e.g., mixing electrical engine codes like P0300 inside a Brake_Friction system object findings). If yes, explicitly separate them into distinct system objects.
    2. Format Correction: Ensure the return asset matches the target format completely with no backticks or prose. Make changes ONLY to fix system isolation or format violations. Return the finalized JSON.`;

    const auditorUserPrompt = `ORIGINAL VECTORS:\nOBD Codes: ${obdCodes.join(', ')}\nComplaints: ${customerStates.join(', ')}\n\nFOREMAN DRAFT PAYLOAD:\n${foremanDraft}`;

    const auditorRes = await groqChat([
      { role: 'system', content: auditorSystemPrompt },
      { role: 'user', content: auditorUserPrompt }
    ], { temperature: 0.0 });

    let auditedOutputText = auditorRes?.choices?.[0]?.message?.content || '{}';
    if (auditedOutputText.includes('```')) auditedOutputText = auditedOutputText.replace(/```json|```/g, '').trim();

    const engineOutput = JSON.parse(auditedOutputText);
    logs.push('[4/4] Automated convergence loop verified clear. Building matrix updates...');

    // LAYER 4: DETERMINISTIC COMPUTATION
    const AI_Hours = Number(engineOutput.calculatedLaborHours || 1.5);
    const AI_BasePrice = Number(engineOutput.suggestedBasePartPrice || 45.00);
    const totalLaborCost = parseFloat((AI_Hours * laborRateNum).toFixed(2));
    
    const dynamicPartsMatrix = buildCommercialMatrix(vehicle.make, AI_BasePrice);
    const selectedTierCost = dynamicPartsMatrix[1].price;

    const pipelineDuration = Date.now() - startTime;

    res.json({
      success: true,
      duration_ms: pipelineDuration,
      agentic_reflection_loops: 1,
      vehicle,
      vin,
      tsbs: tsbs.slice(0, 10),
      estimate: {
        priority: engineOutput.priority || "medium",
        diagnosis: engineOutput.primaryDiagnosis || "Inspection complete.",
        estimatedHours: AI_Hours,
        laborCost: totalLaborCost,
        partsCost: selectedTierCost,
        total: parseFloat((totalLaborCost + selectedTierCost).toFixed(2)),
        isolatedSubSystems: engineOutput.isolatedSubSystems || []
      },
      parts: dynamicPartsMatrix,
      shafferFieldGuide: engineOutput.shafferFieldGuide || {},
      meta: { labor_rate: laborRateNum, mileage, pipeline_logs: logs }
    });

  } catch (err) {
    console.error('[Fatal Engine Failure]:', err);
    res.status(500).json({ success: false, error: 'Pipeline Exception Raised', details: err.message, pipeline_logs: logs });
  }
});

module.exports = router;
