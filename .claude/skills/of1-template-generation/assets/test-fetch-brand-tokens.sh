#!/usr/bin/env bash
# Live smoke test for fetch-brand-tokens.sh against the stage cluster.
# Requires IMS_TOKEN to be set in the environment (Bearer prefix tolerated).
# Exits 0 if all cases pass, non-zero with descriptive output otherwise.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FETCH="${SCRIPT_DIR}/fetch-brand-tokens.sh"

BGA_API_URL="${BGA_API_URL:-https://adobe-aem-foundation-brand-governance-agent-deploy-022a47.stage.cloud.adobe.io}"
BGA_IMS_ORG_ID="${BGA_IMS_ORG_ID:-2A530A165FFED7AE0A494011@AdobeOrg}"

if [ -z "${IMS_TOKEN:-}" ]; then
  echo "FAIL: IMS_TOKEN is not set; cannot run live smoke test" >&2
  exit 1
fi

pass=0
fail=0

assert_exit() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "PASS: $label (exit=$actual)"
    pass=$((pass + 1))
  else
    echo "FAIL: $label (expected exit=$expected, got $actual)" >&2
    fail=$((fail + 1))
  fi
}

# Case 1: happy path against frescopa (frescopa.coffee is the canonical stage brand for this demo)
TMP1=$(mktemp -d)
STDERR1=$(mktemp)
BGA_API_URL="$BGA_API_URL" BGA_IMS_ORG_ID="$BGA_IMS_ORG_ID" IMS_TOKEN="$IMS_TOKEN" \
  "$FETCH" frescopa.coffee "$TMP1" >/dev/null 2>"$STDERR1"
rc=$?
if [ $rc -ne 0 ]; then
  echo "FAIL: happy path frescopa.coffee (expected exit=0, got $rc)" >&2
  echo "--- fetch-brand-tokens.sh stderr ---" >&2
  cat "$STDERR1" >&2
  echo "--- end stderr ---" >&2
  fail=$((fail + 1))
else
  echo "PASS: happy path frescopa.coffee (exit=0)"
  pass=$((pass + 1))
fi
rm -f "$STDERR1"

# Check artifacts exist and are non-empty
for f in brand-info.json design-tokens-global.md design-tokens-global.json design-tokens-fr-under25.md design-tokens-fr-under25.json; do
  if [ ! -s "${TMP1}/${f}" ]; then
    echo "FAIL: expected artifact ${TMP1}/${f} missing or empty" >&2
    fail=$((fail + 1))
  else
    echo "PASS: artifact ${f} exists and is non-empty"
    pass=$((pass + 1))
  fi
done

# Check JSON contains at least one color.*.hex
hex_count=$(jq '[.. | objects | select(."$type" == "color") | select(."$value".hex)] | length' "${TMP1}/design-tokens-global.json")
if [ "$hex_count" -ge 3 ]; then
  echo "PASS: global JSON has ${hex_count} colors with hex values"
  pass=$((pass + 1))
else
  echo "FAIL: expected >=3 colors in global tokens, got ${hex_count}" >&2
  fail=$((fail + 1))
fi
rm -rf "$TMP1"

# Case 2: missing IMS_TOKEN (exit code from ${VAR:?} is bash-version-dependent; just require non-zero)
TMP2=$(mktemp -d)
(unset IMS_TOKEN; BGA_API_URL="$BGA_API_URL" BGA_IMS_ORG_ID="$BGA_IMS_ORG_ID" "$FETCH" frescopa.coffee "$TMP2" >/dev/null 2>&1)
rc=$?
if [ $rc -ne 0 ]; then
  echo "PASS: missing IMS_TOKEN fails with exit=$rc"
  pass=$((pass + 1))
else
  echo "FAIL: missing IMS_TOKEN should have failed but exited 0" >&2
  fail=$((fail + 1))
fi
rm -rf "$TMP2"

# Case 3: prod URL refused
TMP3=$(mktemp -d)
BGA_API_URL="https://something.prod.cloud.adobe.io" BGA_IMS_ORG_ID="$BGA_IMS_ORG_ID" IMS_TOKEN="$IMS_TOKEN" \
  "$FETCH" frescopa.coffee "$TMP3" >/dev/null 2>&1
assert_exit "prod URL refused" 65 $?
rm -rf "$TMP3"

# Case 4: unknown domain → 404 from brand resolution
TMP4=$(mktemp -d)
BGA_API_URL="$BGA_API_URL" BGA_IMS_ORG_ID="$BGA_IMS_ORG_ID" IMS_TOKEN="$IMS_TOKEN" \
  "$FETCH" definitely-not-a-real-domain.invalid "$TMP4" >/dev/null 2>&1
rc=$?
if [ $rc -ne 0 ]; then
  echo "PASS: unknown domain fails with exit=$rc"
  pass=$((pass + 1))
else
  echo "FAIL: unknown domain should have failed but exited 0" >&2
  fail=$((fail + 1))
fi
rm -rf "$TMP4"

echo ""
echo "Results: ${pass} passed, ${fail} failed"
exit $fail
