'use strict';

const express = require('express');
const router = express.Router();
const { getJob, createReturnVisit, findReturnVisits } = require('../services/job.lifecycle');
const { workOrderSummary, workOrders } = require('../services/work.order');
const {
  createEstimateOnlyLifecycle,
  createQuickEstimate,
  handoffVerifiedEstimate,
  reviseQuickEstimate,
  presentQuickEstimate,
  recordCustomerDecisions,
  estimateCenterSummary
} = require('../services/customer.estimate.center');

function fail(res, status, error, extra = {}) {
  return res.status(status).json({ success: false, error, ...extra });
}

router.post('/job', async (req, res) => {
  try {
    const job = await createEstimateOnlyLifecycle(req.body || {});
    return res.status(201).json({
      success: true,
      lifecycleNumber: job.jobId,
      jobId: job.jobId,
      estimateOnly: true,
      customer: job.customer,
      vehicle: job.vehicle
    });
  } catch (err) {
    return fail(res, 409, err.message || 'Unable to create estimate-only lifecycle');
  }
});

router.post('/:id/return-visit', async (req, res) => {
  try {
    const job = await createReturnVisit(req.params.id, req.body || {});
    if (!job) return fail(res, 404, 'Prior lifecycle number not found', { lifecycleNumber: req.params.id });
    return res.status(201).json({
      success: true,
      lifecycleNumber: job.jobId,
      jobId: job.jobId,
      relationship: job.relationship,
      customer: job.customer,
      vehicle: job.vehicle
    });
  } catch (err) {
    return fail(res, 409, err.message || 'Unable to create return visit', { lifecycleNumber: req.params.id });
  }
});

router.get('/:id', async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) return fail(res, 404, 'Lifecycle number not found', { lifecycleNumber: req.params.id });
  const returnVisits = await findReturnVisits(job.jobId);
  return res.json({
    success: true,
    ...estimateCenterSummary(job),
    relationship: job.relationship || null,
    returnVisits: returnVisits.map(visit => ({
      lifecycleNumber: visit.jobId,
      status: visit.status,
      createdAt: visit.createdAt,
      relationship: visit.relationship
    })),
    workOrders: workOrderSummary(job),
    workOrderDocuments: JSON.parse(JSON.stringify(workOrders(job)))
  });
});

router.post('/:id/from-verified-estimate', async (req, res) => {
  try {
    const result = await handoffVerifiedEstimate(req.params.id);
    if (!result) return fail(res, 404, 'Lifecycle number not found', { lifecycleNumber: req.params.id });
    return res.status(result.created ? 201 : 200).json({
      success: true,
      lifecycleNumber: req.params.id,
      created: result.created,
      estimate: result.estimate
    });
  } catch (err) {
    return fail(res, 409, err.message || 'Verified estimate handoff failed', { lifecycleNumber: req.params.id });
  }
});

router.post('/:id/quick', async (req, res) => {
  try {
    const estimate = await createQuickEstimate(req.params.id, req.body || {});
    if (!estimate) return fail(res, 404, 'Lifecycle number not found', { lifecycleNumber: req.params.id });
    return res.status(201).json({ success: true, lifecycleNumber: req.params.id, estimate });
  } catch (err) {
    return fail(res, 409, err.message, { lifecycleNumber: req.params.id });
  }
});

router.post('/:id/quick/:estimateId/revise', async (req, res) => {
  try {
    const estimate = await reviseQuickEstimate(req.params.id, req.params.estimateId, req.body || {});
    if (!estimate) return fail(res, 404, 'Lifecycle number not found', { lifecycleNumber: req.params.id });
    return res.status(201).json({ success: true, lifecycleNumber: req.params.id, estimate });
  } catch (err) {
    return fail(res, 409, err.message, { lifecycleNumber: req.params.id });
  }
});

router.post('/:id/quick/:estimateId/:revision/present', async (req, res) => {
  try {
    const estimate = await presentQuickEstimate(req.params.id, req.params.estimateId, req.params.revision);
    if (!estimate) return fail(res, 404, 'Lifecycle number not found', { lifecycleNumber: req.params.id });
    return res.json({ success: true, lifecycleNumber: req.params.id, estimate });
  } catch (err) {
    return fail(res, 409, err.message, { lifecycleNumber: req.params.id });
  }
});

router.post('/:id/quick/:estimateId/:revision/decisions', async (req, res) => {
  try {
    const estimate = await recordCustomerDecisions(
      req.params.id,
      req.params.estimateId,
      req.params.revision,
      req.body?.decisions || []
    );
    if (!estimate) return fail(res, 404, 'Lifecycle number not found', { lifecycleNumber: req.params.id });
    return res.json({
      success: true,
      lifecycleNumber: req.params.id,
      estimate,
      totalIdentified: estimate.totals.identified,
      authorizedToday: estimate.totals.authorized,
      deferred: estimate.totals.deferred,
      declined: estimate.totals.declined
    });
  } catch (err) {
    return fail(res, 409, err.message, { lifecycleNumber: req.params.id });
  }
});

module.exports = router;
