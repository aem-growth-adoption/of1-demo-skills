---
name: of1-repo-setup
description: Set up an AEM EDS repository for the OF1 demo — use an existing repo or create from boilerplate, create the demo branch, clean stale artifacts, and write the repo-config.json contract every downstream step reads.
user-invocable: false
---

# OF1 Repo Setup

This step ensures the user has a working AEM Edge Delivery Services repository connected to DA, with a clean demo branch ready for downstream steps. There are two paths:

1. **Bring your own repo** — user provides an existing EDS GitHub repo URL
2. **Create a new one** — create a new repo from the `adobe/aem-boilerplate` template

The step is considered **done** when:
- The repo is cloned locally
- A demo branch exists and is checked out
- The branch is clean (no stale demo artifacts)
- DA content is cleared for the branch
- `repo-config.json` is written to `$OF1_STATE_DIR`
- The preview URL returns a valid page

## Env — orchestrator exports these (see `of1-setup`)

| Var | Required | Purpose |
|-----|----------|---------|
| `OF1_STATE_DIR` | yes | state + IPC dir; receives `repo-config.json` + `step-2-status.json` |
| `DOMAIN` | yes | target domain (e.g. `frescopa.coffee`) |
| `BRANCH` | yes | branch name (e.g. `frescopa` — domain without TLD) |
| `BRANCH_MODE` | no | `fresh` (default) or `continue`. Fresh auto-increments if branch exists. |
| `DA_TOKEN` | yes | Adobe IMS token for DA API calls |

## Flow

### Ask the user

The orchestrator MUST ask the user the following questions before dispatching this step:

**Question 1:** Do you have an existing AEM EDS repository, or should I create a new one?

- **Option A:** Provide the GitHub URL of your existing EDS repo (e.g., `https://github.com/myorg/mysite`)
- **Option B:** I'll create a new one for you.

**If Option B (create new):**

**Question 2:** What GitHub account or organization should I create the repo under? (e.g., `of1-labs`, `myorg`)

**Question 3:** What should the repo be named? (e.g., `acme-demo`, `my-demo-site`)

Do NOT proceed until the user has answered all required questions. Never assume a default org or repo name.

---

## Path A: Existing Repo

### A1 — Parse and clone

```bash
# Parse owner/repo from URL (handles https://github.com/owner/repo or owner/repo)
REPO_URL="${USER_PROVIDED_URL}"
OWNER=$(echo "$REPO_URL" | sed 's|.*github.com/||' | cut -d/ -f1)
REPO=$(echo "$REPO_URL" | sed 's|.*github.com/||' | cut -d/ -f2 | sed 's/\.git$//')

OF1_DEMO_REPO="${OF1_DEMO_REPO:-/workspace/${REPO}}"

if [ -d "$OF1_DEMO_REPO/.git" ]; then
  echo "Repo already cloned at $OF1_DEMO_REPO — fetching latest"
  cd "$OF1_DEMO_REPO" && git fetch origin
else
  git clone "https://github.com/${OWNER}/${REPO}.git" "$OF1_DEMO_REPO"
  cd "$OF1_DEMO_REPO"
fi
```

### A2 — Verify EDS structure

```bash
# Must have the core EDS files
[ -f scripts/aem.js ] || [ -f scripts/lib-franklin.js ] || { echo "FAIL: not an EDS repo (no scripts/aem.js)" >&2; exit 1; }
[ -f scripts/scripts.js ] || { echo "FAIL: missing scripts/scripts.js" >&2; exit 1; }
[ -f styles/styles.css ] || { echo "FAIL: missing styles/styles.css" >&2; exit 1; }
echo "✓ EDS structure verified"
```

### A3 — Check AEM Code Sync

```bash
PREVIEW_URL="https://main--${REPO}--${OWNER}.aem.page/"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PREVIEW_URL")

if [ "$STATUS" != "200" ]; then
  echo "WARN: Preview URL returned $STATUS — AEM Code Sync may not be installed."
  echo ""
  echo "Please install the AEM Code Sync GitHub App on this repo:"
  echo "  1. Visit: https://github.com/apps/aem-code-sync/installations/new"
  echo "  2. Select your organization/account: ${OWNER}"
  echo "  3. Choose 'Only select repositories' and pick ${REPO}"
  echo "  4. Click 'Install'"
  echo ""
  echo "Let me know once you've done this."
  
  # Write review status — orchestrator must wait for user confirmation
  echo "{\"step\":2,\"status\":\"review\",\"summary\":\"Please install AEM Code Sync on the repo.\",\"deliverable\":\"https://github.com/apps/aem-code-sync/installations/new\"}" \
    > "$OF1_STATE_DIR/step-2-status.json"
  exit 0
fi
echo "✓ AEM Code Sync active (preview URL responds)"
```

After user confirms Code Sync is installed, re-run from this point and verify:

```bash
# Poll preview URL until Code Sync activates (max 5 min)
for i in $(seq 1 60); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PREVIEW_URL")
  [ "$STATUS" = "200" ] && break
  sleep 5
done
[ "$STATUS" = "200" ] || { echo "FAIL: preview still not responding after 5 min" >&2; exit 1; }
```

Now skip to **Branch Setup** below.

---

## Path B: Create New Repo

### B1 — Create repo from template

```bash
OWNER="${USER_PROVIDED_OWNER}"
REPO="${USER_PROVIDED_REPO_NAME}"
OF1_DEMO_REPO="${OF1_DEMO_REPO:-/workspace/${REPO}}"

# Get GitHub token
TOKEN=$(gh auth token 2>/dev/null || cat ~/.git-credentials 2>/dev/null | grep github.com | sed 's|https://||' | sed 's|@github.com||' | cut -d: -f2)

# Create repo from template
curl -s -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/adobe/aem-boilerplate/generate" \
  -d "{
    \"owner\": \"${OWNER}\",
    \"name\": \"${REPO}\",
    \"description\": \"OF1 demo site for ${DOMAIN}\",
    \"private\": false
  }"
```

### B2 — Wait for repo to be ready

```bash
for i in $(seq 1 30); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: token $TOKEN" \
    "https://api.github.com/repos/${OWNER}/${REPO}")
  [ "$STATUS" = "200" ] && break
  sleep 2
done
[ "$STATUS" = "200" ] || { echo "FAIL: repo not ready after 60s" >&2; exit 1; }
echo "✓ Repo created: https://github.com/${OWNER}/${REPO}"
```

### B3 — Install AEM Code Sync

Tell the user:

> I've created your repository at `https://github.com/{OWNER}/{REPO}`
>
> To complete setup, you need to install the AEM Code Sync GitHub App:
> 1. Visit: https://github.com/apps/aem-code-sync/installations/new
> 2. Select your organization/account: `{OWNER}`
> 3. Choose "Only select repositories" and pick `{REPO}`
> 4. Click "Install"
>
> Let me know once you've done this and I'll verify it's working.

Wait for user confirmation, then verify:

```bash
PREVIEW_URL="https://main--${REPO}--${OWNER}.aem.page/"
for i in $(seq 1 60); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PREVIEW_URL")
  [ "$STATUS" = "200" ] && break
  sleep 5
done
[ "$STATUS" = "200" ] || { echo "FAIL: AEM Code Sync not responding after 5 min" >&2; exit 1; }
echo "✓ AEM Code Sync active"
```

### B4 — Clone the repo locally

```bash
git clone "https://github.com/${OWNER}/${REPO}.git" "$OF1_DEMO_REPO"
cd "$OF1_DEMO_REPO"
```

---

## Branch Setup (both paths converge here)

### Create or reuse the demo branch

```bash
cd "$OF1_DEMO_REPO"
git fetch origin

BRANCH_MODE="${BRANCH_MODE:-fresh}"

# Check branch existence
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
```

### Clean slate (demo artifacts only)

Remove previous demo artifacts but preserve EDS boilerplate (`styles/styles.css`, `scripts/`, `blocks/{header,footer,fragment}/`, `head.html`):

```bash
rm -rf stardust/ deliverables/ templates/ fragments/ .snowflake/ drafts/ \
       gallery/ of1/config/ tools/ output/ screenshots/ tmp/ da/
rm -rf styles/of1-*.css styles/prototype-*.css
rm -f PRODUCT.md

# Clean prior state
rm -rf "$OF1_STATE_DIR"/step-*
rm -f "$OF1_STATE_DIR/discovery.html"

git add -A
if ! git diff --cached --quiet; then
  git commit -m "chore: clean slate for ${BRANCH}"
  git push origin "$BRANCH"
  echo "✓ Clean slate committed + pushed"
else
  echo "✓ Branch already clean"
fi
```

### Clean DA content for the branch

```bash
DA_LIST=$(curl -s -H "Authorization: Bearer $DA_TOKEN" \
  "https://admin.da.live/list/${OWNER}/${REPO}" 2>/dev/null || echo "[]")

echo "$DA_LIST" | jq -r '.[] | select(.ext == "html") | .name' 2>/dev/null | while read -r name; do
  [ -n "$name" ] || continue
  curl -s -X DELETE -H "Authorization: Bearer $DA_TOKEN" \
    "https://admin.da.live/source/${OWNER}/${REPO}/${name}.html" >/dev/null
done
echo "✓ DA content cleaned"
```

### Ensure .hlxignore does NOT block of1/config/

The OF1 extension reads config files from the EDS CDN (`/of1/config/*.json`). The boilerplate `.hlxignore` must NOT include `of1/` or `of1/config/`. If previous steps or conventions added such a rule, remove it:

```bash
if [ -f .hlxignore ] && grep -q '^of1' .hlxignore; then
  sed -i '/^of1/d' .hlxignore
  echo "✓ Removed of1 exclusion from .hlxignore"
fi
```

**Do NOT add `of1/` to `.hlxignore`** — the config files must be served on the CDN.

### Write of1-endpoint.json + push

```bash
mkdir -p of1/config
cat > of1/config/of1-endpoint.json <<EOF
{
  "url": "https://${BRANCH}--${REPO}--${OWNER}.aem.page/of1"
}
EOF
git add of1/config/of1-endpoint.json
git commit -m "feat: of1-endpoint config for ${DOMAIN}"
git push origin "$BRANCH"
echo "✓ of1-endpoint.json committed + pushed"
```

### Gate: verify preview works on the branch

```bash
BRANCH_PREVIEW="https://${BRANCH}--${REPO}--${OWNER}.aem.page/"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BRANCH_PREVIEW")

if [ "$STATUS" != "200" ]; then
  echo "WARN: Branch preview returned $STATUS — waiting for Code Sync..."
  for i in $(seq 1 30); do
    sleep 5
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BRANCH_PREVIEW")
    [ "$STATUS" = "200" ] && break
  done
fi

if [ "$STATUS" = "200" ]; then
  echo "✓ Branch preview live: $BRANCH_PREVIEW"
else
  echo "WARN: Branch preview returned $STATUS — may need a few more minutes for Code Sync"
fi
```

## Output — write the downstream contract

```bash
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
```

## The downstream contract (`repo-config.json`)

Every downstream step reads this file. Required fields:

| Field | Type | Notes |
|---|---|---|
| `owner` | string | GitHub org or user (e.g. `of1-labs`) |
| `repo` | string | Repo name (e.g. `of1-demo`) |
| `branch` | string | Demo branch name (may have suffix if fresh-start incremented) |
| `contentPrefix` | string | Same as `branch` |
| `repoDir` | string | Absolute path to the local clone |
| `domain` | string | The customer domain |

Optional (for humans): `repoUrl`, `previewUrl`, `daSource`.

## Completion

```bash
echo "{\"step\":2,\"status\":\"done\",\"summary\":\"Repo: ${OWNER}/${REPO} branch: ${BRANCH} | Preview: https://${BRANCH}--${REPO}--${OWNER}.aem.page/\"}" \
  > "$OF1_STATE_DIR/step-2-status.json"

echo ""
echo "=== Step 2 complete ==="
echo "  Branch: $BRANCH"
echo "  Domain: $DOMAIN"
echo "  Repo:   $OF1_DEMO_REPO"
echo "  Config: $OF1_STATE_DIR/repo-config.json"
```

If waiting for user action (Code Sync install):
```bash
echo '{"step":2,"status":"review","summary":"Please install AEM Code Sync on the repo.","deliverable":"https://github.com/apps/aem-code-sync/installations/new"}' \
  > "$OF1_STATE_DIR/step-2-status.json"
```
