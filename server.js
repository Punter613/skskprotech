// ========================================
// ZOD VALIDATION
// ========================================
const DiagnosticSchema = z.object({
  customer: z.object({
    name: z.string().min(1),
    phone: z.string().optional().default(""),
    email: z.string().optional().default("")
  }),
  vehicle: z.any(), // Accept string OR object
  obdCodes: z.array(z.string()).optional().default([]),
  customerStates: z.array(z.string()).optional().default([]),
  mechanicNotices: z.array(z.string()).optional().default([]),
  laborRate: z.number().optional().default(DEFAULT_LABOR_RATE)
});

// ========================================
// 1. DIAGNOSE PHASE
// ========================================
app.post('/api/diagnose', async (req, res) => {
  try {
    const parsed = DiagnosticSchema.parse(req.body);
    const vehicle = normalizeVehicle(parsed.vehicle);

    const jobRecord = {
      customer: parsed.customer,
      vehicle,
      obd_codes: parsed.obdCodes,
      customer_states: parsed.customerStates,
      mechanic_notices: parsed.mechanicNotices,
      labor_rate: parsed.laborRate,
      state: "diagnosed",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let saved = jobRecord;
    if (supabase) {
      const { data, error } = await supabase.from("jobs").insert(jobRecord).select().single();
      if (!error) saved = data;
    }

    res.json({ success: true, job: saved });
  } catch (err) {
    console.error("[DIAGNOSE FAIL]", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================================
// 2. ESTIMATE PHASE
// ========================================
app.post('/api/estimate', async (req, res) => {
  try {
    const { jobId, incomingPayload } = req.body;

    let payload = incomingPayload;

    if (jobId && supabase) {
      const { data } = await supabase.from("jobs").select("*").eq("id", jobId).single();
      payload = {
        customer: data.customer,
        vehicle: data.vehicle,
        obdCodes: data.obd_codes,
        customerStates: data.customer_states,
        mechanicNotices: data.mechanic_notices,
        laborRate: data.labor_rate
      };
    }

    const validated = DiagnosticSchema.parse(payload);
    const prompt = buildPrompt(validated);

    const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "Return JSON only." },
          { role: "user", content: prompt }
        ],
        max_tokens: 2000,
        temperature: 0.1
      })
    });

    const raw = await aiRes.json();
    let text = raw.choices?.[0]?.message?.content || "";
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    const ai = JSON.parse(text);

    // BUSINESS CALCULATIONS
    const laborTotal = Number((ai.laborHours * ai.laborRate).toFixed(2));
    const partsTotal = ai.parts.reduce((s, p) => s + Number(p.cost || 0), 0);
    const shopSupplies = Number((partsTotal * (ai.shopSuppliesPercent / 100)).toFixed(2));
    const subtotal = laborTotal + partsTotal + shopSupplies;
    const tax = Number((subtotal * 0.28).toFixed(2));
    const grandTotal = subtotal;

    const estimate = {
      ...ai,
      laborTotal,
      partsTotal,
      shopSupplies,
      subtotal,
      tax,
      grandTotal,
      customer: validated.customer,
      vehicle: normalizeVehicle(validated.vehicle)
    };

    if (jobId && supabase) {
      await supabase.from("jobs").update({
        estimate,
        state: "estimated",
        updated_at: new Date().toISOString()
      }).eq("id", jobId);
    }

    res.json({ success: true, estimate });
  } catch (err) {
    console.error("[ESTIMATE FAIL]", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================================
// 3. INVOICE PHASE
// ========================================
app.post('/api/invoice', async (req, res) => {
  try {
    const { jobId, estimate } = req.body;

    let est = estimate;

    if (!est && jobId && supabase) {
      const { data } = await supabase.from("jobs").select("estimate").eq("id", jobId).single();
      est = data.estimate;
    }

    if (!est) return res.status(400).json({ success: false, error: "No estimate found." });

    const invoice = {
      ...est,
      type: "invoice",
      timestamp: new Date().toISOString(),
      taxSetaside: Number((est.subtotal * 0.28).toFixed(2)),
      takeHomePay: Number((est.subtotal * 0.72).toFixed(2)),
      balance: 0,
      footer: "Thank you for choosing SKSK ProTech!"
    };

    if (jobId && supabase) {
      await supabase.from("jobs").update({
        invoice,
        state: "completed",
        updated_at: new Date().toISOString()
      }).eq("id", jobId);
    }

    res.json({ success: true, invoice });
  } catch (err) {
    console.error("[INVOICE FAIL]", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================================
// STRIPE (Disabled but wired)
// ========================================
if (STRIPE_ENABLED) {
  app.post("/api/pay", async (req, res) => {
    try {
      const { amount, payment_method_id } = req.body;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: "usd",
        payment_method: payment_method_id,
        confirm: true
      });

      res.json({ success: true, paymentIntent });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}

// ========================================
// SERVER START
// ========================================
app.listen(PORT, () => {
  console.log(`🔥 SKSK ProTech Backend Online — Port ${PORT}`);
});
