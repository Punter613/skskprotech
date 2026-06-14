function decodeVinBasic(vin) {
  if (!vin || typeof vin !== 'string') return null;
  const clean = vin.trim().toUpperCase();
  if (clean.length !== 17) return null;

  return {
    vin: clean,
    year: '',
    make: '',
    model: '',
    trim: '',
    source: 'basic-stub'
  };
}

async function decodeVin(vin) {
  const basic = decodeVinBasic(vin);
  return basic;
}

module.exports = { decodeVinBasic, decodeVin };
