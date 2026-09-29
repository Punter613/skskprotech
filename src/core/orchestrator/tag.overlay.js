'use strict';

const deterministicOrchestrator = require('./deterministic.orchestrator');
const { normalizeVehicleMeasurements } = require('../measurement/measurement-normalizer');

function hasMeasurements(componentData) {
  if (!componentData || typeof componentData !== 'object' || Array.isArray(componentData)) return false;
  return Object.values(componentData).some(
    value => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0
  );
}

async function evaluateTag(vehicle = {}, input = '') {
  if (!hasMeasurements(vehicle.componentData)) {
    return { status: 'NO_MEASUREMENTS', overrides: [] };
  }

  try {
    const profile = normalizeVehicleMeasurements(vehicle);
    const result = await deterministicOrchestrator.process(profile, input);
    return { status: 'CHECKED', overrides: result.overrides || [] };
  } catch (error) {
    return {
      status: 'ERROR',
      overrides: [],
      error: error?.message || String(error)
    };
  }
}

const URGENCY_RANK = { monitor: 0, soon: 1, immediate: 2 };

// Structured view of which deterministic bound was crossed; UI never parses detail text.
function describeViolation(override = {}) {
  const t = override.threshold || {};
  const v = override.value;
  const out = { unit: t.unit };
  if (typeof v === 'number' && t.min !== undefined && v < t.min) return { ...out, comparison: 'below_minimum', limit: t.min };
  if (typeof v === 'number' && t.max !== undefined && v > t.max) return { ...out, comparison: 'above_maximum', limit: t.max };
  if (t.value !== undefined && v === t.value) return { ...out, comparison: 'matches_flagged_value', limit: t.value };
  return out;
}

function applyTagOverlay(result = {}, tag = { status: 'NO_MEASUREMENTS', overrides: [] }) {
  const out = { ...result, tagStatus: tag.status };
  if (tag.status === 'ERROR') out.tagError = tag.error;
  if (!Array.isArray(tag.overrides) || !tag.overrides.length) return out;

  const critical = tag.overrides.some(override => override.severity === 'CRITICAL');
  const floor = critical ? 'immediate' : 'soon';
  const current = URGENCY_RANK[out.urgency] ?? 0;

  if (current < URGENCY_RANK[floor]) out.urgency = floor;
  if (critical) out.safetyRisk = true;

  out.tagOverrides = tag.overrides.map(override => ({
    component: override.component,
    metric: override.metric,
    value: override.value,
    requiredAction: override.action,
    severity: override.severity,
    detail: override.detail,
    ...describeViolation(override)
  }));

  const summary = tag.overrides
    .map(override => `${override.detail || `${override.component}.${override.metric}`} -> ${override.action}`)
    .join('; ');
  out.notes = `${out.notes || ''} TAG safety rule(s) triggered: ${summary}.`.trim();
  return out;
}

module.exports = { evaluateTag, applyTagOverlay, hasMeasurements };
