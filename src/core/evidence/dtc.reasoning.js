'use strict';

const { normalizeDtcCode } = require('./dtc.provenance');

// Deterministic meanings are deliberately bounded. Unknown codes stay unknown;
// they are never guessed from nearby numbers or model knowledge.
const DTC_ASSERTIONS = Object.freeze({
  P0113: Object.freeze({
    system: 'ENGINE_CONTROLS',
    circuit: 'IAT',
    assertion: 'Intake air temperature sensor 1 circuit high input',
    signal: 'HIGH_INPUT',
    scope: 'SENSOR_1',
    bank: null
  }),
  P0171: Object.freeze({
    system: 'FUEL_TRIM',
    circuit: 'SYSTEM_LEAN',
    assertion: 'System too lean',
    signal: 'LEAN',
    scope: 'BANK_1',
    bank: 1
  }),
  P0174: Object.freeze({
    system: 'FUEL_TRIM',
    circuit: 'SYSTEM_LEAN',
    assertion: 'System too lean',
    signal: 'LEAN',
    scope: 'BANK_2',
    bank: 2
  })
});

function interpretDtc(code) {
  const normalized = normalizeDtcCode(code);
  if (!normalized) return null;
  const known = DTC_ASSERTIONS[normalized];
  return {
    code: normalized,
    known: !!known,
    ...(known || {
      system: 'UNKNOWN',
      circuit: 'UNKNOWN',
      assertion: 'No deterministic interpretation is registered for this code.',
      signal: 'UNKNOWN',
      scope: 'UNKNOWN',
      bank: null
    })
  };
}

function clusterKey(item) {
  if (item.system === 'FUEL_TRIM') return 'FUEL_TRIM';
  if (item.system === 'ENGINE_CONTROLS' && item.circuit === 'IAT') return 'AIR_TEMPERATURE_INPUT';
  return item.system === 'UNKNOWN' ? `UNMAPPED:${item.code}` : item.system;
}

function buildDtcReasoning(codes = []) {
  const interpretations = [...new Set((Array.isArray(codes) ? codes : []).map(normalizeDtcCode).filter(Boolean))]
    .map(interpretDtc);

  const groups = new Map();
  for (const item of interpretations) {
    const key = clusterKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const clusters = [...groups.entries()].map(([id, members]) => ({
    id,
    codes: members.map(member => member.code),
    systems: [...new Set(members.map(member => member.system))],
    bankScope: [...new Set(members.map(member => member.bank).filter(Number.isInteger))],
    commonCauseStatus: members.length > 1 ? 'EVALUATE_SHARED_CAUSE' : 'NO_SHARED_CAUSE_INFERRED'
  }));

  const discriminatingTests = [];
  const byCode = new Map(interpretations.map(item => [item.code, item]));

  if (byCode.has('P0113')) {
    discriminatingTests.push('Verify IAT sensor 1 live data against ambient temperature, then inspect its reference, signal, connector, and open-circuit path before attributing the code to another bank or sensor.');
  }
  if (byCode.has('P0171') && byCode.has('P0174')) {
    discriminatingTests.push('Compare Bank 1 and Bank 2 fuel trims at idle and elevated RPM; a similar lean shift on both banks supports testing shared air/fuel inputs before bank-specific faults.');
  } else if (byCode.has('P0171') || byCode.has('P0174')) {
    discriminatingTests.push('Compare both banks fuel trims before deciding whether the lean condition is bank-specific or caused by a shared air/fuel input.');
  }

  const commonCauseCandidates = [];
  if (byCode.has('P0171') && byCode.has('P0174')) {
    commonCauseCandidates.push({
      status: 'HYPOTHESIS_ONLY',
      codes: ['P0171', 'P0174'],
      rationale: 'Both banks report lean; test shared air metering, unmetered air, fuel delivery, and biased shared inputs before isolating a bank-specific cause.'
    });
  }
  if (byCode.has('P0113') && (byCode.has('P0171') || byCode.has('P0174'))) {
    commonCauseCandidates.push({
      status: 'HYPOTHESIS_ONLY',
      codes: ['P0113', ...['P0171', 'P0174'].filter(code => byCode.has(code))],
      rationale: 'IAT input and lean codes may interact through load/air calculations, but coexistence alone does not prove one common fault. Verify the IAT circuit and fuel trims independently before synthesis.'
    });
  }

  return {
    policy: 'DETERMINISTIC_INTERPRET_THEN_CLUSTER',
    interpretations,
    clusters,
    commonCauseCandidates,
    discriminatingTests
  };
}

module.exports = { DTC_ASSERTIONS, interpretDtc, buildDtcReasoning };
