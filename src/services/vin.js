/**
 * VIN Decoder - Extracts vehicle information from 17-character VIN
 * Uses NHTSA API for full decoding, falls back to local parsing
 */
const https = require('https');

// VIN Position 10: Model Year decoding table
const YEAR_CODES = {
  A: 2010, B: 2011, C: 2012, D: 2013, E: 2014, F: 2015,
  G: 2016, H: 2017, J: 2018, K: 2019, L: 2020, M: 2021,
  N: 2022, P: 2023, R: 2024, S: 2025, T: 2026, V: 2027,
  W: 2028, X: 2029, Y: 2030, 1: 2001, 2: 2002, 3: 2003,
  4: 2004, 5: 2005, 6: 2006, 7: 2007, 8: 2008, 9: 2009
};

// WMI (positions 1-3) to manufacturer mapping (common ones)
const WMI_MAP = {
  '1FT': 'Ford', '1FM': 'Ford', '1F9': 'Ford', '2FT': 'Ford (Canada)',
  '1GC': 'Chevrolet', '1GN': 'Chevrolet', '2GC': 'Chevrolet (Canada)',
  '1G1': 'Chevrolet', '1G2': 'Pontiac', '1G6': 'Cadillac',
  '1C3': 'Chrysler', '1C4': 'Chrysler', '1C6': 'Chrysler',
  '1D3': 'Dodge', '1D4': 'Dodge', '1D7': 'Dodge',
  '2T1': 'Toyota (Canada)', '2T2': 'Lexus (Canada)', 'JT2': 'Toyota',
  'JT3': 'Toyota', 'JT4': 'Toyota', 'JT6': 'Lexus', 'JT8': 'Lexus',
  'JTD': 'Toyota', 'JTE': 'Toyota', 'JTH': 'Lexus', 'JTK': 'Scion',
  'JTL': 'Scion', 'JTM': 'Toyota', 'JTN': 'Toyota',
  '19X': 'Honda', '1HG': 'Honda', '2HG': 'Honda (Canada)',
  'JHM': 'Honda', 'JHN': 'Honda', 'JH4': 'Acura',
  '3VW': 'Volkswagen', 'WVW': 'Volkswagen', 'WVG': 'Volkswagen',
  'WBA': 'BMW', 'WBS': 'BMW M', 'WBX': 'BMW',
  'WDC': 'Mercedes-Benz', 'WDD': 'Mercedes-Benz', 'WME': 'Smart',
  'WUA': 'Audi', 'WAU': 'Audi', 'TRU': 'Audi (Hungary)',
  'ZAM': 'Maserati', 'ZAR': 'Alfa Romeo', 'ZFA': 'Fiat',
  'ZFF': 'Ferrari', 'SAL': 'Land Rover', 'SAR': 'Rover',
  'SAJ': 'Jaguar', 'KNM': 'Hyundai (Korea)', 'KMH': 'Hyundai',
  'KNA': 'Kia', 'KND': 'Kia', '5XY': 'Kia (USA)',
  '5N1': 'Hyundai (USA)', 'KM8': 'Hyundai', 'MAL': 'Mitsubishi',
  'JA4': 'Mitsubishi', 'JA3': 'Mitsubishi',
  'JF1': 'Subaru', 'JF2': 'Subaru', '4S3': 'Subaru (USA)',
  '4S4': 'Subaru (USA)', 'JN1': 'Nissan', 'JN6': 'Nissan',
  '1N4': 'Nissan', '1N6': 'Nissan', '3N1': 'Nissan (Mexico)',
  'ML3': 'Morgan', 'SCC': 'Lotus', 'TMB': 'Skoda',
  'UU1': 'Dacia', 'VF1': 'Renault', 'VF3': 'Peugeot',
  'VF7': 'Citroen', 'VSS': 'SEAT', 'YV1': 'Volvo',
  'LV4': 'Volvo (China)', 'LWG': 'Volvo (China)',
  'LH1': 'Volvo', 'LPH': 'Volvo', 'MLC': 'Suzuki',
  'JS1': 'Suzuki', 'JS2': 'Suzuki', 'JS3': 'Suzuki',
  'JA7': 'Suzuki', 'JSA': 'Suzuki', 'JST': 'Suzuki',
  'JT5': 'Suzuki', 'JY3': 'Suzuki', 'MHR': 'Suzuki (Thailand)',
  'MA3': 'Suzuki (India)', 'MBH': 'Suzuki (India)',
  '1F9': 'Freightliner', '1FU': 'Freightliner',
  '1FV': 'Freightliner', '1F': 'Ford', '1G': 'GM',
  '1H': 'Honda USA', '1J': 'Jeep', '1M': 'Mazda',
  '1N': 'Nissan USA', '1V': 'Volkswagen USA',
  '2G': 'GM Canada', '2H': 'Honda Canada',
  '3F': 'Ford Mexico', '3G': 'GM Mexico',
  '4F': 'Mazda USA', '4M': 'Mercury',
  '5F': 'Honda USA', '5L': 'Lincoln',
  '5T': 'Toyota USA', '5U': 'BMW USA',
  '5X': 'Hyundai USA', '5Y': 'Toyota USA',
  '6F': 'Ford Australia', '6G': 'Holden',
  '6H': 'GM Brazil', '8A': 'Fiat Brazil',
  '8G': 'GM Chile', '9B': 'Toyota Brazil',
  '9F': 'Ford Brazil', 'J87': 'Isuzu',
  'JA7': 'Isuzu', 'JAB': 'Isuzu', 'JAC': 'Isuzu',
  'JAL': 'Isuzu', 'JAM': 'Isuzu', 'JAN': 'Isuzu',
  'JCA': 'Isuzu', 'JCB': 'Isuzu', 'JCC': 'Isuzu',
  'JDA': 'Isuzu', 'JDF': 'Isuzu', 'JDM': 'Isuzu',
  'JDN': 'Isuzu', 'JDS': 'Isuzu', 'JDT': 'Isuzu',
  'JMB': 'Isuzu', 'JML': 'Isuzu', 'JMR': 'Isuzu',
  'JSA': 'Isuzu', 'JT5': 'Isuzu', 'JTC': 'Isuzu',
  'JTD': 'Isuzu', 'JTE': 'Isuzu', 'JTF': 'Isuzu',
  'JTG': 'Isuzu', 'JTH': 'Isuzu', 'JTJ': 'Isuzu',
  'JTK': 'Isuzu', 'JTL': 'Isuzu', 'JTM': 'Isuzu',
  'JTN': 'Isuzu'
};

function validateVin(vin) {
  if (!vin || typeof vin !== 'string') return null;
  const clean = vin.trim().toUpperCase();
  // Allow 17 chars (standard) or 11-17 (partial)
  if (clean.length < 11 || clean.length > 17) return null;
  // VIN uses only valid characters (no I, O, Q)
  if (!/^[A-HJ-NPR-Z0-9]+$/.test(clean)) return null;
  return clean;
}

function decodeVinBasic(vin) {
  const clean = validateVin(vin);
  if (!clean) return null;

  const wmi = clean.substring(0, 3);
  const yearCode = clean.length >= 10 ? clean.charAt(9) : null;

  // Find best matching manufacturer
  let make = null;
  if (WMI_MAP[wmi]) {
    make = WMI_MAP[wmi];
  } else {
    // Try first 2 chars
    const wmi2 = clean.substring(0, 2);
    if (WMI_MAP[wmi2]) {
      make = WMI_MAP[wmi2];
    }
  }

  return {
    vin: clean,
    year: yearCode && YEAR_CODES[yearCode] ? String(YEAR_CODES[yearCode]) : '',
    make: make || '',
    model: '',
    trim: '',
    source: 'local-decode'
  };
}

/** Decode VIN using NHTSA API, falls back to local decoding */
async function decodeVin(vin) {
  const clean = validateVin(vin);
  if (!clean) return null;

  // Try NHTSA API first
  try {
    const result = await fetchNhtsa(clean);
    if (result && (result.make || result.model)) {
      return { ...result, source: 'nhtsa-api' };
    }
  } catch (err) {
    console.warn('[VIN] NHTSA lookup failed:', err.message);
  }

  return decodeVinBasic(vin);
}

function fetchNhtsa(vin) {
  return new Promise((resolve, reject) => {
    const req = https.get({
      hostname: 'vpic.nhtsa.dot.gov',
      path: `/api/vehicles/decodevinvalues/${vin}?format=json`,
      timeout: 10000,
      headers: { 'Accept': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const vals = parsed?.Results?.[0];
          if (!vals) return resolve(null);

          resolve({
            vin: vin,
            year: vals.ModelYear || '',
            make: vals.Make || '',
            model: vals.Model || '',
            trim: vals.Trim || '',
            bodyClass: vals.BodyClass || '',
            engineCylinders: vals.EngineCylinders || '',
            engineHP: vals.EngineHP || '',
            fuelType: vals.FuelTypePrimary || '',
            source: 'nhtsa-api'
          });
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('NHTSA timeout')); });
  });
}

module.exports = { decodeVinBasic, decodeVin, validateVin };
