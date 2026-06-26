#!/usr/bin/env bash
# =============================================================================
# SKSK ProTech — Refined Production CI Smoke Test
# Validated for exact schema and payload array alignment.
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

pass() { echo -e "${GREEN}  ✔  $*${RESET}"; }
fail() { echo -e "${RED}  ✘  $*${RESET}"; FAILURES=$((FAILURES + 1)); }
info() { echo -e "${CYAN}  ℹ  $*${RESET}"; }
warn() { echo -e "${YELLOW}  ⚠  $*${RESET}"; }
section() { echo -e "\n${BOLD}${CYAN}══ $* ══${RESET}"; }

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
MAX_RETRIES="${MAX_RETRIES:-5}"
RETRY_DELAY="${RETRY_DELAY:-5}"
PDF_OUT="${PDF_OUT:-/tmp/invoice_smoke.pdf}"
FAILURES=0

for cmd in curl jq; do
  command -v "$cmd" &>/dev/null || { echo -e "${RED}Missing dependency: $cmd${RESET}"; exit 2; }
done

# Aligned Perfectly to SKSK Sanitization and OpenAPI Specifications
INVOICE_PAYLOAD='{
  "customer": { "name": "Johnny Castaway", "phone": "330-555-0199" },
  "vehicle": { "year": 2012, "make": "Ram", "model": "1500", "trim": "Laramie 5.7L" },
  "mileage": 142500,
  "obdCodes": ["P0303"],
  "symptoms": ["Lifter Tick", "Misfire under load"],
  "laborRate": 85,
  "estimatedHours": 12.0,
  "partsCost": 485.50,
  "parts": [
    { "name": "Mopar Camshaft (53022263AF)", "cost": 225.00 },
    { "name": "Mopar MDS Lifter Yoke Set", "cost": 260.50 }
  ]
}'

DIAGNOSE_PAYLOAD='{
  "vehicle": { "year": 2012, "make": "Ram", "trim": "hemi" },
  "obdCodes": ["P0303"],
  "customerStates": ["lifter tick", "misfire"]
}'

ESTIMATE_PAYLOAD='{
  "vehicle": { "year": 2012, "make": "Ram", "trim": "hemi" },
  "obdCodes": ["P0303"],
  "jobContext": { "urgency": "standard" }
}'

section "Service Warm-Up"
info "Target: ${API_BASE_URL}"
READY=false
for i in $(seq 1 "$MAX_RETRIES"); do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${API_BASE_URL}/health" 2>/dev/null || true)
  if [[ "$HTTP" =~ ^(200|204|404)$ ]]; then
    pass "API reachable (HTTP $HTTP) on attempt $i"
    READY=true
    break
  fi
  warn "Attempt $i/$MAX_RETRIES — got HTTP '${HTTP:-000}', retrying in ${RETRY_DELAY}s…"
  sleep "$RETRY_DELAY"
done
if [[ "$READY" == false ]]; then
  fail "API unreachable after $MAX_RETRIES attempts. Aborting."
  exit 1
fi

section "Test 1: POST /api/invoice"
INVOICE_RESP_FILE="$(mktemp)"
INVOICE_HEADERS_FILE="$(mktemp)"
HTTP_INVOICE=$(curl -s \
  -o "$INVOICE_RESP_FILE" \
  -D "$INVOICE_HEADERS_FILE" \
  -w "%{http_code}" \
  --max-time 30 \
  -X POST "${API_BASE_URL}/api/invoice" \
  -H "Content-Type: application/json" \
  -d "$INVOICE_PAYLOAD" 2>/dev/null || echo "000")

if [[ "$HTTP_INVOICE" == "200" ]]; then
  pass "Status 200 OK"
else
  fail "Expected 200, got ${HTTP_INVOICE}"
  info "Body: $(head -c 500 "$INVOICE_RESP_FILE")"
fi

CT=$(grep -i "^content-type:" "$INVOICE_HEADERS_FILE" | head -1 | tr -d '\r' | awk '{print $2}' || true)
if [[ "$CT" == application/pdf* ]]; then
  pass "Content-Type matches PDF output layout: ${CT}"
else
  fail "Expected application/pdf, got '${CT}'"
fi

if [[ "$HTTP_INVOICE" == "200" ]]; then
  cp "$INVOICE_RESP_FILE" "$PDF_OUT"
  PDF_SIZE=$(wc -c < "$PDF_OUT" | tr -d ' ')
  if [[ "$PDF_SIZE" -gt 100 ]] && head -c 4 "$PDF_OUT" | grep -q "%PDF"; then
    pass "Invoice PDF saved → ${PDF_OUT} (${PDF_SIZE} bytes, valid PDF header)"
  else
    fail "Saved file does not appear to be a valid PDF (size=${PDF_SIZE})"
  fi
fi
rm -f "$INVOICE_RESP_FILE" "$INVOICE_HEADERS_FILE"

section "Test 2: POST /api/diagnose"
DIAGNOSE_RESP_FILE="$(mktemp)"
HTTP_DIAGNOSE=$(curl -s \
  -o "$DIAGNOSE_RESP_FILE" \
  -w "%{http_code}" \
  --max-time 30 \
  -X POST "${API_BASE_URL}/api/diagnose" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "$DIAGNOSE_PAYLOAD" 2>/dev/null || echo "000")

if [[ "$HTTP_DIAGNOSE" == "200" ]]; then
  pass "Status 200 OK"
else
  fail "Expected 200, got ${HTTP_DIAGNOSE}"
  info "Body: $(head -c 500 "$DIAGNOSE_RESP_FILE")"
fi

if jq -e . "$DIAGNOSE_RESP_FILE" &>/dev/null; then
  pass "Response is valid JSON"
  # Support tracking fallback trace objects in base arrays or traceLog wrappers
  if jq -e 'has("trace") or (.traceLog != null)' "$DIAGNOSE_RESP_FILE" &>/dev/null; then
    pass "'trace' structural signature located."
  else
    fail "'trace' field missing from /api/diagnose response"
  fi
else
  fail "Response is not valid JSON"; info "Raw: $(head -c 500 "$DIAGNOSE_RESP_FILE")"
fi
rm -f "$DIAGNOSE_RESP_FILE"

section "Test 3a: POST /api/estimateHeuristic — no token (expect 401/403)"
HEURISTIC_NO_AUTH_RESP="$(mktemp)"
HTTP_HEURISTIC_NOAUTH=$(curl -s \
  -o "$HEURISTIC_NO_AUTH_RESP" \
  -w "%{http_code}" \
  --max-time 30 \
  -X POST "${API_BASE_URL}/api/estimateHeuristic" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "$ESTIMATE_PAYLOAD" 2>/dev/null || echo "000")

if [[ "$HTTP_HEURISTIC_NOAUTH" == "401" || "$HTTP_HEURISTIC_NOAUTH" == "403" ]]; then
  pass "Protected endpoint securely deflected request with HTTP ${HTTP_HEURISTIC_NOAUTH}"
else
  fail "Security breach or path mismatch: Expected 401 or 403 without token, got ${HTTP_HEURISTIC_NOAUTH}"
fi
rm -f "$HEURISTIC_NO_AUTH_RESP"

section "Test 3b: POST /api/estimateHeuristic — with TOKEN"
if [[ -z "${TOKEN:-}" ]]; then
  warn "TOKEN environment variable not set — skipping authenticated route verification pass."
else
  HEURISTIC_AUTH_RESP="$(mktemp)"
  HTTP_HEURISTIC_AUTH=$(curl -s \
    -o "$HEURISTIC_AUTH_RESP" \
    -w "%{http_code}" \
    --max-time 30 \
    -X POST "${API_BASE_URL}/api/estimateHeuristic" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -H "Authorization: Bearer ${TOKEN}" \
    -d "$ESTIMATE_PAYLOAD" 2>/dev/null || echo "000")

  if [[ "$HTTP_HEURISTIC_AUTH" == "200" ]]; then
    pass "Status 200 OK with verified signature"
  else
    fail "Expected 200 with TOKEN, got ${HTTP_HEURISTIC_AUTH}"
    info "Body: $(head -c 500 "$HEURISTIC_AUTH_RESP")"
  fi
  rm -f "$HEURISTIC_AUTH_RESP"
fi

section "Smoke Test Summary"
if [[ "$FAILURES" -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  All automation assertions cleared green.${RESET}"; exit 0
else
  echo -e "${RED}${BOLD}  ${FAILURES} tracking assertions FAILED.${RESET}"; exit 1
fi
