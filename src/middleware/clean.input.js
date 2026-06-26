module.exports = (req, res, next) => {
  const body = req.body || {};
  req.sanitized = {
    vehicle: {
      year: parseInt(body.vehicle?.year) || 0,
      make: String(body.vehicle?.make || '').trim(),
      model: String(body.vehicle?.model || '').trim(),
      trim: String(body.vehicle?.trim || '').trim()
    },
    vin: String(body.vin || '').toUpperCase().trim(),
    mileage: Math.max(0, Number(body.mileage) || 0),
    obdCodes: Array.isArray(body.obdCodes) ? body.obdCodes.map(c => String(c).toUpperCase().trim()) : [],
    symptoms: [...(body.customerStates || []), ...(body.mechanicNotices || [])].map(s => String(s).toLowerCase().trim()),
    laborRate: Math.max(0, Number(body.laborRate) || 65),
    parts: Array.isArray(body.parts) ? body.parts.map(p => ({ name: String(p.name || ''), cost: Math.max(0, Number(p.cost) || 0) })) : [],
    partsCost: Math.max(0, Number(body.partsCost) || 0),
    customer: {
      name: String(body.customer?.name || 'Quick Quote Client').trim(),
      phone: String(body.customer?.phone || 'N/A').trim()
    }
  };
  next();
};
