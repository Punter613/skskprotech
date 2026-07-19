async function callAI(systemInstruction, data) {
    const { symptom, mechanic_notices } = data;

    const payload = {
        model: "gpt-4o",
        messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: `Symptom: ${symptom}. Mechanic Notices: ${mechanic_notices}` }
        ],
        temperature: 0.2
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const result = await response.json();
    return result.choices[0].message.content;
}

module.exports = callAI;
