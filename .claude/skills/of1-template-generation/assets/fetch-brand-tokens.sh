#!/usr/bin/env bash
# Fetch design tokens from brand-governance-agent for the of1 template generator.
#
# Reads from env:
#   BGA_API_URL       — base URL of brand-governance-agent
#   BGA_IMS_ORG_ID    — IMS org id
#   IMS_TOKEN         — IMS user token (may include "Bearer " prefix)
#
# Usage:
#   fetch-brand-tokens.sh <domain> <output-dir>
#
# Resolves the brand id from <domain>, then fetches design tokens for two
# segments (global, fr-under25) in both markdown and JSON formats. Writes:
#   <output-dir>/brand-info.json
#   <output-dir>/design-tokens-global.md
#   <output-dir>/design-tokens-global.json
#   <output-dir>/design-tokens-fr-under25.md
#   <output-dir>/design-tokens-fr-under25.json
#
# Exits 64 on usage error, 65 on prod URL refused, 1 on any other failure.

set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: $0 <domain> <output-dir>" >&2
  exit 64
fi

DOMAIN="$1"
OUTPUT_DIR="$2"

: "${BGA_API_URL:?BGA_API_URL is not set}"
: "${BGA_IMS_ORG_ID:?BGA_IMS_ORG_ID is not set}"
: "${IMS_TOKEN:?IMS_TOKEN is not set}"

case "$BGA_API_URL" in
  *prod.cloud.adobe.io*)
    echo "Refusing to run against prod URL ($BGA_API_URL) until cascade-db ships to prod." >&2
    exit 65
    ;;
esac

mkdir -p "$OUTPUT_DIR"

TOKEN="${IMS_TOKEN#Bearer }"
TOKEN="${TOKEN# }"
AUTH_HEADER="Authorization: Bearer ${TOKEN}"
API_KEY_HEADER="x-api-key: exc_app"
ORG_HEADER="x-gw-ims-org-id: ${BGA_IMS_ORG_ID}"

api_get() {
  local path="$1"
  local out="$2"
  local status
  status=$(curl -s -o "$out" -w "%{http_code}" \
    -H "$AUTH_HEADER" -H "$API_KEY_HEADER" -H "$ORG_HEADER" \
    "${BGA_API_URL}${path}")
  if [ "$status" != "200" ]; then
    echo "GET ${path} returned HTTP ${status}" >&2
    cat "$out" >&2 || true
    return 1
  fi
}

api_get "/api/v1/brands/from-url?url=https://${DOMAIN}" "${OUTPUT_DIR}/brand-info.json"
BRAND_ID=$(jq -r '.data.id // empty' "${OUTPUT_DIR}/brand-info.json")
if [ -z "$BRAND_ID" ]; then
  echo "Could not resolve brand id for domain ${DOMAIN}" >&2
  exit 1
fi
echo "Resolved brand: ${BRAND_ID}"

fetch_segment() {
  local slug="$1"
  local segment_json="$2"
  local encoded
  encoded=$(jq -rn --arg s "$segment_json" '$s|@uri')

  api_get "/api/v1/brands/${BRAND_ID}/contexts/computed/design_token.md?segment=${encoded}" \
    "${OUTPUT_DIR}/design-tokens-${slug}.md"
  api_get "/api/v1/brands/${BRAND_ID}/contexts/computed/design_token.json?segment=${encoded}" \
    "${OUTPUT_DIR}/design-tokens-${slug}.json"

  local color_count
  color_count=$(jq '[.. | objects | select(."$type" == "color") | select(."$value".hex)] | length' \
    "${OUTPUT_DIR}/design-tokens-${slug}.json")
  if [ "$color_count" -eq 0 ]; then
    echo "Segment ${slug} returned no color tokens" >&2
    exit 1
  fi
  echo "Segment ${slug}: ${color_count} color tokens"
}

fetch_segment "global" "{}"
fetch_segment "fr-under25" '{"country":"FR","audience":"under-25"}'

echo "Done: tokens written to ${OUTPUT_DIR}"
