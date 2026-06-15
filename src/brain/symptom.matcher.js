const { TSB_SYMPTOM_PATTERNS } = require('./symptom.mapping');

function normalizeText(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s\/]/g, "")
    .trim();
}

function matchSymptoms(inputData) {
  const { obdCodes = [], customerStates = [], mechanicNotices = [] } = inputData;
  const combinedTexts = [...customerStates, ...mechanicNotices].map(normalizeText);
  const cleanCodes = obdCodes.map(code => code.toUpperCase().trim());
  const candidates = [];

  for (const pattern of TSB_SYMPTOM_PATTERNS) {
    let matchFound = false;
    let matchReason = [];
    let matchedCodes = [];
    let matchedSymptoms = [];

    if (pattern.dtcs && pattern.dtcs.length > 0) {
      for (const code of cleanCodes) {
        if (pattern.dtcs.includes(code)) {
          matchFound = true;
          matchedCodes.push(code);
          matchReason.push(`Hard DTC match: ${code}`);
        }
      }
    }

    if (pattern.symptoms && pattern.symptoms.length > 0) {
      for (const symptom of pattern.symptoms) {
        const normalizedSymptom = normalizeText(symptom);
        for (const textInput of combinedTexts) {
          if (textInput.includes(normalizedSymptom) || normalizedSymptom.includes(textInput)) {
            matchFound = true;
            if (!matchedSymptoms.includes(symptom)) {
              matchedSymptoms.push(symptom);
              matchReason.push(`Symptom match: "${symptom}"`);
            }
          }
        }
      }
    }

    if (matchFound) {
      candidates.push({
        patternId: pattern.id,
        system: pattern.system,
        title: pattern.title,
        baseWeight: pattern.baseWeight,
        possibleIssues: [...pattern.possibleIssues],
        matchedCodes,
        matchedSymptoms,
        reasons: matchReason
      });
    }
  }

  return candidates;
}

module.exports = { matchSymptoms };
