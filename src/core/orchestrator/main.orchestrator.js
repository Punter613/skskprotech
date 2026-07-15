/**
 * SKSK Main Orchestrator
 * Integrates all layers: Deterministic → AI Router → Evidence → Economic → Output
 * This is the single entry point for all SKSK intelligence requests
 */

const deterministicOrchestrator = require('./deterministic.orchestrator');
const aiRouter = require('../../services/ai/ai.specialist.router');
const evidenceVerifier = require('../evidence/evidence.verifier');
const economicEngine = require('../economic/economic.engine');

class SKSKOrchestrator {
  constructor() {
    this.pipelineStats = {
      totalRequests: 0,
      deterministicOverrides: 0,
      aiProcessed: 0,
      evidenceRejected: 0,
      economicAnalyzed: 0,
      errors: 0
    };
  }

  /**
   * Main pipeline: processes a vehicle intelligence request end-to-end
   *
   * Pipeline:
   * 1. Deterministic Orchestrator (safety rules)
   * 2. AI Specialist Router (intent classification + specialist selection)
   * 3. AI Execution (specialist generates recommendation)
   * 4. Evidence Verification (validate AI output)
   * 5. Economic Analysis (calculate ECF/EVP/ROI/TCO)
   * 6. Final Decision Assembly
   *
   * @param {Object} request - { input, vehicleProfile, context }
   * @returns {Object} - Complete decision package
   */
  async process(request) {
    const startTime = Date.now();
    this.pipelineStats.totalRequests++;

    try {
      const { input, vehicleProfile, context = {} } = request;

      // ───────────────────────────────────────────────
      // STEP 1: DETERMINISTIC ORCHESTRATOR
      // ───────────────────────────────────────────────
      console.log('[ORCHESTRATOR] Step 1: Running deterministic checks...');
      const deterministicResult = await deterministicOrchestrator.process(vehicleProfile, input);

      if (!deterministicResult.approved) {
        this.pipelineStats.deterministicOverrides++;
        return this._buildDeterministicResponse(deterministicResult, vehicleProfile);
      }

      // If safety override but not critical, we can still use AI with constraints
      const safetyConstraints = deterministicResult.overrides.filter(o => o.severity === 'CRITICAL');

      // ───────────────────────────────────────────────
      // STEP 2: AI SPECIALIST ROUTER
      // ───────────────────────────────────────────────
      console.log('[ORCHESTRATOR] Step 2: Routing to AI specialist...');
      const routingResult = await aiRouter.route(input, {
        ...context,
        vehicleProfile,
        forceSpecialist: context.forceSpecialist
      });

      // ───────────────────────────────────────────────
      // STEP 3: AI EXECUTION
      // ───────────────────────────────────────────────
      console.log(`[ORCHESTRATOR] Step 3: Executing ${routingResult.specialist} specialist...`);
      let aiOutput = await aiRouter.execute(routingResult, input, {
        ...context,
        vehicleProfile,
        safetyConstraints
      });

      this.pipelineStats.aiProcessed++;

      // Handle multi-intent chains
      if (routingResult.suggestedChain) {
        console.log(`[ORCHESTRATOR] Multi-intent detected: ${routingResult.suggestedChain.join(' → ')}`);
        aiOutput = await this._executeChain(routingResult.suggestedChain, input, context, vehicleProfile);
      }

      // ───────────────────────────────────────────────
      // STEP 4: EVIDENCE VERIFICATION
      // ───────────────────────────────────────────────
      console.log('[ORCHESTRATOR] Step 4: Running evidence verification...');
      const evidenceResult = await evidenceVerifier.verify(
        aiOutput.output,
        routingResult.specialist,
        vehicleProfile
      );

      if (!evidenceResult.approved) {
        this.pipelineStats.evidenceRejected++;

        if (evidenceResult.quarantine) {
          return this._buildQuarantineResponse(evidenceResult, aiOutput, vehicleProfile);
        }

        // Retry with fallback specialist (receptionist for human handoff)
        console.log('[ORCHESTRATOR] Evidence failed, falling back to human handoff...');
        const fallbackRouting = await aiRouter.route(input, {
          ...context,
          vehicleProfile,
          forceSpecialist: 'receptionist'
        });
        aiOutput = await aiRouter.execute(fallbackRouting, input, {
          ...context,
          vehicleProfile,
          fallback: true
        });
      }

      // ───────────────────────────────────────────────
      // STEP 5: ECONOMIC ANALYSIS
      // ───────────────────────────────────────────────
      console.log('[ORCHESTRATOR] Step 5: Running economic analysis...');

      // Parse AI output into recommendation structure
      const recommendation = this._parseAIOutput(aiOutput.output, routingResult.specialist);
      recommendation.component = recommendation.component || this._inferComponent(input);

      const economicResult = await economicEngine.analyze(recommendation, vehicleProfile);
      this.pipelineStats.economicAnalyzed++;

      // ───────────────────────────────────────────────
      // STEP 6: FINAL DECISION ASSEMBLY
      // ───────────────────────────────────────────────
      console.log('[ORCHESTRATOR] Step 6: Assembling final decision...');

      const finalDecision = {
        status: 'SUCCESS',
        pipeline: {
          deterministic: deterministicResult,
          routing: routingResult,
          ai: aiOutput,
          evidence: evidenceResult,
          economic: economicResult
        },
        decision: {
          action: economicResult.recommendation.action,
          urgency: economicResult.recommendation.urgency,
          confidence: this._calculateOverallConfidence(deterministicResult, evidenceResult, economicResult),
          reasoning: economicResult.recommendation.reasoning,
          specialist: routingResult.config.name,
          aiOutput: aiOutput.output,
          economicAnalysis: economicResult
        },
        metadata: {
          latencyMs: Date.now() - startTime,
          pipelineVersion: '1.0.0',
          requestId: this._generateRequestId(),
          timestamp: new Date().toISOString()
        }
      };

      console.log(`[ORCHESTRATOR] Complete. Latency: ${finalDecision.metadata.latencyMs}ms`);
      return finalDecision;

    } catch (error) {
      this.pipelineStats.errors++;
      console.error('[ORCHESTRATOR] Pipeline error:', error);

      return {
        status: 'ERROR',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        fallback: {
          action: 'HUMAN_HANDOFF',
          message: 'An error occurred during processing. A human service advisor has been notified.',
          urgency: 'HIGH'
        },
        metadata: {
          latencyMs: Date.now() - startTime,
          requestId: this._generateRequestId(),
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Build response when deterministic rules override AI
   */
  _buildDeterministicResponse(deterministicResult, vehicleProfile) {
    const overrides = deterministicResult.overrides;
    const critical = overrides.filter(o => o.severity === 'CRITICAL');

    return {
      status: 'DETERMINISTIC_OVERRIDE',
      decision: {
        action: critical.length > 0 ? 'MANDATORY_ACTION_REQUIRED' : 'SAFETY_ADVISORY',
        urgency: critical.length > 0 ? 'CRITICAL' : 'HIGH',
        confidence: 1.0,
        reasoning: deterministicResult.reason,
        overrides: overrides.map(o => ({
          component: o.component,
          metric: o.metric,
          value: o.value,
          threshold: o.threshold,
          requiredAction: o.action,
          severity: o.severity
        }))
      },
      aiBypassed: true,
      humanReviewRequired: critical.length > 0,
      metadata: {
        ...deterministicResult.metadata,
        overrideType: critical.length > 0 ? 'CRITICAL_SAFETY' : 'ADVISORY'
      }
    };
  }

  /**
   * Build response when evidence quarantines output
   */
  _buildQuarantineResponse(evidenceResult, aiOutput, vehicleProfile) {
    return {
      status: 'QUARANTINED',
      decision: {
        action: 'HUMAN_REVIEW_REQUIRED',
        urgency: 'HIGH',
        confidence: evidenceResult.confidence,
        reasoning: `AI output failed evidence verification: ${evidenceResult.quarantineReason}`,
        quarantineDetails: evidenceResult
      },
      aiOutput: aiOutput.output,
      humanReviewRequired: true,
      metadata: {
        timestamp: new Date().toISOString(),
        quarantineReason: evidenceResult.quarantineReason
      }
    };
  }

  /**
   * Execute multi-intent chain (e.g., diagnose → estimate → parts)
   */
  async _executeChain(chain, input, context, vehicleProfile) {
    let currentOutput = null;
    const chainResults = [];

    for (const specialistKey of chain) {
      const routing = await aiRouter.route(input, {
        ...context,
        vehicleProfile,
        forceSpecialist: specialistKey
      });

      // Feed previous output as context for next specialist
      const enrichedContext = {
        ...context,
        vehicleProfile,
        previousOutput: currentOutput
      };

      const result = await aiRouter.execute(routing, input, enrichedContext);
      chainResults.push({ specialist: specialistKey, result });
      currentOutput = result.output;
    }

    return {
      success: true,
      chainResults,
      output: currentOutput,
      chain: chain.join(' → ')
    };
  }

  /**
   * Parse AI output into recommendation structure for economic engine
   */
  _parseAIOutput(output, specialist) {
    try {
      const data = typeof output === 'string' ? JSON.parse(output) : output;

      return {
        component: data.component || data.predictions?.[0]?.component || 'general',
        partsCost: data.parts?.reduce((sum, p) => sum + (p.price * (p.quantity || 1)), 0) || 0,
        laborHours: data.labor?.hours || 2,
        description: data.description || 'AI-generated recommendation',
        confidence: data.confidence || data.overallConfidence || 75
      };
    } catch (e) {
      // Fallback for non-JSON outputs
      return {
        component: 'general',
        partsCost: 0,
        laborHours: 2,
        description: output.substring(0, 200),
        confidence: 50
      };
    }
  }

  /**
   * Infer component from user input when AI output is ambiguous
   */
  _inferComponent(input) {
    const componentKeywords = {
      brakes: /brake|pad|rotor|caliper/i,
      timing_belt: /timing|belt|chain/i,
      tires: /tire|wheel|alignment|balance/i,
      transmission: /transmission|gear|shift|clutch/i,
      alternator: /alternator|battery|charging|electrical/i,
      water_pump: /water pump|coolant|overheat|radiator/i,
      engine_oil: /oil|filter|change/i,
      suspension: /suspension|shock|strut|spring/i,
      steering: /steering|wheel|power steering|rack/i
    };

    for (const [component, pattern] of Object.entries(componentKeywords)) {
      if (pattern.test(input)) return component;
    }

    return 'general';
  }

  /**
   * Calculate overall confidence score
   */
  _calculateOverallConfidence(deterministic, evidence, economic) {
    const weights = {
      deterministic: 0.3,
      evidence: 0.4,
      economic: 0.3
    };

    const detScore = deterministic.overrides.length === 0 ? 1.0 : 0.5;
    const evScore = evidence.confidence;
    const ecoScore = economic.recommendation.confidence;

    return (detScore * weights.deterministic) +
           (evScore * weights.evidence) +
           (ecoScore * weights.economic);
  }

  _generateRequestId() {
    return `sksk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get pipeline statistics
   */
  getStats() {
    return {
      ...this.pipelineStats,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    };
  }

  /**
   * Health check endpoint
   */
  health() {
    return {
      status: 'healthy',
      version: '1.0.0',
      components: {
        deterministic: 'loaded',
        aiRouter: 'loaded',
        evidence: 'loaded',
        economic: 'loaded'
      },
      stats: this.getStats()
    };
  }
}

module.exports = new SKSKOrchestrator();
