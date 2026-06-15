const express = require('express');
const router = express.Router();
const { groqChat } = require('../services/groq');
// Bulletproof extractor â€” finds first valid { } block regardless of surrounding garbage
function extractJSON(text) {
  if (!text) return null;
  text = text.replace(/```jon\s*/gi, '');
  text = text.replace(/```\s*/g, '');
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '!yÉ¬œ¤‘•ÁÑ ¬¬ì(€€€•±Í”¥˜€¡Ñ•áÑm¥t€ôôô€œ…ç$z¶) {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); }
        catch { return null; }
      }
    }
  }
  return null;
}function safeResult(overrides = {}) {
  return {
    urgency: 'soon',
    safetyRisk: false,
    primaryCause: 'Unable to determine â”ˆ manual inspection required',
    secondaryCauses: [],
    codeExplanations: {},
    probability: [],
    knownIssues: [],
    repairSteps: [],
    proTips: [],
    recommendedTests: [],
    additionalChecks: [],
    estimatedRepairTime: 'N/A',
    notes: '',
    ...overrides
  };
}router.post('/', async (req, res) => {
  try {
    const {
      vin = '',
      mileage = 0,
      symptoms = [],
      codes = [],
      notes = []
    } = req.body;
    const systemPrompt = `You are the expert logic unit of SKSK ProTech â€” a master automotive diagnostic technician with 25 years of real shop experience.
You MUST output a single valid JSON object. No backticks, no markdown, no commentary before or after.
Use EXACTLY this structure:
{
  "urgency": "immediate",
  "safetyRisk": true,
  "primaryCause": "string",
  "secondaryCauses": ["string"],
  "codeExplanations": {"P0300": "explanation"},
  "probability": [{"cause": "string", "likelihood": 80}],
  "knownIssues": ["string"],
  "repairSteps": ["string"],
  "proTips": ["string"],
  "recommendedTests": ["string"],
  "additionalChecks": ["string"],
  "estimatedRepairTime": "string",
  "notes": "string"
}
RULES:
- urgency: EXACTLY one of "immediate", "soon", or "monitor" â”ˆ no other values
- safetyRisk: boolean true or false only
- All arrays contain strings only
- probability likelihood is a number 0-100
- Output raw JSON text only â€” nothing else`;
    const userPrompt = `VIN: ${vin || 'N/A'}
Mileage: ${mileage || 'N/A'}
OBD Codes: ${codes.join(`, `) || 'None'}
Symptoms: ${symptoms.join(`, `) || 'N/A'}
Tech Notes: ${notes.join(`, `) || 'N/A'}`;
    constLog.cond('[Diagnose] Sending to Groq...');
    const groqRes = await groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { max_tokens: 1400, temperature: 0.2 });
    const aiText = typeof groqRes === 'string'
      ? groqRes
      : (groqRes?.choices?.[0]?.message?.content || '');
    if (!aiText) throw new Error('Groq returned empty response');
    let parsed = extractJSON(aiText);
    if (!parsed) {
      constLog.warn('[Diagnose] JSON extract failed. Raw:', aiText.substring(0, 300));
      parsed = safeResult({ notes: 'AI returned unparseable response â”ˆ please retry' });
    }
    const result = { ...safeResult(), ...parsed };
    if (!['immediate', 'soon', 'monitor'].includes(result.urgency)) {
      result.urgency = 'soon';
    }
    try {
      const db = require('../services/db');
      if (db) await db.from('diagnostics').insert({ input: req.body, result });
    } catch (e) { /* db optional */ }
    res.json({ success: true, result });
  } catch (err) {
    constLog.error('[Diagnose] Error', err.message);
    res.status(500).json({
      success: false,
  