'use strict';

// The corpus adapter owns applicability. Bulletin fields and claimed issuers never grant trust.
const MAX_BOOST = 0.18;
const APPLICABILITY = Object.freeze({ APPLICABLE: 'APPLICABLE', UNKNOWN: 'UNKNOWN', CONTRADICTED: 'CONTRADICTED' });
const norm = v => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const year = v => Number.isInteger(Number(v)) && Number(v) > 1900 ? Number(v) : null;
const same = (a, b) => !!norm(a) && !!norm(b) && norm(a) === norm(b);

function explicitScope(ref, vehicle) {
  const scope = ref.applicability || ref;
  if (scope.make && vehicle.make && !same(scope.make, vehicle.make)) return APPLICABILITY.CONTRADICTED;
  if (scope.model && vehicle.model && !same(scope.model, vehicle.model)) return APPLICABILITY.CONTRADICTED;
  if (scope.year != null && year(scope.year) && year(vehicle.year) && year(scope.year) !== year(vehicle.year)) return APPLICABILITY.CONTRADICTED;
  for (const key of ['engine', 'transmission', 'drivetrain', 'vin', 'productionDate']) {
    if (scope[key] && vehicle[key] && !same(scope[key], vehicle[key])) return APPLICABILITY.CONTRADICTED;
  }
  return APPLICABILITY.UNKNOWN;
}

function trustedCorpusReference(reference, vehicle) {
  // Only call after the adapter itself has selected an authenticated YMM-scoped corpus row.
  // No caller-supplied issuer, stamp, or sourceAuthority is consulted.
  if (!year(vehicle?.year) || !norm(vehicle?.make) || !norm(vehicle?.model)) return null;
  const ref = JSON.parse(JSON.stringify(reference));
  if (explicitScope(ref, vehicle) === APPLICABILITY.CONTRADICTED) return null;
  for (const key of ['engine', 'transmission', 'drivetrain', 'vin', 'productionDate']) {
    const value = ref.applicability?.[key] ?? ref[key];
    if (value && !vehicle[key]) return null;
  }
  function deepFreeze(value) {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) deepFreeze(child);
      Object.freeze(value);
    }
    return value;
  }
  return Object.freeze({ reference: deepFreeze(ref), vehicle: Object.freeze({
    year: year(vehicle.year), make: norm(vehicle.make), model: norm(vehicle.model)
  }) });
}

function scoreTsbForCandidate(ref, candidate, vehicle) {
  if (!ref || !trustedSet.has(ref) || !candidate || !vehicle) return { raw: 0, applicability: APPLICABILITY.UNKNOWN, hits: [] };
  const scoped = ref.reference && ref.vehicle;
  // Trusted wrappers must originate from the corpus adapter; public input cannot confer trust.
  // The caller must provide wrappers separately via the trustedReferences parameter.
  if (!scoped) return { raw: 0, applicability: explicitScope(ref, vehicle), hits: [] };
  if (explicitScope(ref.reference, vehicle) === APPLICABILITY.CONTRADICTED ||
      year(ref.vehicle.year) !== year(vehicle.year) ||
      !same(ref.vehicle.make, vehicle.make) || !same(ref.vehicle.model, vehicle.model)) {
    return { raw: 0, applicability: APPLICABILITY.CONTRADICTED, hits: [] };
  }
  const item = ref.reference;
  const body = norm([item.subject, item.title, item.snippet, item.bodyText, item.groupName].filter(Boolean).join(' '));
  if (!body) return { raw: 0, applicability: APPLICABILITY.APPLICABLE, hits: [] };
  if (Number.isFinite(item.relevanceScore) && item.relevanceScore < 1) return { raw: 0, applicability: APPLICABILITY.APPLICABLE, hits: [] };
  const hits = [];
  let raw = 0;
  for (const code of candidate.obdCodes || []) {
    if (new RegExp('(?:^| )' + norm(code).replace(/ /g, ' ') + '(?: |$)').test(body)) { raw += 0.6; hits.push('DTC:' + code); break; }
  }
  if (candidate.system && body.includes(norm(candidate.system))) { raw += 0.3; hits.push('SYSTEM'); }
  if ((candidate.possibleIssues || []).some(issue => norm(issue).split(' ').filter(x => x.length > 3).some(x => body.split(' ').includes(x)))) {
    raw += 0.3; hits.push('ISSUE');
  }
  return { raw: Math.min(1, raw), applicability: APPLICABILITY.APPLICABLE, hits };
}

function applyTsbWeights(candidates, vehicle, trustedReferences = [], options = {}) {
  if (!Array.isArray(candidates)) return [];
  const output = candidates.map(candidate => {
    const strongest = new Map();
    for (const ref of trustedReferences) {
      // Identity membership in this invocation is established by adapter-scoped closure below.
      if (!trustedSet.has(ref)) continue;
      const score = scoreTsbForCandidate(ref, candidate, vehicle);
      if (score.raw < 0.15) continue;
      const item = ref.reference;
      const id = norm(item.findingGroupId || item.bulletinNumber || item.bulletinId || item.subject || item.title);
      if (!id) continue;
      const old = strongest.get(id);
      if (!old || score.raw > old.raw) strongest.set(id, { ...score, id, bulletinNumber: item.bulletinNumber || item.bulletinId || null, title: item.title || item.subject || null, source: item.source || item.sourceAuthority || 'NHTSA_BULK' });
    }
    const values = [...strongest.values()].sort((a, b) => b.raw - a.raw || a.id.localeCompare(b.id));
    const boost = Math.round(MAX_BOOST * (1 - values.reduce((p, v) => p * (1 - v.raw), 1)) * 10000) / 10000;
    const base = Number(candidate.rawScore ?? candidate.baseWeight ?? 0);
    return { ...candidate, tsbTier: 'SUPPORTS', tsbBoost: boost, tsbRankScore: Math.round((Number.isFinite(base) ? base : 0) * 10000 + boost * 10000) / 10000, tsbRefs: values.slice(0, 5) };
  });
  return options.sortByRankScore ? output.sort((a, b) => b.tsbRankScore - a.tsbRankScore) : output;
}

// A WeakSet prevents forged plain-object wrappers from becoming trusted by shape alone.
const trustedSet = new WeakSet();
// SECURITY: Trust-minting capability. Call only in the authenticated NHTSA corpus adapter,
// after a successful vehicle-scoped database query; never on request or AI payloads.
function fromTrustedCorpus(rows, vehicle) {
  return (Array.isArray(rows) ? rows : []).map(row => trustedCorpusReference(row, vehicle)).filter(Boolean).map(ref => {
    trustedSet.add(ref);
    return ref;
  });
}

module.exports = { MAX_BOOST, APPLICABILITY, fromTrustedCorpus, applyTsbWeights, scoreTsbForCandidate };
