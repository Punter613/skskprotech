
// --- SKSK ProTech Diagnostic Logic Gate ---
app.post('/api/generate-estimate', async (req, res) => {
    const { vin, symptom, mechanic_notices, history } = req.body;

    const systemInstruction = `
        You are a master mechanic's diagnostic scribe.
        Analyze the following SYMPTOM and MECHANIC_NOTICES.
        ABSOLUTELY IGNORE the following FAILED_REPAIRS: ${JSON.stringify(history)}.
        Use 3-sigma deviation analysis: Filter out common/easy fixes (brakes/pads)
        and prioritize deep-mechanical anomalies (bearings, TC, gearbox).
        If the input is vague, ask for specific measurements instead of guessing.
    `;

    try {
        const aiResponse = await callAI(systemInstruction, { symptom, mechanic_notices });
        res.json({ success: true, diagnosis: aiResponse });
    } catch (err) {
        res.status(500).json({ success: false, error: "Logic gate failure: " + err.message });
    }
});

// --- SKSK ProTech Diagnostic Logic Gate ---
app.post('/api/generate-estimate', async (req, res) => {
    const { vin, symptom, mechanic_notices, history } = req.body;

    const systemInstruction = `
        You are a master mechanic's diagnostic scribe.
        Analyze the following SYMPTOM and MECHANIC_NOTICES.
        ABSOLUTELY IGNORE the following FAILED_REPAIRS: ${JSON.stringify(history)}.
        Use 3-sigma deviation analysis: Filter out common/easy fixes (brakes/pads)
        and prioritize deep-mechanical anomalies (bearings, TC, gearbox).
        If the input is vague, ask for specific measurements instead of guessing.
    `;

    try {
        const aiResponse = await callAI(systemInstruction, { symptom, mechanic_notices });
        res.json({ success: true, diagnosis: aiResponse });
    } catch (err) {
        res.status(500).json({ success: false, error: "Logic gate failure: " + err.message });
    }
});
