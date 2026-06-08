#!/usr/bin/env bash
# of1-branch-setup — create demo branch, clean slate, write config contracts.
# Run this script. Do NOT improvise the steps by hand.
#
# Required env:
#   OF1_STATE_DIR    — state + IPC dir (SLICC: /shared/of1-demo; CC: $PWD/.of1/state)
#   OF1_DEMO_REPO    — absolute path to local clone of aem-growth-adoption/of1-demo
#   DOMAIN           — target domain (e.g. frescopa.coffee)
#   BRANCH           — branch name (e.g. frescopa)
#   DA_TOKEN         — Adobe IMS token for DA API calls
#
# Optional env:
#   BRANCH_MODE      — "fresh" (default) or "continue". If the branch exists:
#                      fresh = create ${BRANCH}-2, -3, etc.
#                      continue = reuse existing branch.

set -eu

# ---------- Validate inputs ----------

: "${OF1_STATE_DIR:?OF1_STATE_DIR is required}"
: "${OF1_DEMO_REPO:?OF1_DEMO_REPO is required}"
: "${DOMAIN:?DOMAIN is required}"
: "${BRANCH:?BRANCH is required}"
: "${DA_TOKEN:?DA_TOKEN is required}"

BRANCH_MODE="${BRANCH_MODE:-fresh}"

# ---------- Gate: step 1 must have run ----------

if [ ! -f "$OF1_STATE_DIR/setup.json" ]; then
  echo "FAIL: $OF1_STATE_DIR/setup.json does not exist." >&2
  echo "Step 1 (of1-setup) was either skipped or verify.sh was not executed." >&2
  exit 1
fi

# ---------- Verify repo clone ----------

cd "$OF1_DEMO_REPO" || { echo "FAIL: $OF1_DEMO_REPO is not a valid directory" >&2; exit 1; }
git rev-parse --git-dir >/dev/null 2>&1 || { echo "FAIL: $OF1_DEMO_REPO is not a git repo" >&2; exit 1; }

# ---------- Pick or create branch ----------

git fetch origin

# Check branch existence using commands compatible with isomorphic-git
# (git ls-remote and git branch --list don't work reliably in SLICC)
EXISTS_REMOTE=$(git branch -a 2>/dev/null | grep -c "remotes/origin/${BRANCH}$" || echo "0")
EXISTS_LOCAL=$(git branch 2>/dev/null | grep -c "^..${BRANCH}$" || echo "0")

if [ "$EXISTS_REMOTE" -gt 0 ] || [ "$EXISTS_LOCAL" -gt 0 ]; then
  if [ "$BRANCH_MODE" = "continue" ]; then
    echo "Branch $BRANCH exists — continuing (reuse mode)"
    if [ "$EXISTS_LOCAL" -gt 0 ]; then
      git checkout "$BRANCH"
    else
      git checkout -b "$BRANCH" "origin/$BRANCH"
    fi
  else
    # Fresh start: find unused suffix
    N=2
    while git branch -a 2>/dev/null | grep -q "remotes/origin/${BRANCH}-${N}$"; do
      N=$((N + 1))
    done
    BRANCH="${BRANCH}-${N}"
    echo "Branch exists — creating fresh: $BRANCH"
    git checkout -b "$BRANCH" origin/main
  fi
else
  echo "Creating new branch: $BRANCH"
  git checkout -b "$BRANCH" origin/main
fi

# ---------- Clean slate (demo artifacts only) ----------

rm -rf stardust/ deliverables/ templates/ fragments/ .snowflake/ drafts/ \
       gallery/ of1/config/ tools/ output/ screenshots/ tmp/ da/
rm -rf styles/of1-*.css styles/prototype-*.css
rm -f PRODUCT.md

# Clean prior state
rm -rf "$OF1_STATE_DIR"/step-*
rm -f "$OF1_STATE_DIR/discovery.html"

git add -A
if ! git diff --cached --quiet; then
  git commit -m "chore: clean slate for ${BRANCH}" --quiet
  git push origin "$BRANCH" --quiet
  echo "✓ Clean slate committed + pushed"
else
  echo "✓ Branch already clean"
fi

# ---------- Clean DA content ----------

OWNER="aem-growth-adoption"
REPO="of1-demo"

DA_LIST=$(curl -s -H "Authorization: Bearer $DA_TOKEN" \
  "https://admin.da.live/list/${OWNER}/${REPO}/${BRANCH}" 2>/dev/null || echo "[]")

echo "$DA_LIST" | jq -r '.[] | select(.ext == "html") | .name' 2>/dev/null | while read -r name; do
  [ -n "$name" ] || continue
  curl -s -X DELETE -H "Authorization: Bearer $DA_TOKEN" \
    "https://admin.da.live/source/${OWNER}/${REPO}/${BRANCH}/${name}.html" >/dev/null
done
echo "✓ DA content cleaned for ${BRANCH}"

# ---------- Write repo-config.json ----------

mkdir -p "$OF1_STATE_DIR"
cat > "$OF1_STATE_DIR/repo-config.json" <<EOF
{
  "owner": "${OWNER}",
  "repo": "${REPO}",
  "branch": "${BRANCH}",
  "contentPrefix": "${BRANCH}",
  "repoDir": "${OF1_DEMO_REPO}",
  "domain": "${DOMAIN}",
  "repoUrl": "https://github.com/${OWNER}/${REPO}",
  "previewUrl": "https://${BRANCH}--${REPO}--${OWNER}.aem.page/",
  "daSource": "da://${OWNER}/${REPO}"
}
EOF
echo "✓ repo-config.json written"

# ---------- Write of1-endpoint.json + push ----------

mkdir -p of1/config
cat > of1/config/of1-endpoint.json <<EOF
{
  "url": "https://${BRANCH}--${REPO}--${OWNER}.aem.page/${BRANCH}/of1"
}
EOF
git add of1/config/of1-endpoint.json
git commit -m "feat: of1-endpoint config for ${DOMAIN}" --quiet
git push origin "$BRANCH" --quiet
echo "✓ of1-endpoint.json committed + pushed"

# ---------- Write step 2 status ----------

echo "{\"step\":2,\"status\":\"done\",\"summary\":\"branch ${BRANCH} + repo-config ready\"}" \
  > "$OF1_STATE_DIR/step-2-status.json"

echo ""
echo "=== Step 2 complete ==="
echo "  Branch: $BRANCH"
echo "  Domain: $DOMAIN"
echo "  Repo:   $OF1_DEMO_REPO"
echo "  Config: $OF1_STATE_DIR/repo-config.json"
