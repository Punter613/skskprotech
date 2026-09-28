'use strict';

const INVALID_CANDIDATE_PATTERNS = Object.freeze([
  /^manual inspection required$/i,
  /^unable to determine(?:\s*[—-]\s*)?manual inspection required$/i
]);

function clean(value, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function candidateFromResult(result = {}) {
  const direct = clean(result?.primaryCause || result?.diagnosis, 300);
  if (direct) return direct;

  const ranked = Array.isArray(result?.probability) ? result.probability : [];
  const best = ranked
    .map(item => ({ cause: clean(item?.cause, 300), likelihood: Number(item?.likelihood) || 0 }))
    .filter(item => item.cause)
    .sort((a, b) => b.likelihood - a.likelihood)[0];

  return best?.cause || '';
}

function isValidDiagnosticCandidate(value) {
  const candidate = clean(value, 300);
  if (!candidate) return false;
  return !INVALID_CANDIDATE_PATTERNS.some(pattern => pattern.test(candidate));
}

function assertValidDiagnosticResult(result = {}, message = 'A valid persisted diagnostic candidate is required') {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error(message);
  if (result.generationFailed === true || result.parseFailed === true) throw new Error(message);

  const candidate = candidateFromResult(result);
  if (!isValidDiagnosticCandidate(candidate)) throw new Error(message);
  return candidate;
}

module.exports = {
  INVALID_CANDIDATE_PATTERNS,
  candidateFromResult,
  isValidDiagnosticCandidate,
  assertValidDiagnosticResult
};
