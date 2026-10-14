'use strict';

// PostgreSQL bytea over PostgREST is represented as a backslash-x hex string.
// Refuse unknown formats rather than returning corrupted diagnostic evidence.
function decodePgBytea(value) {
  if (typeof value !== 'string' || !value.startsWith(String.fromCharCode(92) + 'x')) {
    const err = new Error('Unexpected stored response encoding');
    err.code = 'DURABLE_RESPONSE_ENCODING';
    throw err;
  }
  const hex = value.slice(2);
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) {
    const err = new Error('Invalid stored response bytes');
    err.code = 'DURABLE_RESPONSE_ENCODING';
    throw err;
  }
  return Buffer.from(hex, 'hex');
}
function replayDurableResponse(res, row) {
  const status = row?.http_status;
  // A terminal diagnosis always has a JSON entity body. 1xx, 204, 205,
  // and 304 cannot carry it; accepting them would silently drop replay bytes.
  if (!Number.isInteger(status) || status < 200 || status > 599 ||
      status === 204 || status === 205 || status === 304 ||
      row.response_content_type !== 'application/json') {
    const err = new Error('Invalid stored HTTP response metadata');
    err.code = 'DURABLE_RESPONSE_METADATA';
    throw err;
  }
  const bytes = decodePgBytea(row.response_bytes);
  // Terminal responses must be JSON, not merely tagged as JSON. Reject
  // corruption before writing headers or emitting any bytes to the client.
  try {
    const parsed = JSON.parse(bytes.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Not an object');
  } catch (_) {
    const err = new Error('Stored diagnosis response is not valid JSON');
    err.code = 'DURABLE_RESPONSE_ENCODING';
    throw err;
  }
  res.status(status);
  res.setHeader('Content-Type', row.response_content_type);
  return res.send(bytes);
}
module.exports = { decodePgBytea, replayDurableResponse };
