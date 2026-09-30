const crypto = require('crypto');
const { supabase, persistenceRequired, assertPersistenceConfigured } = require('../db');
const {
  buildVerifiedEstimateSnapshot,
  assertVerifiedEstimateSnapshot
} = require('../core/evidence/verified.estimate.snapshot');
const { buildUnverifiedDiagnosis } = require('../core/evidence/unverified.diagnosis');
const { assertValidDiagnosticResult } = require('../core/evidence/diagnostic.candidate');

const VALID_STATES = new Set([
  'DIAGNOSING', 'TESTING', 'VERIFIED', 'ESTIMATED', 'INVOICED', 'DIAG_FAILED',
  'REPAIR_COMPLETED', 'OUTCOME_CONFIRMED'
]);

const PLACEHOLDER_RESULTS = new Set([
  '?', '??', '???', 'unknown', 'tbd', 'pending', 'n/a', 'na',
  'not sure', 'unsure', 'uncertain', 'maybe', 'possibly', 'probably',
  'not tested', 'not performed'
]);

const TEST_EVIDENCE_ROLES = Object.freeze({
  NEUTRAL: 'NEUTRAL',
  SUPPORTS: 'SUPPORTS',
  REFUTES: 'REFUTES',
  CONFIRMS: 'CONFIRMS'
});

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function isMeaningfulTestResult(value) {
  const result = clean(value);
  if (!result || !/[\p{L}\p{N}]/u.test(result)) return false;

  // Treat punctuation-wrapped placeholder tokens as the same placeholder. This
  // strips only leading/trailing non-alphanumeric characters for the comparison;
  // the persisted mechanic result itself is left unchanged.
  const placeholderCandidate = result
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/gu, '')
    .replace(/[^\p{L}\p{N}]+$/gu, '')
    .trim();

  return !PLACEHOLDER_RESULTS.has(placeholderCandidate);
}

function normalizeEvidenceRole(value) {
  const raw = clean(value).toUpperCase().replace(/[\s-]+/g, '_');
  if (!raw) return TEST_EVIDENCE_ROLES.NEUTRAL;

  const aliases = {
    OBSERVED: TEST_EVIDENCE_ROLES.NEUTRAL,
    OBSERVED_NEUTRAL: TEST_EVIDENCE_ROLES.NEUTRAL,
    NEUTRAL: TEST_EVIDENCE_ROLES.NEUTRAL,
    SUPPORT: TEST_EVIDENCE_ROLES.SUPPORTS,
    SUPPORTS: TEST_EVIDENCE_ROLES.SUPPORTS,
    REFUTE: TEST_EVIDENCE_ROLES.REFUTES,
    REFUTES: TEST_EVIDENCE_ROLES.REFUTES,
    CONFIRM: TEST_EVIDENCE_ROLES.CONFIRMS,
    CONFIRMS: TEST_EVIDENCE_ROLES.CONFIRMS,
    CONFIRMED: TEST_EVIDENCE_ROLES.CONFIRMS
  };
  return aliases[raw] || null;
}

function normalizeFault(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isVerificationEligibleTest(test = {}) {
  return normalizeEvidenceRole(test.evidenceRole) === TEST_EVIDENCE_ROLES.CONFIRMS
    && isMeaningfulTestResult(test.result)
    && !!clean(test.confirmedFault);
}

function testConfirmsFault(test = {}, confirmedCause = '') {
  if (!isVerificationEligibleTest(test)) return false;
  const testFault = normalizeFault(test.confirmedFault);
  const requestedFault = normalizeFault(confirmedCause);
  return !!testFault && !!requestedFault && testFault === requestedFault;
}

function nowIso() {
  return new Date().toISOString();
}

function makeJobId() {
  const now = new Date();
  const date = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `SKSK-${date}-${suffix}`;
}

function normalizeCustomer(input = {}) {
  const customer = input.customer || input.customerInfo || {};
  return {
    name: customer.name || input.customerName || '',
    phone: customer.phone || input.phone || '',
    email: customer.email || input.email || ''
  };
}

function normalizeVehicle(input = {}) {
  const vehicle = input.vehicle || input.vehicleInfo || {};
  return {
    year: vehicle.year || input.year || '',
    make: vehicle.make || input.make || '',
    model: vehicle.model || input.model || '',
    trim: vehicle.trim || input.trim || '',
    engine: vehicle.engine || input.engine || '',
    vin: input.vin || vehicle.vin || '',
    mileage: input.mileage || vehicle.mileage || 0
  };
}

function memoryStore() {
  global.__jobs = global.__jobs || {};
  return global.__jobs;
}

function normalizeShopId(shopId) {
  return String(shopId || '').trim();
}

function cacheKey(jobId, shopId = '') {
  const shop = normalizeShopId(shopId);
  return shop ? `${shop}::${jobId}` : jobId;
}

function jobBelongsToShop(job, shopId = '') {
  const shop = normalizeShopId(shopId);
  if (!shop) return true;
  return normalizeShopId(job?.shopId) === shop;
}

async function persist(job, shopId = '') {
  assertPersistenceConfigured();
  const ownerShopId = normalizeShopId(shopId || job.shopId);
  if (ownerShopId) job.shopId = ownerShopId;
  memoryStore()[cacheKey(job.jobId, ownerShopId)] = job;
  if (!supabase) return job;

  const row = {
    job_id: job.jobId,
    shop_id: ownerShopId || null,
    status: job.status,
    customer_name: job.customer.name || null,
    customer_phone: job.customer.phone || null,
    customer_email: job.customer.email || null,
    vehicle_year: Number(job.vehicle.year) || null,
    vehicle_make: job.vehicle.make || null,
    vehicle_model: job.vehicle.model || null,
    vehicle_vin: job.vehicle.vin || null,
    mileage: Number(job.vehicle.mileage) || null,
    payload: job,
    updated_at: nowIso()
  };

  try {
    const { error } = await supabase.from('service_jobs').upsert(row, { onConflict: 'job_id' });
    if (error) throw error;
  } catch (err) {
    console.error('[JobLifecycle] Supabase persist failed:', err.message || err);
    if (persistenceRequired()) {
      const persistenceError = new Error('Persistent job storage is unavailable');
      persistenceError.code = 'PERSISTENCE_WRITE_FAILED';
      persistenceError.cause = err;
      throw persistenceError;
    }
    console.warn('[JobLifecycle] Development fallback retained in memory only');
  }
  return job;
}

async function getJob(jobId, shopId = '') {
  if (!jobId) return null;
  const ownerShopId = normalizeShopId(shopId);
  const memory = memoryStore()[cacheKey(jobId, ownerShopId)];
  if (memory && jobBelongsToShop(memory, ownerShopId)) return memory;
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('service_jobs')
      .select('payload, shop_id')
      .eq('job_id', jobId)
      .maybeSingle();
    if (error || !data?.payload) return null;
    if (ownerShopId && String(data.shop_id || '').trim() !== ownerShopId) return null;
    const job = { ...data.payload, shopId: data.payload.shopId || data.shop_id || '' };
    memoryStore()[cacheKey(jobId, ownerShopId || job.shopId)] = job;
    return job;
  } catch {
    return null;
  }
}

function invalidateJobCache(jobId, shopId = '') {
  const shop = normalizeShopId(shopId);
  if (shop) delete memoryStore()[cacheKey(jobId, shop)];
  else {
    for (const key of Object.keys(memoryStore())) {
      if (key === jobId || key.endsWith(`::${jobId}`)) delete memoryStore()[key];
    }
  }
}

async function createJob(input = {}, shopId = '') {
  const jobId = input.jobId || makeJobId();
  const ownerShopId = normalizeShopId(shopId || input.shopId);
  const createdAt = nowIso();
  const job = {
    jobId,
    invoiceNumber: jobId,
    shopId: ownerShopId || '',
    status: 'DIAGNOSING',
    createdAt,
    updatedAt: createdAt,
    customer: normalizeCustomer(input),
    vehicle: normalizeVehicle(input),
    intake: {
      customerStates: input.customerStates || input.symptoms || [],
      mechanicNotices: input.mechanicNotices || input.notes || [],
      obdCodes: input.obdCodes || input.codes || []
    },
    diagnosis: null,
    unverifiedDiagnosis: null,
    tests: [],
    verification: null,
    estimate: null,
    invoice: null
  };
  return persist(job, ownerShopId);
}

async function findReturnVisits(priorJobId, shopId = '') {
  if (!priorJobId) return [];
  const ownerShopId = normalizeShopId(shopId);
  const seen = new Map();

  for (const job of Object.values(memoryStore())) {
    if (jobBelongsToShop(job, ownerShopId) && job?.relationship?.type === 'RETURN_VISIT' && job.relationship.priorLifecycleNumber === priorJobId) {
      seen.set(job.jobId, job);
    }
  }

  if (supabase) {
    try {
      let query = supabase.from('service_jobs').select('payload, shop_id');
      if (ownerShopId) query = query.eq('shop_id', ownerShopId);
      const { data, error } = await query;
      if (!error) {
        for (const row of data || []) {
          const job = row?.payload;
          if (job?.relationship?.type === 'RETURN_VISIT' && job.relationship.priorLifecycleNumber === priorJobId) {
            seen.set(job.jobId, job);
            memoryStore()[cacheKey(job.jobId, ownerShopId || row.shop_id || job.shopId)] = job;
          }
        }
      }
    } catch (err) {
      console.warn('[JobLifecycle] Return-visit lookup failed, memory results retained:', err.message);
    }
  }

  return [...seen.values()].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

async function createReturnVisit(priorJobId, input = {}, shopId = '') {
  const prior = await getJob(priorJobId, shopId);
  if (!prior) return null;

  const rootLifecycleNumber = prior.relationship?.rootLifecycleNumber || prior.jobId;
  const job = await createJob({
    customer: clonePlain(prior.customer || {}),
    vehicle: {
      ...clonePlain(prior.vehicle || {}),
      mileage: input.mileage ?? prior.vehicle?.mileage ?? 0
    },
    customerStates: Array.isArray(input.customerStates) ? input.customerStates : [],
    mechanicNotices: Array.isArray(input.mechanicNotices) ? input.mechanicNotices : [],
    obdCodes: Array.isArray(input.obdCodes) ? input.obdCodes : []
  }, shopId);

  return patchJob(job.jobId, {
    relationship: {
      type: 'RETURN_VISIT',
      priorLifecycleNumber: prior.jobId,
      rootLifecycleNumber,
      createdFromPriorAt: nowIso()
    }
  }, shopId);
}

async function patchJob(jobId, patch = {}, shopId = '') {
  const job = await getJob(jobId, shopId);
  if (!job) return null;
  const nextStatus = patch.status || job.status;
  if (!VALID_STATES.has(nextStatus)) throw new Error(`Invalid job status: ${nextStatus}`);
  const updated = { ...job, ...patch, status: nextStatus, updatedAt: nowIso() };
  return persist(updated, shopId);
}

async function recordDiagnosis(jobId, diagnosis, traceLog = null) {
  return patchJob(jobId, {
    status: 'TESTING',
    diagnosis: { result: diagnosis, traceLog, revision: 1, recordedAt: nowIso() }
  });
}

async function recordDiagnosisFailure(jobId, error) {
  return patchJob(jobId, {
    status: 'DIAG_FAILED',
    diagnosis: { error: String(error || 'Diagnosis failed'), recordedAt: nowIso() }
  });
}

async function recordUnverifiedDiagnosis(jobId) {
  const job = await getJob(jobId);
  if (!job) return null;
  if (!job.diagnosis?.result) throw new Error('Diagnosis must exist before requesting an unverified diagnosis');
  if (!['TESTING', 'DIAGNOSING'].includes(job.status)) {
    throw new Error(`Unverified diagnosis is unavailable while job is ${job.status}`);
  }

  const unverifiedDiagnosis = buildUnverifiedDiagnosis(job, nowIso());
  job.unverifiedDiagnosis = {
    ...unverifiedDiagnosis,
    diagnosisRevision: Math.max(1, Number(job.diagnosis?.revision) || 1),
    stale: false
  };
  job.updatedAt = nowIso();
  await persist(job);
  return job;
}

async function addTest(jobId, test = {}) {
  const job = await getJob(jobId);
  if (!job) return null;
  if (!['TESTING', 'DIAGNOSING'].includes(job.status)) {
    throw new Error(`Tests cannot be added while job is ${job.status}`);
  }

  const name = clean(test.name || test.test);
  const result = clean(test.result);
  if (!name) throw new Error('Recorded test requires a test name');
  if (!isMeaningfulTestResult(result)) {
    throw new Error('Recorded test requires an actual observation or measurement; placeholders do not count as evidence');
  }

  const requestedRole = clean(test.evidenceRole || test.evidenceStrength || test.role);
  const evidenceRole = normalizeEvidenceRole(requestedRole);
  if (!evidenceRole) {
    throw new Error('Recorded test evidence role must be NEUTRAL, SUPPORTS, REFUTES, or CONFIRMS');
  }

  const confirmedFault = evidenceRole === TEST_EVIDENCE_ROLES.CONFIRMS
    ? clean(test.confirmedFault)
    : '';
  if (evidenceRole === TEST_EVIDENCE_ROLES.CONFIRMS && !confirmedFault) {
    throw new Error('A CONFIRMS test must name the exact fault that the physical evidence confirms');
  }

  const recordedAt = nowIso();
  const entry = {
    id: test.id || crypto.randomUUID(),
    name,
    result,
    units: clean(test.units),
    notes: clean(test.notes),
    passed: typeof test.passed === 'boolean' ? test.passed : null,
    evidenceRole,
    confirmedFault,
    recordedAt
  };
  job.tests = [...(job.tests || []), entry];
  if (job.unverifiedDiagnosis?.state === 'UNVERIFIED_DIAGNOSIS') {
    job.unverifiedDiagnosis = {
      ...job.unverifiedDiagnosis,
      stale: true,
      supersededBy: 'NEW_TEST_EVIDENCE',
      supersededAt: recordedAt
    };
  }
  job.status = 'TESTING';
  job.updatedAt = recordedAt;
  await persist(job);
  return entry;
}

async function verifyJob(jobId, verification = {}) {
  const job = await getJob(jobId);
  if (!job) return null;
  if (!job.diagnosis?.result) throw new Error('Diagnosis must exist before verification');
  assertValidDiagnosticResult(job.diagnosis.result, 'Verification requires a valid persisted diagnostic candidate');
  if (!Array.isArray(job.tests) || job.tests.length === 0) throw new Error('At least one recorded test is required before verification');

  const confirmed = verification.confirmed === true;
  if (!confirmed) {
    job.verification = {
      confirmed: false,
      conclusion: clean(verification.conclusion),
      confirmedCause: clean(verification.confirmedCause),
      evidenceTestIds: [],
      notes: clean(verification.notes),
      diagnosisRevision: Math.max(1, Number(job.diagnosis?.revision) || 1),
      verifiedAt: nowIso()
    };
    job.status = 'TESTING';
    job.updatedAt = nowIso();
    await persist(job);
    return job;
  }

  const confirmedCause = clean(verification.confirmedCause);
  if (!confirmedCause) throw new Error('Verification requires an explicit confirmed cause/fault');

  const conclusion = clean(verification.conclusion || verification.notes);
  if (!conclusion) {
    throw new Error('Verification requires a mechanic conclusion explaining why the selected test evidence confirms the fault');
  }

  const evidenceTestIds = [...new Set(
    (Array.isArray(verification.evidenceTestIds) ? verification.evidenceTestIds : [])
      .map(clean)
      .filter(Boolean)
  )];
  if (!evidenceTestIds.length) throw new Error('Verification requires at least one explicitly selected confirmation-grade test');

  const testsById = new Map(job.tests.map(test => [clean(test.id), test]));
  const selectedTests = evidenceTestIds.map(id => testsById.get(id));
  if (selectedTests.some(test => !test)) throw new Error('Verification evidence must reference tests persisted on this job');
  if (selectedTests.some(test => !isMeaningfulTestResult(test.result))) {
    throw new Error('Selected verification evidence contains a placeholder or empty result');
  }
  if (selectedTests.some(test => !isVerificationEligibleTest(test))) {
    throw new Error('Selected verification evidence must be explicitly classified CONFIRMS and bind the physical result to a named fault');
  }
  if (selectedTests.some(test => !testConfirmsFault(test, confirmedCause))) {
    throw new Error('Confirmed Cause / Fault must exactly match the fault named by every selected CONFIRMS test');
  }

  const diagnosisRevision = Math.max(1, Number(job.diagnosis?.revision) || 1);
  job.verification = {
    confirmed: true,
    conclusion,
    confirmedCause,
    evidenceTestIds,
    notes: clean(verification.notes),
    diagnosisRevision,
    verifiedAt: nowIso()
  };
  if (job.unverifiedDiagnosis?.state === 'UNVERIFIED_DIAGNOSIS') {
    job.unverifiedDiagnosis = {
      ...job.unverifiedDiagnosis,
      supersededBy: 'VERIFIED_CASE',
      supersededAt: nowIso()
    };
  }
  job.status = 'VERIFIED';
  job.updatedAt = nowIso();
  await persist(job);
  return job;
}

async function attachEstimate(jobId, estimate) {
  const job = await getJob(jobId);
  if (!job) return null;
  if (job.status !== 'VERIFIED') throw new Error('Estimate requires a VERIFIED diagnosis');
  job.estimate = buildVerifiedEstimateSnapshot(job, estimate);
  job.status = 'ESTIMATED';
  job.updatedAt = nowIso();
  await persist(job);
  return job.estimate;
}

async function attachInvoice(jobId, invoice) {
  const job = await getJob(jobId);
  if (!job) return null;
  if (!job.estimate) throw new Error('Invoice requires an estimate');
  assertVerifiedEstimateSnapshot(job.estimate, job);
  job.invoice = { ...invoice, invoiceNumber: jobId, jobId, estimateFingerprint: job.estimate.fingerprint, createdAt: nowIso() };
  job.status = 'INVOICED';
  job.updatedAt = nowIso();
  await persist(job);
  return job.invoice;
}

function hydrateEstimateInput(job, incoming = {}) {
  return {
    ...incoming,
    jobId: job.jobId,
    customer: { ...job.customer, ...(incoming.customer || {}) },
    vehicle: { ...job.vehicle, ...(incoming.vehicle || {}) },
    vin: incoming.vin || job.vehicle.vin || '',
    mileage: incoming.mileage || job.vehicle.mileage || 0,
    customerStates: incoming.customerStates?.length ? incoming.customerStates : job.intake.customerStates,
    mechanicNotices: incoming.mechanicNotices?.length ? incoming.mechanicNotices : job.intake.mechanicNotices,
    obdCodes: incoming.obdCodes?.length ? incoming.obdCodes : job.intake.obdCodes,
    diagnosticTests: incoming.diagnosticTests?.length
      ? incoming.diagnosticTests
      : (job.tests || []).map(t => `${t.name}: ${t.result}${t.units ? ` ${t.units}` : ''}${t.notes ? ` — ${t.notes}` : ''}`),
    verifiedDiagnosis: job.verification
  };
}

function hydrateInvoiceInput(job, incoming = {}) {
  const estimate = assertVerifiedEstimateSnapshot(job.estimate, job);
  return {
    jobId: job.jobId,
    estimate,
    customerInfo: clonePlain(job.customer),
    vehicleInfo: clonePlain(job.vehicle),
    notes: typeof incoming.notes === 'string' ? incoming.notes : ''
  };
}

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

module.exports = {
  makeJobId,
  createJob,
  getJob,
  patchJob,
  createReturnVisit,
  findReturnVisits,
  recordDiagnosis,
  recordDiagnosisFailure,
  recordUnverifiedDiagnosis,
  addTest,
  verifyJob,
  attachEstimate,
  attachInvoice,
  hydrateEstimateInput,
  hydrateInvoiceInput,
  invalidateJobCache,
  isMeaningfulTestResult,
  normalizeEvidenceRole,
  isVerificationEligibleTest,
  testConfirmsFault,
  TEST_EVIDENCE_ROLES
};
