import { getEstimate, diagnose, getInvoice } from "./client";

// Helper tool to generate unique tracking IDs for sessions
const generateId = () => typeof crypto !== "undefined" && crypto.randomUUID 
  ? crypto.randomUUID() 
  : `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

export async function handleUiEstimateSubmission(formElements: {
  laborRateStr: string;
  partsCostStr: string;
  vin: string;
}) {
  try {
    const labor = parseFloat(formElements.laborRateStr) || 0;
    const parts = parseFloat(formElements.partsCostStr) || 0;
    
    if (!formElements.vin || formElements.vin.trim().length !== 17) {
      throw new Error("Invalid Input: VIN must be exactly 17 characters.");
    }

    // Fixed: Passing the required id down the line
    const estimateResult = await getEstimate({
      id: generateId(),
      labor,
      parts,
      vin: formElements.vin.toUpperCase().trim(),
    });

    return { success: true, data: estimateResult };
  } catch (error: any) {
    return { success: false, error: error.message || "Internal validation error." };
  }
}

export async function handleUiDiagnosticSubmission(uiState: {
  vin: string;
  year?: number;
  make?: string;
  trim?: string;
  customerSymptoms: string; 
  mechanicNotices: string;   
  rawCodes: string;          
}) {
  try {
    const obdCodes = uiState.rawCodes
      .split(",")
      .map(c => c.trim().toUpperCase())
      .filter(c => c.length > 0);

    const customerStates = uiState.customerSymptoms
      .split(",")
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const diagnosticResult = await diagnose({
      id: generateId(),
      vehicle: {
        year: uiState.year ? Number(uiState.year) : undefined,
        make: uiState.make?.trim() || undefined,
        trim: uiState.trim?.trim() || undefined
      },
      obdCodes,
      customerStates,
    });

    return { success: true, data: diagnosticResult };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

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

    const structuredPartsArray = [
      {
        name: "Job Parts Total",
        cost: Number(invoiceData.partsCost) || 0
      }
    ];

    const finalInvoice = await getInvoice({
      id: generateId(),
      customer: {
        name: invoiceData.name.trim(),
        phone: invoiceData.phone.replace(/\D/g, ""), 
      },
      vehicle: {
        year: Number(invoiceData.year),
        make: invoiceData.make.trim(),
        model: invoiceData.model.trim(),
        trim: invoiceData.trim.trim(),
      },
      labor: Number(invoiceData.laborRate),
      parts: structuredPartsArray,
      codes: codesArray,
    });

    return { success: true, data: finalInvoice };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
