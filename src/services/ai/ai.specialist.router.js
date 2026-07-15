/**
 * SKSK AI Specialist Router
 * Routes tasks to the appropriate micro-agent based on intent classification
 * Implements the "AI Specialists" layer from the SKSK Intelligence Platform
 */

const groqClient = require('../groq');

class AISpecialistRouter {
  constructor() {
    // Specialist registry: intent → specialist config
    this.SPECIALISTS = {
      diagnostic: {
        name: 'Diagnostic AI',
        description: 'Analyzes symptoms, fault codes, and vehicle telemetry to identify root causes',
        model: 'llama-3.3-70b-versatile',
        temperature: 0.2,
        maxTokens: 2000,
        jsonMode: false,
        systemPrompt: `You are an expert automotive diagnostic technician with 20+ years experience.
Analyze the provided symptoms, fault codes, and vehicle data. Provide:
1. Probable root cause(s) ranked by likelihood
2. Recommended diagnostic steps
3. Related components to inspect
4. Confidence level (0-100)
Be concise, technical, and accurate. Never guess.`,
        capabilities: ['symptom_analysis', 'fault_code_interpretation', 'telemetry_reading', 'root_cause_ranking']
      },

      estimate: {
        name: 'Estimate AI',
        description: 'Generates structured cost breakdowns for parts and labor',
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        maxTokens: 3000,
        jsonMode: true,
        systemPrompt: `You are an automotive estimator. Generate a detailed repair estimate in strict JSON format.
Include: parts (with part numbers, prices, source), labor (hours, rate, subtotal), fluids/supplies, tax, total.
Use OEM parts as default. Mark aftermarket alternatives. Include labor guide references.`,
        capabilities: ['parts_pricing', 'labor_calculation', 'tax_computation', 'oem_reference']
      },

      tsb: {
        name: 'TSB AI',
        description: 'Searches Technical Service Bulletins for known issues and factory fixes',
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        maxTokens: 1500,
        jsonMode: false,
        systemPrompt: `You are a TSB research specialist. Search the provided TSB database for matches.
Return: TSB number, title, affected vehicles, symptoms, root cause, recommended fix, warranty status.
If no exact match, suggest the closest related TSBs.`,
        capabilities: ['tsb_search', 'symptom_matching', 'factory_fix_lookup', 'warranty_check']
      },

      parts: {
        name: 'Parts AI',
        description: 'Cross-references catalogs for availability, pricing, and fitment',
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        maxTokens: 2000,
        jsonMode: true,
        systemPrompt: `You are a parts procurement specialist. Given a VIN and needed parts, return:
{
  "parts": [
    {
      "partNumber": "string",
      "description": "string",
      "manufacturer": "OEM|Aftermarket",
      "price": number,
      "availability": "in_stock|warehouse|special_order",
      "eta_days": number,
      "warranty_months": number,
      "alternatives": []
    }
  ],
  "compatibility_verified": boolean,
  "total_cost": number
}`,
        capabilities: ['catalog_search', 'fitment_verification', 'pricing_lookup', 'availability_check', 'alternative_sourcing']
      },

      fleet: {
        name: 'Fleet AI',
        description: 'Optimizes fleet uptime, scheduling, and operational windows',
        model: 'llama-3.3-70b-versatile',
        temperature: 0.2,
        maxTokens: 1500,
        jsonMode: true,
        systemPrompt: `You are a fleet operations optimizer. Given vehicle data and shop constraints, return:
{
  "schedule": [
    {
      "vehicle_id": "string",
      "service_type": "string",
      "priority": 1-10,
      "suggested_date": "YYYY-MM-DD",
      "estimated_downtime_hours": number,
      "bay_assignment": "string",
      "technician_skill_required": "string"
    }
  ],
  "fleet_impact": {
    "vehicles_down": number,
    "revenue_at_risk": number,
    "recommended_contingency": "string"
  }
}`,
        capabilities: ['schedule_optimization', 'bay_allocation', 'downtime_minimization', 'priority_ranking']
      },

      buyer: {
        name: 'Buyer AI',
        description: 'Automates part procurement and vendor negotiation',
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3,
        maxTokens: 1500,
        jsonMode: true,
        systemPrompt: `You are an automotive parts buyer. Negotiate best pricing and delivery.
Return: vendor quotes, negotiated prices, delivery terms, bulk discounts, warranty terms.
Prioritize: cost, speed, reliability. Flag supply chain risks.`,
        capabilities: ['vendor_negotiation', 'price_optimization', 'bulk_pricing', 'supply_chain_risk']
      },

      receptionist: {
        name: 'Receptionist AI',
        description: 'Customer-facing communication, booking, and onboarding',
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        maxTokens: 1500,
        jsonMode: false,
        systemPrompt: `You are a professional automotive service advisor. Communicate clearly, empathetically, and accurately.
Use brand voice guidelines. Never make promises about timing or pricing without verification.
Escalate complex technical questions to human staff.`,
        capabilities: ['customer_communication', 'appointment_booking', 'onboarding', 'faq_handling', 'escalation_routing']
      },

      scheduling: {
        name: 'Scheduling AI',
        description: 'Manages shop capacity, technician assignments, and customer appointments',
        model: 'llama-3.3-70b-versatile',
        temperature: 0.2,
        maxTokens: 1500,
        jsonMode: true,
        systemPrompt: `You are a shop scheduling optimizer. Given current workload, technician skills, and customer preferences, return:
{
  "appointments": [
    {
      "customer_id": "string",
      "service_type": "string",
      "date": "YYYY-MM-DD",
      "time": "HH:MM",
      "duration_minutes": number,
      "technician": "string",
      "bay": "string",
      "status": "confirmed|pending|waitlist"
    }
  ],
  "shop_utilization": "string",
  "conflicts": []
}`,
        capabilities: ['capacity_planning', 'technician_matching', 'conflict_resolution', 'waitlist_management']
      },

      prediction: {
        name: 'Prediction AI',
        description: 'Forecasts component degradation and remaining useful life (RUL)',
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        maxTokens: 2000,
        jsonMode: true,
        systemPrompt: `You are a predictive maintenance analyst. Given vehicle telemetry and history, calculate:
{
  "predictions": [
    {
      "component": "string",
      "current_condition": "good|fair|poor|critical",
      "rul_miles": number,
      "rul_days": number,
      "failure_probability_30d": number,
      "failure_probability_90d": number,
      "recommended_action": "string",
      "confidence": number
    }
  ],
  "overall_health_score": number,
  "next_service_miles": number,
  "next_service_date": "YYYY-MM-DD"
}`,
        capabilities: ['rul_calculation', 'degradation_modeling', 'failure_probability', 'health_scoring']
      }
    };

    // Intent classification patterns
    this.INTENT_PATTERNS = {
      diagnostic: [
        /noise|sound|grind|squeak|rattle|vibration|shake|pull|drift|overheat|smell|leak/i,
        /check engine|fault code|diagnostic|trouble code|DTC|OBD/i,
        /won't start|hard start|stall|misfire|rough idle|loss of power/i,
        /symptom|what's wrong|problem|issue|concern/i
      ],
      estimate: [
        /how much|cost|price|estimate|quote|budget|expensive|cheap/i,
        /repair cost|labor rate|parts cost|total price/i,
        /can you quote|give me a price|what would it run/i
      ],
      tsb: [
        /TSB|technical service bulletin|recall|campaign|factory|dealer/i,
        /known issue|common problem|factory fix|warranty extension/i
      ],
      parts: [
        /part number|part #|catalog|availability|in stock|order part/i,
        /where can I get|source|supplier|vendor|aftermarket|OEM/i,
        /fitment|compatible|will this fit|interchange/i
      ],
      fleet: [
        /fleet|multiple vehicles|truck.*s|van.*s|company car/i,
        /downtime|uptime|availability|utilization|rotation/i,
        /schedule fleet|fleet maintenance|bulk service/i
      ],
      buyer: [
        /procure|purchase|buy|vendor|supplier|negotiate|bulk order/i,
        /best price|cheapest source|wholesale|distributor/i
      ],
      receptionist: [
        /book|appointment|schedule|when can I come in|available/i,
        /hours|location|contact|phone|email|service advisor/i,
        /new customer|first time|onboarding|welcome/i,
        /thank you|please|help me|question about service/i
      ],
      scheduling: [
        /reschedule|cancel|move|change time|different day/i,
        /technician|mechanic|who will work|best mechanic/i,
        /how long|duration|when will it be done|completion time/i
      ],
      prediction: [
        /when will it fail|how long left|remaining life|RUL/i,
        /predict|forecast|upcoming|preventive|before it breaks/i,
        /maintenance schedule|next service|when should I/i,
        /health score|condition|wear|degradation/i
      ]
    };
  }

  /**
   * Main routing method
   * @param {string} input - Raw user input or task description
   * @param {Object} context - Vehicle profile, session data, etc.
   * @returns {Object} - { specialist, config, confidence, routingReason }
   */
  async route(input, context = {}) {
    // 1. Classify intent
    const classification = this._classifyIntent(input);

    // 2. Check for multi-intent (e.g., "diagnose and estimate")
    const multiIntent = this._detectMultiIntent(classification);

    // 3. Select primary specialist
    let specialistKey = classification.primary;
    let confidence = classification.confidence;

    // 4. Override based on context
    if (context.forceSpecialist && this.SPECIALISTS[context.forceSpecialist]) {
      specialistKey = context.forceSpecialist;
      confidence = 1.0;
    }

    // 5. Fallback if confidence too low
    if (confidence < 0.3) {
      specialistKey = 'receptionist'; // Human handoff
      confidence = 0.5;
    }

    const specialist = this.SPECIALISTS[specialistKey];

    return {
      specialist: specialistKey,
      config: specialist,
      confidence,
      routingReason: classification.reason,
      multiIntent: multiIntent.length > 1 ? multiIntent : null,
      suggestedChain: multiIntent.length > 1 ? this._buildChain(multiIntent) : null,
      metadata: {
        timestamp: new Date().toISOString(),
        inputLength: input.length,
        contextKeys: Object.keys(context)
      }
    };
  }

  /**
   * Execute the routed task
   */
  async execute(routingResult, input, context) {
    const { specialist, config } = routingResult;

    // Build the prompt
    const prompt = this._buildPrompt(config, input, context);

    // Call the appropriate model
    try {
      const response = await groqClient.groqChat([
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: prompt }
      ], {
        model: config.model,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        response_format: config.jsonMode ? { type: 'json_object' } : undefined
      });

      return {
        success: true,
        specialist: config.name,
        output: response.choices[0].message.content,
        usage: response.usage,
        latency: response._latency || null,
        metadata: {
          model: config.model,
          jsonMode: config.jsonMode
        }
      };
    } catch (error) {
      return {
        success: false,
        specialist: config.name,
        error: error.message,
        fallback: 'Attempting fallback to receptionist for human handoff'
      };
    }
  }

  _classifyIntent(input) {
    const scores = {};
    const text = input.toLowerCase();

    for (const [intent, patterns] of Object.entries(this.INTENT_PATTERNS)) {
      let score = 0;
      let matchedPatterns = [];

      for (const pattern of patterns) {
        if (pattern.test(text)) {
          score += 1;
          matchedPatterns.push(pattern.toString());
        }
      }

      scores[intent] = {
        score,
        matchedPatterns,
        normalized: score / patterns.length
      };
    }

    // Find primary intent
    let primary = null;
    let maxScore = -1;

    for (const [intent, data] of Object.entries(scores)) {
      if (data.score > maxScore) {
        maxScore = data.score;
        primary = intent;
      }
    }

    const confidence = maxScore > 0 ? Math.min(maxScore / 2, 1.0) : 0.1;

    return {
      primary,
      confidence,
      allScores: scores,
      reason: `Primary intent '${primary}' matched ${scores[primary].score} patterns. Confidence: ${confidence.toFixed(2)}`
    };
  }

  _detectMultiIntent(classification) {
    const sorted = Object.entries(classification.allScores)
      .filter(([_, data]) => data.score > 0)
      .sort((a, b) => b[1].score - a[1].score)
      .map(([intent, _]) => intent);

    return sorted.slice(0, 3); // Top 3 intents
  }

  _buildChain(intents) {
    // Define logical chains for multi-intent tasks
    const chains = {
      'diagnostic,estimate': ['diagnostic', 'estimate'],
      'diagnostic,parts': ['diagnostic', 'parts', 'estimate'],
      'estimate,parts': ['estimate', 'parts', 'buyer'],
      'prediction,estimate': ['prediction', 'estimate', 'scheduling']
    };

    const key = intents.slice(0, 2).join(',');
    return chains[key] || intents;
  }

  _buildPrompt(config, input, context) {
    let prompt = `TASK: ${config.name}\\n\\n`;
    prompt += `INPUT: ${input}\\n\\n`;

    if (context.vehicleProfile) {
      const v = context.vehicleProfile;
      prompt += `VEHICLE: ${v.year} ${v.make} ${v.model} (VIN: ${v.vin})\\n`;
      prompt += `MILEAGE: ${v.mileage} miles\\n`;
      prompt += `LAST_SERVICE: ${v.lastServiceDate || 'Unknown'}\\n`;
      if (v.faultCodes?.length) {
        prompt += `FAULT_CODES: ${v.faultCodes.join(', ')}\\n`;
      }
      prompt += `\\n`;
    }

    if (context.history) {
      prompt += `REPAIR_HISTORY: ${JSON.stringify(context.history.slice(-3))}\\n\\n`;
    }

    prompt += `Provide your analysis now.`;

    return prompt;
  }

  /**
   * Get all available specialists
   */
  getSpecialists() {
    return Object.entries(this.SPECIALISTS).map(([key, config]) => ({
      key,
      name: config.name,
      description: config.description,
      capabilities: config.capabilities,
      model: config.model
    }));
  }

  /**
   * Add a custom specialist (for white-label extensions)
   */
  registerSpecialist(key, config) {
    this.SPECIALISTS[key] = config;
  }
}

module.exports = new AISpecialistRouter();
