const Groq = require('groq-sdk');
const { generateForemanPrompt } = require('./aiForemanPrompt');

const apiKey = process.env.GROQ_API_KEY;
const groq = apiKey ? new Groq({ apiKey }) : null;

const processSingleEstimate = async ({ vehicle, notes }) => {
  if (!apiKey) {
    console.log('⚠️ [Estimator] Running in mock validation mode (No API Key detected).');
    return {
      calculated_severity: 'Needs Service',
      isolated_diagnostics: [
        { sub_system: 'Electrical', findings: 'Cylinder 2 misfire detected.', labor_hours_estimate: 1.5 },
        { sub_system: 'Braking', findings: 'Brake pads at 3mm with light scoring.', labor_hours_estimate: 2.0 }
      ]
    };
  }

  // normal Groq call here
};

module.exports = { processSingleEstimate };
