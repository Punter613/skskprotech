/**
 * SKSK ProTech - Estimation Helper Utilities
 */

function normalizeText(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function uniqueStrings(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.filter(s => typeof s === 'string' && s.length > 0))];
}

function clampNumber(val, min = 0, max = Infinity) {
  const num = Number(val);
  if (isNaN(num)) return min;
  return Math.max(min, Math.min(max, num));
}

function toFloat2(val) {
  const num = Number(val);
  return isNaN(num) ? 0.00 : parseFloat(num.toFixed(2));
}

function extractJSON(text) {
  if (!text) return null;
  try {
    // Attempt direct parse
    return JSON.parse(text);
  } catch (e) {
    // Look for JSON block
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (inner) {
        return null;
      }
    }
  }
  return null;
}

module.exports = {
  normalizeText,
  uniqueStrings,
  clampNumber,
  toFloat2,
  extractJSON
};
