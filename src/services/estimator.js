const Groq = require('groq-sdk');
const { generateForemanPrompt } = require('./aiForemanPrompt');

// Initialize client with project fallback parameters
const apiKey = process.env.GROQ_API_KEY;
const groq = new Groq({ apiKey: apiKey || 'mock_key_placeholder' });

const processSingleEstimate = async ({ vehicle, notes }) => {
  if (!apiKey) {
    console.log("⚠️ [Estimator] Running in mock validation mode (No API Key detected).");
    return {
      calculated_severity: "Needs Service",
      isolated_diagnostics: [
        { sub_system: "Electrical", findings: "Cylinder 2 misfire detected.", labor_hours_estimate: 1.5 },
        { sub_system: "Braking", findings: "Brake pads at 3mm with light scoring.", labor_hours_estimate: 2.0 }
      ],
      predictive_horizon: { predicted_failure_window: "30 Days", primary_risk_component: "Spark Plugs / Ignition Coil", confidence_score: 0.95, preventative_action_steps: ["Replace plugs", "Inspect rotors"] }
    };
  }

  const prompts = generateForemanPrompt(vehicle, notes);

  const chatCompletion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: prompts.system },
      { role: 'user', content: prompts.user }
    ],
    model: 'llama3-8b-8192',
    temperature: 0.1,
    response_format: { type: "json_object" }
  });

  return JSON.parse(chatCompletion.choices[0].message.content.trim());
};

module.exports = { processSingleEstimate };
