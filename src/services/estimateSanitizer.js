const { normalizeText, uniqueStrings, toFloat2 } = require('./estimateHelpers');

function buildExcludedSet(history = []) {
  return new Set(
    uniqueStrings(history)
      .map(normalizeText)
      .filter(Boolean)
  );
}

function isExcluded(term, excludedSet) {
  const t = normalizeText(term);
  if (!t) return false;

  for (const item of excludedSet) {
    if (t.includes(item) || item.includes(t)) return true;
  }
  return false;
}

function sanitizeEstimate(estimate, history = []) {
  if (!estimate || typeof estimate !== 'object') return null;

  const excludedSet = buildExcludedSet(history);
  const clean = { ...estimate };

  clean.priority = ['high', 'medium', 'low'].includes(clean.priority) ? clean.priority : 'medium';

  clean.estimatedHours = Number(clean.estimatedHours);
  if (!Number.isFinite(clean.estimatedHours) || clean.estimatedHours <= 0) {
    clean.estimatedHours = 1;
  }

  clean.laborCost = Number(clean.laborCost);
  clean.partsCost = Number(clean.partsCost);
  clean.total = Number(clean.total);

  if (!Number.isFinite(clean.laborCost)) clean.laborCost = 0;
  if (!Number.isFinite(clean.partsCost)) clean.partsCost = 0;
  if (!Number.isFinite(clean.total)) clean.total = clean.laborCost + clean.partsCost;

  clean.repairs = Array.isArray(clean.repairs) ? clean.repairs.filter(x => !isExcluded(x, excludedSet)) : [];
  clean.knownIssues = Array.isArray(clean.knownIssues) ? clean.knownIssues.filter(x => !isExcluded(x, excludedSet)) : [];
  clean.repairSteps = Array.isArray(clean.repairSteps) ? clean.repairSteps : [];
  clean.proTips = Array.isArray(clean.proTips) ? clean.proTips : [];
  clean.additionalChecks = Array.isArray(clean.additionalChecks) ? clean.additionalChecks : [];
  clean.probability = Array.isArray(clean.probability)
    ? clean.probability.filter(x => !isExcluded(x?.cause, excludedSet))
    : [];
  clean.excludedComponents = uniqueStrings(history);

  if (Array.isArray(clean.recommendedInspection)) {
    clean.recommendedInspection = clean.recommendedInspection.filter(Boolean);
  } else {
    clean.recommendedInspection = ['Visual inspection', 'Component measurement'];
  }

  if (!clean.repairs.length) return null;

  clean.laborCost = toFloat2(clean.laborCost);
  clean.partsCost = toFloat2(clean.partsCost);
  clean.total = toFloat2(clean.laborCost + clean.partsCost);

  return clean;
}

function safeEstimate(laborRate, partsCost, overrides = {}) {
  const estimatedHours = 1;
  const labor = toFloat2(estimatedHours * Number(laborRate || 0));
  const parts = toFloat2(Number(partsCost || 0));
  const total = toFloat2(labor + parts);

  return {
    priority: 'medium',
    source: 'fallback',
    diagnosis: 'Manual inspection required - insufficient data for AI determination',
    estimatedHours,
    laborCost: labor,
    partsCost: parts,
    total,
    repairs: ['Diagnostic inspection required'],
    probability: [],
    knownIssues: [],
    repairSteps: [],
    proTips: [],
    additionalChecks: [],
    notes: '',
    deductiveReasoning: 'AI estimation failed or was rejected by deterministic gating.',
    excludedComponents: [],
    recommendedInspection: ['Full visual inspection', 'Component measurement with calipers'],
    ...overrides
  };
}

module.exports = {
  buildExcludedSet,
  isExcluded,
  sanitizeEstimate,
  safeEstimate
};
