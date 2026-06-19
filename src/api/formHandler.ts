import { getEstimate, diagnose, getInvoice } from "./client";

/**
 * Handles the raw UI form submission for the "Generate Estimate" button.
 * Takes the raw DOM strings or state, tightens the types, and fires the API.
 */
export async function handleUiEstimateSubmission(formElements: {
  laborRateStr: string;
  partsCostStr: string;
  vin: string;
}) {
  try {
    // 1. Structural Sanitation: Convert raw text inputs to strict numbers
    const labor = parseFloat(formElements.laborRateStr) || 0;
    const parts = parseFloat(formElements.partsCostStr) || 0;
    
    // 2. Validate standard parameters before firing across the wire
    if (!formElements.vin || formElements.vin.trim().length !== 17) {
      throw new Error("Invalid Input: VIN must be exactly 17 characters.");
    }

    console.log("⚡ Firing Type-Safe Estimate Request for VIN:", formElements.vin);
    
    // 3. Execute the hardened client path
    const estimateResult = await getEstimate({
      labor,
      parts,
      vin: formElements.vin.toUpperCase().trim(),
    });

    return { success: true, data: estimateResult };
  } catch (error: any) {
    console.error("❌ Estimate Generation Halted:", error.message || error);
    return { success: false, error: error.message || "Internal validation error." };
  }
}

/**
 * Handles the "Translate to Tech / Diagnose" workflow from the UI state.
 * Packages chaotic text boxes into clean, spec-compliant arrays.
 */
export async function handleUiDiagnosticSubmission(uiState: {
  vin: string;
  customerSymptoms: string; // "Dtc code says misfire 1,3,5"
  mechanicNotices: string;   // "No check engine light no hesitation"
  rawCodes: string;          // "P0300, P0171"
}) {
  try {
    // Clean up comma-separated fault codes into a strict string array
    const codesArray = uiState.rawCodes
      .split(",")
      .map(c => c.trim().toUpperCase())
      .filter(c => c.length > 0);

    // Combine symptoms or split them cleanly by line/comma
    const symptomsArray = uiState.customerSymptoms
      .split(",")
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log("🧠 Sending field data to Adversarial Diagnostic Check...");

    const diagnosticResult = await diagnose({
      vin: uiState.vin.toUpperCase().trim(),
      symptoms: symptomsArray,
      codes: codesArray,
      notes: uiState.mechanicNotices.trim() || undefined,
    });

    return { success: true, data: diagnosticResult };
  } catch (error: any) {
    console.error("❌ Diagnostic Processing Failed:", error.message || error);
    return { success: false, error: error.message };
  }
}

/**
 * Generates the final, billing-grade Invoice payload saved directly to Supabase.
 */
export async function handleUiInvoiceGeneration(invoiceData: {
  name: string;
  phone: string;
  email: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  laborRate: number;
  partsCost: number;
  rawCodes: string;
}) {
  try {
    const codesArray = invoiceData.rawCodes
      .split(",")
      .map(c => c.trim().toUpperCase())
      .filter(c => c.length > 0);

    const finalInvoice = await getInvoice({
      customer: {
        name: invoiceData.name.trim(),
        phone: invoiceData.phone.replace(/\D/g, ""), // strip non-digits to match spec
        email: invoiceData.email.trim(),
      },
      vehicle: {
        year: Number(invoiceData.year),
        make: invoiceData.make.trim(),
        model: invoiceData.model.trim(),
        trim: invoiceData.trim.trim(),
      },
      labor: Number(invoiceData.laborRate),
      parts: Number(invoiceData.partsCost),
      codes: codesArray,
    });

    return { success: true, data: finalInvoice };
  } catch (error: any) {
    console.error("❌ Invoice Processing Aborted:", error.message || error);
    return { success: false, error: error.message };
  }
}
