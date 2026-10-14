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
  if (!Number.isInteger(status) || status < 100 || status > 599 ||
      row.response_content_type !== 'application/json') {
    const err = new Error('Invalid stored HTTP response metadata');
    err.code = 'DURABLE_RESPONSE_METADATA';
    throw err;
  }
  const bytes = decodePgBytea(row.response_bytes);
  res.status(status);
  res.setHeader('Content-Type', row.response_content_type);
  return res.send(bytes);
}
module.exports = { decodePgBytea, replayDurableResponse };
