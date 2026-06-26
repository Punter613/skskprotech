/**
 * SKSK ProTech - Structural Ingestion Schema Validator
 * Enforces strict input contracts to prevent bad data from penetrating the pipeline.
 */

function validateDiagnosticPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('INGESTION_ERROR: Missing or malformed root payload object.');
  }

  // Ensure arrays exist and aren't flooded with junk data types
  const arrayFields = ['symptoms', 'codes', 'notes'];
  for (const field of arrayFields) {
    if (payload[field] !== undefined && !Array.isArray(payload[field])) {
      throw new Error(`SCHEMA_VIOLATION: Field '${field}' must be a valid array wrapper.`);
    }
  }

  if (payload.vehicle && typeof payload.vehicle !== 'object') {
    throw new Error('SCHEMA_VIOLATION: Structural field \'vehicle\' must be a valid object wrapper.');
  }

  // Enforce type restrictions on telemetry tracking digits
  if (payload.mileage !== undefined && isNaN(Number(payload.mileage))) {
    throw new Error('SCHEMA_VIOLATION: Telemetry field \'mileage\' must be a numeric value.');
  }

  if (payload.laborRate !== undefined && isNaN(Number(payload.laborRate))) {
    throw new Error('SCHEMA_VIOLATION: Field \'laborRate\' must be a numeric value.');
  }

  return true;
}

module.exports = { validateDiagnosticPayload };
