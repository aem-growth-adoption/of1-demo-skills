#!/usr/bin/env bash
# of1-setup-cc verifier. Checks all prerequisites for the OF1 demo pipeline.
# Exit 0 = all good; exit 1 = something blocking is missing.
# Side effect: writes <stateDir>/setup-cc.json with resolved paths on success.
#
# Env overrides:
#   OF1_DEMO_REPO     REQUIRED path to a local clone of aem-growth-adoption/of1-demo.
#                     The verifier does not search for it — the orchestrator asks the
#                     user where to clone if unset, then sets this env var.
#   ADOBE_IMS_TOKEN   raw token value (highest priority; preferred for CC)
#   OF1_TOKEN_FILE    path to a token file (shape: {"access_token":"..."})
#   OF1_STATE_DIR     default: $PWD/.of1/state
#   STRICT            if =1, warnings become errors (default: 0)
#
# Token resolution order:
#   1. $ADOBE_IMS_TOKEN (env var with the raw value)
#   2. $OF1_TOKEN_FILE  (env var pointing at a file)
#   3. $PWD/.hlx/.da-token.json
#   4. $OF1_DEMO_REPO/.hlx/.da-token.json

set -u

FAIL=0
WARN=0
LOG=()

ok()   { LOG+=("✓ $1"); }
warn() { LOG+=("⚠ $1"); WARN=$((WARN+1)); [ "${STRICT:-0}" = "1" ] && FAIL=$((FAIL+1)); }
fail() { LOG+=("✗ $1"); FAIL=$((FAIL+1)); }

# ---------- 1. OF1 step skills (project- or user-scoped) ----------

REQUIRED_SKILLS=(
  of1-branch-setup of1-discovery of1-extraction of1-prototype
  of1-snowflake of1-template-generation of1-generative-block-styler
  of1-brand-voice-extractor of1-content-metadata of1-quick-suggestions
  of1-cta-template-builder of1-config-review of1-deploy
)

MISSING=()
for S in "${REQUIRED_SKILLS[@]}"; do
  found=$(find "$HOME/.claude" "$PWD/.claude" -path "*/skills/$S/SKILL.md" 2>/dev/null | head -1)
  [ -n "$found" ] || MISSING+=("$S")
done
if [ ${#MISSING[@]} -eq 0 ]; then
  ok "All 13 OF1 step skills present"
else
  fail "Missing OF1 step skills: ${MISSING[*]} — fix: /plugin install of1-demo-skills@<marketplace>"
fi

# ---------- 2. Adobe EDS skills: stardust + snowflake + impeccable ----------
# IMPORTANT: ignore matches inside the of1-demo content repo — those are legacy
# and should be removed (per project owner). Only count plugin/global installs.

find_skill_global() {
  local name="$1"
  find "$HOME/.claude/plugins" "$HOME/.claude/skills" 2>/dev/null \
    -path "*/skills/$name/SKILL.md" 2>/dev/null | head -1
}

for S in stardust snowflake impeccable; do
  p=$(find_skill_global "$S")
  if [ -n "$p" ]; then
    ok "$S → $p"
  else
    case "$S" in
      snowflake)
        fail "Adobe EDS skill 'snowflake' not installed — fix: /plugin marketplace update adobe-skills && /plugin install aem-edge-delivery-services@adobe-skills" ;;
      stardust|impeccable)
        fail "Adobe EDS skill '$S' not installed — fix: /plugin install $S@adobe-skills (or @impeccable for impeccable)" ;;
      *)
        fail "Adobe EDS skill '$S' not installed globally" ;;
    esac
  fi
done

# ---------- 3. Shell tools ----------

for T in node python3 jq git curl; do
  if command -v "$T" >/dev/null 2>&1; then
    ok "$T → $(command -v $T)"
  else
    fail "$T not on PATH"
  fi
done

# playwright-cli is SLICC-specific. In CC we accept either:
#   - a real playwright-cli binary (SLICC bundle reused), OR
#   - the standard `playwright` binary as a degraded fallback (with a warning;
#     OF1 step skills will need adapters to use `playwright` subcommands).
if command -v playwright-cli >/dev/null 2>&1; then
  ok "playwright-cli → $(command -v playwright-cli) (SLICC-native commands available)"
elif command -v playwright >/dev/null 2>&1; then
  warn "playwright-cli not found; only 'playwright' is installed at $(command -v playwright). OF1 step skills call 'playwright-cli visit/screenshot/snapshot' which don't exist in standard Playwright — a Node.js shim or step-skill adaptation is required before discovery/extraction/prototype steps can run."
else
  fail "Neither playwright-cli nor playwright installed — fix: npm i -g playwright; npx playwright install chromium"
fi

# ---------- 4. of1-demo repo (required via OF1_DEMO_REPO env) ----------
# No auto-discovery — the orchestrator asks the user where to clone if not set.

OF1_REPO=""
if [ -n "${OF1_DEMO_REPO:-}" ] && [ -d "${OF1_DEMO_REPO}/.git" ]; then
  REMOTE=$(git -C "$OF1_DEMO_REPO" remote get-url origin 2>/dev/null || true)
  case "$REMOTE" in
    *aem-growth-adoption/of1-demo*) OF1_REPO="$OF1_DEMO_REPO" ;;
  esac
fi

if [ -n "$OF1_REPO" ]; then
  ok "of1-demo repo → $OF1_REPO"
else
  fail "of1-demo repo: OF1_DEMO_REPO env var not set or not a valid clone of aem-growth-adoption/of1-demo — the orchestrator will ask where to clone and set this env var"
fi

# ---------- 5. Adobe IMS / DA token ----------
# Order: $ADOBE_IMS_TOKEN env (raw value) → $OF1_TOKEN_FILE → $PWD/.hlx/.da-token.json → $OF1_REPO/.hlx/.da-token.json

TOKEN_FILE=""
TOKEN_SOURCE=""
TOKEN_HAS_ENV_VALUE="false"

if [ -n "${ADOBE_IMS_TOKEN:-}" ]; then
  TOKEN_SOURCE="env:ADOBE_IMS_TOKEN"
  TOKEN_HAS_ENV_VALUE="true"
elif [ -n "${OF1_TOKEN_FILE:-}" ] && [ -s "${OF1_TOKEN_FILE}" ]; then
  TOKEN_FILE="$OF1_TOKEN_FILE"; TOKEN_SOURCE="env:OF1_TOKEN_FILE"
elif [ -s "$PWD/.hlx/.da-token.json" ]; then
  TOKEN_FILE="$PWD/.hlx/.da-token.json"; TOKEN_SOURCE="project:.hlx"
elif [ -n "$OF1_REPO" ] && [ -s "$OF1_REPO/.hlx/.da-token.json" ]; then
  TOKEN_FILE="$OF1_REPO/.hlx/.da-token.json"; TOKEN_SOURCE="repo:.hlx"
fi

if [ "$TOKEN_HAS_ENV_VALUE" = "true" ]; then
  ok "DA token → \$ADOBE_IMS_TOKEN env var (len=${#ADOBE_IMS_TOKEN})"
elif [ -n "$TOKEN_FILE" ]; then
  if jq -re '.access_token | length > 0' "$TOKEN_FILE" >/dev/null 2>&1; then
    ok "DA token → $TOKEN_FILE ($TOKEN_SOURCE)"
  else
    fail "Token file exists but has no .access_token field: $TOKEN_FILE"
  fi
else
  fail "DA token not found — set \$ADOBE_IMS_TOKEN, or set \$OF1_TOKEN_FILE, or place a file at \$PWD/.hlx/.da-token.json or <of1Repo>/.hlx/.da-token.json (shape: {\"access_token\":\"...\"})"
fi

# ---------- 6. State directory writable ----------

STATE_DIR="${OF1_STATE_DIR:-$PWD/.of1/state}"
mkdir -p "$STATE_DIR" 2>/dev/null && touch "$STATE_DIR/.write-probe" 2>/dev/null && rm "$STATE_DIR/.write-probe" 2>/dev/null \
  && ok "State dir → $STATE_DIR" \
  || fail "State dir not writable: $STATE_DIR"

# ---------- Output ----------

printf '%s\n' "${LOG[@]}"
echo ""

if [ $FAIL -gt 0 ]; then
  echo "RESULT: FAIL ($FAIL blocker(s), $WARN warning(s))"
  exit 1
fi

# Success — write state file
mkdir -p "$STATE_DIR"
cat > "$STATE_DIR/setup-cc.json" <<EOF
{
  "ok": true,
  "stateDir": "$STATE_DIR",
  "of1Repo": "$OF1_REPO",
  "tokenSource": "$TOKEN_SOURCE",
  "tokenFile": "$TOKEN_FILE",
  "tokenFromEnv": $TOKEN_HAS_ENV_VALUE,
  "playwrightCli": "$(command -v playwright-cli 2>/dev/null || echo "")",
  "playwrightFallback": "$(command -v playwright 2>/dev/null || echo "")",
  "warnings": $WARN,
  "verifiedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "RESULT: OK ($WARN warning(s))"
echo "Wrote $STATE_DIR/setup-cc.json"
exit 0
