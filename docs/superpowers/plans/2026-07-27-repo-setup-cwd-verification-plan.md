# Fold repo-setup into of1-setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete `of1-repo-setup` as a standalone skill/pipeline step, fold its
surviving logic (EDS verification, demo-in-progress detection, conditional
clean-slate, `repo-config.json` output) into `of1-setup`, and renumber the
12-step pipeline throughout `of1-demo`, `of1-demo-cc`, the SLICC sprinkle,
`README.md`, and `plugin.json`.

**Architecture:** `of1-setup/scripts/verify.sh` gains EDS structural
verification and `owner`/`repo`/`branch` resolution (from git, not from
asking the user or cloning). `of1-setup/SKILL.md` gains a new "Repo state"
section — interactive continue/restart detection and conditional cleanup —
that runs after `verify.sh` exits 0. All step-number references across the
two orchestrators shift down by one (old step 2 disappears; 3→2, 4→3, ...,
13→12).

**Tech Stack:** Bash (`verify.sh`), Markdown skill docs, vanilla JS
(`of1-demo.shtml` sprinkle UI), JSON config (`plugin.json`).

## Global Constraints

- No downstream per-domain step skill (discovery, extraction, prototype,
  snowflake/stardust-deploy, template-generation, generative-block-styler,
  brand-voice-extractor, content-metadata, quick-suggestions,
  cta-template-builder, config-review, deploy) changes behavior — they only
  consume `repo-config.json` by field name (`owner`, `repo`, `branch`,
  `contentPrefix`, `repoDir`, `domain`, optionally
  `repoUrl`/`previewUrl`/`daSource`), never by step number.
- `BRANCH_MODE` env var and branch creation/checkout/suffix logic are removed
  entirely — `BRANCH` is always `git branch --show-current` in the resolved
  `OF1_DEMO_REPO`.
- Destructive cleanup (clean-slate file wipe + DA content deletion) must
  never run on "continue" — only on "restart" or on a genuinely fresh setup
  (no `repo-config.json` found).
- If the current branch is empty (detached HEAD) or `main`, warn but proceed
  — never block.
- Spec source of truth: `docs/superpowers/specs/2026-07-27-repo-setup-cwd-verification-design.md`.

---

### Task 1: `verify.sh` — EDS structural check + owner/repo/branch resolution

**Files:**
- Modify: `skills/of1-setup/scripts/verify.sh:48-166`
- Test: manual invocation (see Step 2 below) — no existing test harness for this script

**Interfaces:**
- Consumes: `$OF1_DEMO_REPO` (existing env var, unchanged), `$OF1_RUNTIME` (existing)
- Produces: `setup.json` now also carries `owner`, `repo`, `branch` fields —
  consumed by Task 2 (of1-setup/SKILL.md's Repo state section) and, going
  forward, discoverable by anyone reading `setup.json` for debugging. This
  does NOT replace `repo-config.json` (Task 2 still writes that separately).

- [ ] **Step 1: Replace the skill list, drop `of1-repo-setup`, and replace check 4**

In `skills/of1-setup/scripts/verify.sh`, find:

```bash
REQUIRED_SKILLS=(
  of1-repo-setup of1-discovery of1-extraction of1-prototype
  of1-stardust-deploy of1-template-generation of1-generative-block-styler
  of1-brand-voice-extractor of1-content-metadata of1-quick-suggestions
  of1-cta-template-builder of1-config-review of1-deploy
)
```

Replace with:

```bash
REQUIRED_SKILLS=(
  of1-discovery of1-extraction of1-prototype
  of1-stardust-deploy of1-template-generation of1-generative-block-styler
  of1-brand-voice-extractor of1-content-metadata of1-quick-suggestions
  of1-cta-template-builder of1-config-review of1-deploy
)
```

Find:

```bash
if [ ${#MISSING[@]} -eq 0 ]; then
  ok "All 13 OF1 step skills present"
else
```

Replace with:

```bash
if [ ${#MISSING[@]} -eq 0 ]; then
  ok "All 12 OF1 step skills present"
else
```

Find the entire section 4 block:

```bash
# ---------- 4. of1-demo repo (required via OF1_DEMO_REPO env) ----------
# No auto-discovery — the orchestrator asks the user where to clone if not set.

OF1_REPO=""
if [ -n "${OF1_DEMO_REPO:-}" ] && [ -d "${OF1_DEMO_REPO}/.git" ]; then
  # Use subshell + cd — SLICC's git shim doesn't support `-C` or `remote get-url`.
  REMOTE=$(cd "$OF1_DEMO_REPO" && git config remote.origin.url 2>/dev/null || true)
  case "$REMOTE" in
    *aem-growth-adoption/of1-demo*) OF1_REPO="$OF1_DEMO_REPO" ;;
  esac
fi

if [ -n "$OF1_REPO" ]; then
  ok "of1-demo repo → $OF1_REPO"
else
  fail "of1-demo repo: OF1_DEMO_REPO env var not set or not a valid clone of aem-growth-adoption/of1-demo — the orchestrator will ask where to clone and set this env var"
fi
```

Replace with:

```bash
# ---------- 4. EDS repo verification (any org/repo — structural, not identity) ----------
# No auto-discovery — the orchestrator sets OF1_DEMO_REPO to the repo cwd.
# Verifies EDS structural files exist and resolves owner/repo/branch from git.

OF1_REPO=""
OWNER=""
REPO=""
BRANCH=""

if [ -n "${OF1_DEMO_REPO:-}" ] && [ -d "${OF1_DEMO_REPO}/.git" ]; then
  # Use subshell + cd — SLICC's git shim doesn't support `-C` or `remote get-url`.
  REMOTE=$(cd "$OF1_DEMO_REPO" && git config remote.origin.url 2>/dev/null || true)
  OWNER=$(echo "$REMOTE" | sed 's|.*github.com[:/]||' | cut -d/ -f1)
  REPO=$(echo "$REMOTE" | sed 's|.*github.com[:/]||' | cut -d/ -f2 | sed 's/\.git$//')
  BRANCH=$(cd "$OF1_DEMO_REPO" && git branch --show-current 2>/dev/null || true)

  if { [ -f "${OF1_DEMO_REPO}/scripts/aem.js" ] || [ -f "${OF1_DEMO_REPO}/scripts/lib-franklin.js" ]; } \
     && [ -f "${OF1_DEMO_REPO}/scripts/scripts.js" ] \
     && [ -f "${OF1_DEMO_REPO}/styles/styles.css" ]; then
    OF1_REPO="$OF1_DEMO_REPO"
    ok "EDS repo → $OF1_REPO ($OWNER/$REPO, branch: ${BRANCH:-<detached>})"
  else
    fail "Not an EDS repo at $OF1_DEMO_REPO — missing scripts/aem.js (or lib-franklin.js), scripts/scripts.js, or styles/styles.css. cd into a valid EDS repo checkout (or set OF1_DEMO_REPO) and re-run."
  fi

  if [ -z "$BRANCH" ] || [ "$BRANCH" = "main" ]; then
    warn "Currently on ${BRANCH:-a detached HEAD} — demo artifacts and DA content will be affected on this branch/state"
  fi
else
  fail "OF1_DEMO_REPO env var not set or not a git checkout — set it to the absolute path of a cloned EDS repo"
fi
```

- [ ] **Step 2: Add owner/repo/branch to `setup.json`**

Find:

```bash
cat > "$STATE_DIR/setup.json" <<EOF
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
```

Replace with:

```bash
cat > "$STATE_DIR/setup.json" <<EOF
{
  "ok": true,
  "stateDir": "$STATE_DIR",
  "of1Repo": "$OF1_REPO",
  "owner": "$OWNER",
  "repo": "$REPO",
  "branch": "$BRANCH",
  "tokenSource": "$TOKEN_SOURCE",
  "tokenFile": "$TOKEN_FILE",
  "tokenFromEnv": $TOKEN_HAS_ENV_VALUE,
  "playwrightCli": "$(command -v playwright-cli 2>/dev/null || echo "")",
  "playwrightFallback": "$(command -v playwright 2>/dev/null || echo "")",
  "warnings": $WARN,
  "verifiedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
```

- [ ] **Step 3: Update the header comment**

Find:

```bash
#!/usr/bin/env bash
# of1-setup verifier — checks all prerequisites for the OF1 demo pipeline.
# Runtime-agnostic: works in both Claude Code and SLICC. The orchestrator
# exports OF1_STATE_DIR / OF1_DEMO_REPO / token env vars before invoking.
# Contract documented in ../SKILL.md.
#
# Exit 0 = all good; exit 1 = something blocking is missing.
# Side effect on success:
#   <stateDir>/setup.json          — resolved paths + token source
#   <stateDir>/step-1-status.json  — SLICC sprinkle IPC ack (harmless in CC)
```

Replace with:

```bash
#!/usr/bin/env bash
# of1-setup verifier — checks all prerequisites for the OF1 demo pipeline,
# including that OF1_DEMO_REPO is a valid EDS repo (structural check, not
# identity — any org/repo works). Runtime-agnostic: works in both Claude
# Code and SLICC. The orchestrator exports OF1_STATE_DIR / OF1_DEMO_REPO /
# token env vars before invoking. Contract documented in ../SKILL.md.
#
# Exit 0 = all good; exit 1 = something blocking is missing.
# Side effect on success:
#   <stateDir>/setup.json          — resolved paths + owner/repo/branch + token source
#   <stateDir>/step-1-status.json  — SLICC sprinkle IPC ack (harmless in CC)
#
# repo-config.json (owner/repo/branch/domain/repoDir) is NOT written by this
# script — it's written interactively by of1-setup/SKILL.md's "Repo state"
# section after this script exits 0, since detecting an in-progress demo and
# asking continue/restart requires AskUserQuestion (not available in bash).
```

- [ ] **Step 4: Manually verify the script runs against this repo**

Run (from the plugin repo root, which is itself not an EDS repo, so this
exercises the fail path):

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
OF1_DEMO_REPO="$PWD" OF1_STATE_DIR="/tmp/of1-verify-test" bash skills/of1-setup/scripts/verify.sh; echo "exit: $?"
```

Expected: exits `1`, output includes a line starting with `✗ Not an EDS repo
at /Users/quentinvecchio/workspace/labs/of1-demo-skills`.

Then verify against a real EDS checkout (skip if none is available locally —
note this in the task if skipped):

```bash
OF1_DEMO_REPO="/path/to/a/real/eds/checkout" OF1_STATE_DIR="/tmp/of1-verify-test2" bash skills/of1-setup/scripts/verify.sh; echo "exit: $?"
cat /tmp/of1-verify-test2/setup.json
```

Expected: exits `0` (assuming other prerequisites like `jq`/`git`/tokens are
present), and `setup.json` contains non-empty `owner`, `repo`, `branch`
fields.

- [ ] **Step 5: Commit**

```bash
git add skills/of1-setup/scripts/verify.sh
git commit -m "feat: verify.sh checks EDS structure + resolves owner/repo/branch from git"
```

---

### Task 2: `of1-setup/SKILL.md` — absorb repo-setup's interactive flow

**Files:**
- Modify: `skills/of1-setup/SKILL.md` (full rewrite of the "What it checks" /
  env-var table sections, plus new "Repo state" section)

**Interfaces:**
- Consumes: `setup.json` (Task 1's new `owner`/`repo`/`branch` fields),
  `$OF1_STATE_DIR/repo-config.json` (if present, from a prior run)
- Produces: `$OF1_STATE_DIR/repo-config.json` with the same shape downstream
  skills already expect: `{owner, repo, branch, contentPrefix, repoDir,
  domain, repoUrl, previewUrl, daSource}`. `contentPrefix` always equals
  `branch`.

- [ ] **Step 1: Replace the full file content**

Read the current file first (`skills/of1-setup/SKILL.md`, 60 lines) to
confirm you're editing the right version, then replace its entire contents
with:

```markdown
---
name: of1-setup
description: Verify all OF1 demo pipeline dependencies are installed, verify the local EDS repo, and prepare repo-config.json.
---

# OF1 Setup — Verify Dependencies & Repo

## Part 1 — scripted checks

**Run this exact command. Do NOT substitute with ad-hoc checks.**

```bash
OF1_DEMO_REPO="${OF1_DEMO_REPO:-/workspace/of1-demo}" \
OF1_STATE_DIR="${OF1_STATE_DIR:-/shared/of1-demo}" \
ADOBE_IMS_TOKEN="${ADOBE_IMS_TOKEN:-$(oauth-token adobe 2>/dev/null || true)}" \
bash "${SKILL_DIR:-/workspace/skills/of1-setup}/scripts/verify.sh"
```

Do NOT:
- Run `command -v` checks yourself instead of the script
- Skip the script because "it's simple" or "I can check faster"
- Write `setup.json` or `repo-config.json` by hand

If exit code is `1`: report the exact error lines and STOP. This includes
the case where `$OF1_DEMO_REPO` is not a valid EDS repo — there is no
fallback to clone or create a repo. The user must `cd` into (or point
`OF1_DEMO_REPO` at) a valid EDS repo checkout and re-run.

If exit code is `0`: continue to **Part 2** below.

Downstream steps **structurally depend on `$OF1_STATE_DIR/repo-config.json`
existing** — it is not written by `verify.sh`; Part 2 writes it.

### What verify.sh checks

1. The 12 OF1 step skills are installed (`of1-discovery`, `of1-stardust-deploy`, …)
2. The Adobe EDS skills `stardust`, `impeccable` are installed
3. Shell tools: `node`, `python3`, `jq`, `git`, `curl`
4. `playwright-cli` (or the standard `playwright` binary with a shim warning)
5. `$OF1_DEMO_REPO` is a git checkout with EDS structural files
   (`scripts/aem.js` or `scripts/lib-franklin.js`, `scripts/scripts.js`,
   `styles/styles.css`) — **fails hard** if not, no fallback
6. An Adobe IMS / DA token is resolvable
7. `$OF1_STATE_DIR` is writable

It also resolves `owner`/`repo` (from `git config remote.origin.url`) and
`branch` (from `git branch --show-current`) and writes them into
`setup.json`. It **warns** (does not fail) if `branch` is empty (detached
HEAD) or `main`.

## Part 2 — repo state (interactive, after verify.sh succeeds)

Read `setup.json` for `owner`, `repo`, `branch`, `of1Repo`, and resolve
`DA_TOKEN` from whichever token source `verify.sh` already found (do not
re-derive it — `verify.sh` already validated it exists):

```bash
SETUP=$(cat "$OF1_STATE_DIR/setup.json")
OWNER=$(echo "$SETUP" | jq -r .owner)
REPO=$(echo "$SETUP" | jq -r .repo)
BRANCH=$(echo "$SETUP" | jq -r .branch)
REPO_DIR=$(echo "$SETUP" | jq -r .of1Repo)

if [ "$(echo "$SETUP" | jq -r .tokenFromEnv)" = "true" ]; then
  DA_TOKEN="$ADOBE_IMS_TOKEN"
else
  DA_TOKEN=$(jq -r .access_token "$(echo "$SETUP" | jq -r .tokenFile)")
fi
```

### 1. Detect an in-progress demo

```bash
if [ -f "$OF1_STATE_DIR/repo-config.json" ]; then
  echo "=== Existing demo found ==="
  cat "$OF1_STATE_DIR/repo-config.json"
  echo ""
  for f in "$OF1_STATE_DIR"/step-*-status.json; do
    [ -f "$f" ] && { echo "--- $(basename "$f") ---"; cat "$f"; echo ""; }
  done
fi
```

- **If `repo-config.json` does NOT exist:** no demo in progress. Skip
  straight to step 3 (Clean slate) below — treat as fresh, run cleanup
  unconditionally (there is nothing to preserve), no prompt needed.
- **If it DOES exist:** summarize the branch, domain, and last completed
  step to the user from the printed JSON, then ask via `AskUserQuestion`:
  - **Continue** this demo — skip cleanup entirely, keep all existing
    artifacts and DA content, go straight to step 4 (Code Sync check).
  - **Restart** this demo — run cleanup (step 3) against the *same*
    branch, then continue to step 4.

### 2. Warn if on `main` or detached HEAD

If `setup.json`'s `branch` field is empty or `"main"`, tell the user:

> ⚠️ Currently on `{branch or 'a detached HEAD'}` — demo artifacts and DA
> content will be affected on this branch/state. Proceeding anyway per the
> hands-off branch model; check out the intended branch yourself if this
> isn't what you want.

Then proceed regardless — never block on this.

### 3. Clean slate (restart, or fresh setup with nothing to preserve)

Remove previous demo artifacts but preserve EDS boilerplate
(`styles/styles.css`, `scripts/`, `blocks/{header,footer,fragment}/`,
`head.html`):

```bash
cd "$REPO_DIR"
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

Then clean DA content for the branch:

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

### 4. Code Sync check

```bash
PREVIEW_URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PREVIEW_URL")

if [ "$STATUS" != "200" ]; then
  echo "WARN: Preview URL returned $STATUS — waiting for Code Sync..."
  for i in $(seq 1 30); do
    sleep 5
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PREVIEW_URL")
    [ "$STATUS" = "200" ] && break
  done
fi

if [ "$STATUS" = "200" ]; then
  echo "✓ Branch preview live: $PREVIEW_URL"
else
  echo "WARN: Branch preview returned $STATUS — may need a few more minutes for Code Sync"
fi
```

### 5. Ensure `.hlxignore` does NOT block `of1/config/`

The OF1 extension reads config files from the EDS CDN (`/of1/config/*.json`).
The boilerplate `.hlxignore` must NOT include `of1/` or `of1/config/`:

```bash
if [ -f .hlxignore ] && grep -q '^of1' .hlxignore; then
  sed -i '/^of1/d' .hlxignore
  echo "✓ Removed of1 exclusion from .hlxignore"
fi
```

**Do NOT add `of1/` to `.hlxignore`** — the config files must be served on
the CDN.

### 6. Write `of1-endpoint.json` + push (skip if continuing and file already committed)

```bash
mkdir -p of1/config
cat > of1/config/of1-endpoint.json <<EOF
{
  "url": "https://${BRANCH}--${REPO}--${OWNER}.aem.page/of1"
}
EOF
git add of1/config/of1-endpoint.json
if ! git diff --cached --quiet; then
  git commit -m "feat: of1-endpoint config for ${DOMAIN}"
  git push origin "$BRANCH"
  echo "✓ of1-endpoint.json committed + pushed"
fi
```

### 7. Write `repo-config.json`

```bash
mkdir -p "$OF1_STATE_DIR"
cat > "$OF1_STATE_DIR/repo-config.json" <<EOF
{
  "owner": "${OWNER}",
  "repo": "${REPO}",
  "branch": "${BRANCH}",
  "contentPrefix": "${BRANCH}",
  "repoDir": "${REPO_DIR}",
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
| `owner` | string | GitHub org or user |
| `repo` | string | Repo name |
| `branch` | string | Whatever branch was checked out when setup ran |
| `contentPrefix` | string | Same as `branch` |
| `repoDir` | string | Absolute path to the local clone |
| `domain` | string | The customer domain |

Optional (for humans): `repoUrl`, `previewUrl`, `daSource`.

## Env vars — the orchestrator sets these before invoking

| Var | Purpose |
|-----|---------|
| `OF1_DEMO_REPO` | **required** — absolute path to a local clone of an EDS repo (any org/repo — validated structurally, not by identity) |
| `OF1_STATE_DIR` | shared IPC + state dir. SLICC: `/shared/of1-demo`. CC: `$PWD/.of1/state` (default). |
| `DOMAIN` | the target domain for this demo (e.g. `frescopa.coffee`) — recorded in `repo-config.json` |
| `ADOBE_IMS_TOKEN` | raw token value (preferred — highest priority) |
| `OF1_TOKEN_FILE` | path to a `{"access_token":"…"}` JSON (alternative to the env value) |
| `STRICT` | `1` makes warnings fail. Default `0`. |
| `OF1_RUNTIME` | `cc` or `slicc`. Optional — the verifier auto-detects from its install path (`/workspace/skills/*` → slicc, else cc). |

Token resolution order: `$ADOBE_IMS_TOKEN` → `$OF1_TOKEN_FILE` → `$PWD/.hlx/.da-token.json` → `$OF1_DEMO_REPO/.hlx/.da-token.json`.

## State files written

| File | Purpose |
|------|---------|
| `$OF1_STATE_DIR/setup.json` | resolved paths + owner/repo/branch + token source (from `verify.sh`) |
| `$OF1_STATE_DIR/repo-config.json` | owner/repo/branch/contentPrefix/repoDir/domain/repoUrl/previewUrl/daSource — written interactively in Part 2 |
| `$OF1_STATE_DIR/step-1-status.json` | `{"step":1,"status":"done"\|"failed",…}`. SLICC's sprinkle polls it; CC ignores it. |

## Install behavior

- **SLICC:** the script auto-installs missing Adobe EDS skills (`stardust`, `impeccable`) via `upskill` — SLICC can activate skills mid-session. If auto-install fails, it reports the error and exits.
- **Claude Code:** cannot activate plugins installed mid-session (`/plugin install` only picks up disk changes between turns). Missing items are reported with the exact fix command for the user to run, then restart Claude Code.
```

- [ ] **Step 2: Verify no leftover references to the old flow**

```bash
grep -n "BRANCH_MODE\|create.*boilerplate\|Path A\|Path B" skills/of1-setup/SKILL.md
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add skills/of1-setup/SKILL.md
git commit -m "feat: fold of1-repo-setup's interactive flow into of1-setup"
```

---

### Task 3: Delete `of1-repo-setup`

**Files:**
- Delete: `skills/of1-repo-setup/SKILL.md` (and the now-empty directory)

**Interfaces:**
- Consumes: nothing (deletion)
- Produces: nothing — this is a pure removal. Confirmed in the design spec's
  "Downstream impact" section that no other skill file depends on this
  skill's *behavior* (only on `repo-config.json`'s output shape, which is
  unchanged).

- [ ] **Step 1: Delete the skill**

```bash
git rm -r skills/of1-repo-setup
```

- [ ] **Step 2: Verify no other skill's runtime logic references it**

```bash
grep -rn "of1-repo-setup" skills/*/SKILL.md skills/*/scripts/*.sh 2>/dev/null
```

Expected output: only `skills/of1-discovery/SKILL.md` (fixed in Task 6) and
`skills/of1-demo/SKILL.md` (fixed in Task 7) — both are prose references to
the contract, not behavioral dependencies. If anything else shows up, stop
and investigate before continuing.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: delete of1-repo-setup, folded into of1-setup"
```

---

### Task 4: `plugin.json` — remove the entrypoint

**Files:**
- Modify: `.claude-plugin/plugin.json`

**Interfaces:**
- Consumes: nothing
- Produces: the plugin manifest CC reads to know which skills exist

- [ ] **Step 1: Remove the entrypoint and fix the description**

Find:

```json
  "description": "Turn any website into an OF1 generative-search demo on Adobe Edge Delivery Services. Ships an orchestrator plus 13 step skills.",
```

Replace with:

```json
  "description": "Turn any website into an OF1 generative-search demo on Adobe Edge Delivery Services. Ships an orchestrator plus 12 step skills.",
```

Find:

```json
      "of1-setup",
      "of1-repo-setup",
      "of1-discovery",
```

Replace with:

```json
      "of1-setup",
      "of1-discovery",
```

- [ ] **Step 2: Verify valid JSON**

```bash
python3 -m json.tool < .claude-plugin/plugin.json > /dev/null && echo "valid JSON"
```

Expected: `valid JSON`.

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "chore: remove of1-repo-setup entrypoint from plugin manifest"
```

---

### Task 5: `README.md` — renumber and remove the repo-setup row

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing
- Produces: nothing (documentation only)

- [ ] **Step 1: Update the pipeline flow diagram**

Find:

```markdown
```
Steps 1→2→3→4→5 (sequential)
                 ↓
         ┌───────┴───────┐
         ↓               ↓
    Track A          Track B
         ↓               ↓
    Step 6          Steps 9,10,11
    (Snowflake)     (all parallel)
         ↓               ↓
    Steps 7+8       Step 12
    (parallel)      (Config review)
         ↓               ↓
         └───────┬───────┘
                 ↓
            Step 13 (Deploy)
```
```

Replace with:

```markdown
```
Steps 1→2→3→4 (sequential)
                 ↓
         ┌───────┴───────┐
         ↓               ↓
    Track A          Track B
         ↓               ↓
    Step 5          Steps 8,9,10
    (Snowflake)     (all parallel)
         ↓               ↓
    Steps 6+7       Step 11
    (parallel)      (Config review)
         ↓               ↓
         └───────┬───────┘
                 ↓
            Step 12 (Deploy)
```
```

- [ ] **Step 2: Update the step table**

Find:

```markdown
| Step | Name | Skill | Depends on |
|------|------|-------|------------|
| 1 | Install dependencies | `of1-setup` | — |
| 2 | Repo setup | `of1-repo-setup` | Step 1 |
| 3 | Discovery | `of1-discovery` | Step 2 |
| 4 | Extraction | `of1-extraction` | Step 3 |
| 5 | Prototype | `of1-prototype` | Step 4 |
| 6 | Snowflake | `of1-snowflake` | Step 5 |
| 7 | Templates | `of1-template-generation` | Step 6 |
| 8 | OF1 styling | `of1-generative-block-styler` | Step 6 |
| 9 | Brand & content | `of1-brand-voice-extractor` + `of1-content-metadata` | Step 5 |
| 10 | Suggestions | `of1-quick-suggestions` | Step 5 |
| 11 | CTA template | `of1-cta-template-builder` | Step 5 |
| 12 | Config review | `of1-config-review` | Steps 9+10+11 |
| 13 | Deploy | `of1-deploy` | Steps 7+8+12 |
```

Replace with:

```markdown
| Step | Name | Skill | Depends on |
|------|------|-------|------------|
| 1 | Setup | `of1-setup` | — |
| 2 | Discovery | `of1-discovery` | Step 1 |
| 3 | Extraction | `of1-extraction` | Step 2 |
| 4 | Prototype | `of1-prototype` | Step 3 |
| 5 | Snowflake | `of1-snowflake` | Step 4 |
| 6 | Templates | `of1-template-generation` | Step 5 |
| 7 | OF1 styling | `of1-generative-block-styler` | Step 5 |
| 8 | Brand & content | `of1-brand-voice-extractor` + `of1-content-metadata` | Step 4 |
| 9 | Suggestions | `of1-quick-suggestions` | Step 4 |
| 10 | CTA template | `of1-cta-template-builder` | Step 4 |
| 11 | Config review | `of1-config-review` | Steps 8+9+10 |
| 12 | Deploy | `of1-deploy` | Steps 6+7+11 |
```

- [ ] **Step 3: Remove the `of1-repo-setup` row from the skills table**

Find:

```markdown
| `of1-setup` | Verify prerequisites — skills, tools, and repo state |
| `of1-repo-setup` | Set up EDS repo (existing or new from boilerplate) + create demo branch |
| `of1-discovery` | Crawl a target website and propose a demo focus/narrative |
```

Replace with:

```markdown
| `of1-setup` | Verify prerequisites — skills, tools, and repo state; verify EDS repo + prepare repo-config.json |
| `of1-discovery` | Crawl a target website and propose a demo focus/narrative |
```

- [ ] **Step 4: Update the Prerequisites section**

Find:

```markdown
- **of1-demo repo** — cloned at `/workspace/of1-demo` (the shared AEM EDS repository where demo sites are built)
```

Replace with:

```markdown
- **EDS repo** — a valid Edge Delivery Services checkout at `OF1_DEMO_REPO` (any org/repo; verified structurally, not by identity)
```

- [ ] **Step 5: Verify no stale references remain**

```bash
grep -n "of1-repo-setup\|Step 13\|13 step" README.md
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: renumber pipeline to 12 steps in README"
```

---

### Task 6: `of1-discovery/SKILL.md` — fix the wording reference

**Files:**
- Modify: `skills/of1-discovery/SKILL.md:18`

**Interfaces:**
- Consumes: `$OF1_STATE_DIR/repo-config.json` (unchanged — same fields, now
  written by `of1-setup` instead of `of1-repo-setup`)
- Produces: nothing behavioral — wording only

- [ ] **Step 1: Fix the reference**

Find:

```markdown
Read `$OWNER`, `$REPO`, `$BRANCH`, `$DOMAIN` from the contract `of1-repo-setup` wrote:
```

Replace with:

```markdown
Read `$OWNER`, `$REPO`, `$BRANCH`, `$DOMAIN` from the contract `of1-setup` wrote:
```

- [ ] **Step 2: Commit**

```bash
git add skills/of1-discovery/SKILL.md
git commit -m "docs: fix of1-repo-setup reference in of1-discovery"
```

---

### Task 7: `of1-demo/SKILL.md` — full renumbering (SLICC orchestrator)

**Files:**
- Modify: `skills/of1-demo/SKILL.md`

**Interfaces:**
- Consumes: the sprinkle's `STEPS` array (already renumbered in
  `of1-demo.shtml` in a prior commit — this task makes the prose match it)
- Produces: nothing new — pure renumbering of existing dependency
  tables/prose so the doc matches the sprinkle's actual step indices

The "How It Works" section (lines 13-21) is already updated from a prior
commit. Everything below still uses the old 13-step numbering.

- [ ] **Step 1: Update the model-assignment table and its per-step notes**

Find (the entire table plus its preceding/following prose lines 62-91):

```markdown
| Step | Model | Why |
|------|-------|-----|
| 2 — branch setup | `claude-sonnet-5` | Mechanical: `git checkout`, `git push`, write `of1-endpoint.json`. No reasoning. |
| 3 — discovery | `claude-opus-4-6` | Brand/narrative synthesis from crawled pages. Drives the demo story. |
| 4 — extraction | `claude-opus-4-6` | Design-token + visual-system extraction. Wrong tokens cascade. |
| 5 — prototype | `claude-opus-4-6` | Pixel-perfect HTML generation requiring visual judgment. |
| 6 — snowflake | `claude-sonnet-5` | Invokes the adobe `snowflake` skill once per prototype. Thin wrapper. |
| 7a–7e — template intents | `claude-sonnet-5` | Structured generation following a clear pattern + EDS visual reference. 5 parallel scoops — biggest cost saving. |
| 7-base | `claude-sonnet-5` | Reads prototype CSS → writes `styles/of1-template-base.css` (shared tokens). Sequential, before intent fan-out. |
| 7-assemble | inline (no scoop) | Purely scripted: runs `assemble-catalog.jsh` + `fill-template.jsh`, installs gallery, single commit + push. Runs inline in the orchestrator — no LLM reasoning needed. |
| 8 — OF1 styling | `claude-opus-4-6` | CSS generation + /of1 page setup. Must follow multi-step instructions precisely (copy base CSS, patch scripts.js, create template/fragments, upload DA content). Sonnet deviates from the procedure. |
| 9a — brand voice | `claude-sonnet-5` | Synthesis from existing extraction JSON. |
| 9b — content metadata | `claude-sonnet-5` | Scrape product pages + run `download-images.jsh`. Structured. |
| 10 — quick suggestions | `claude-sonnet-5` | Generate 12 chips from discovery narrative. |
| 11 — CTA template | `claude-sonnet-5` | Generate one JSON file from DESIGN.json tokens. |
| 13 — deploy + verify | `claude-sonnet-5` | Scripted sync + verification curls + screenshots. |
```

Replace with:

```markdown
| Step | Model | Why |
|------|-------|-----|
| 2 — discovery | `claude-opus-4-6` | Brand/narrative synthesis from crawled pages. Drives the demo story. |
| 3 — extraction | `claude-opus-4-6` | Design-token + visual-system extraction. Wrong tokens cascade. |
| 4 — prototype | `claude-opus-4-6` | Pixel-perfect HTML generation requiring visual judgment. |
| 5 — snowflake | `claude-sonnet-5` | Invokes the adobe `snowflake` skill once per prototype. Thin wrapper. |
| 6a–6e — template intents | `claude-sonnet-5` | Structured generation following a clear pattern + EDS visual reference. 5 parallel scoops — biggest cost saving. |
| 6-base | `claude-sonnet-5` | Reads prototype CSS → writes `styles/of1-template-base.css` (shared tokens). Sequential, before intent fan-out. |
| 6-assemble | inline (no scoop) | Purely scripted: runs `assemble-catalog.jsh` + `fill-template.jsh`, installs gallery, single commit + push. Runs inline in the orchestrator — no LLM reasoning needed. |
| 7 — OF1 styling | `claude-opus-4-6` | CSS generation + /of1 page setup. Must follow multi-step instructions precisely (copy base CSS, patch scripts.js, create template/fragments, upload DA content). Sonnet deviates from the procedure. |
| 8a — brand voice | `claude-sonnet-5` | Synthesis from existing extraction JSON. |
| 8b — content metadata | `claude-sonnet-5` | Scrape product pages + run `download-images.jsh`. Structured. |
| 9 — quick suggestions | `claude-sonnet-5` | Generate 12 chips from discovery narrative. |
| 10 — CTA template | `claude-sonnet-5` | Generate one JSON file from DESIGN.json tokens. |
| 12 — deploy + verify | `claude-sonnet-5` | Scripted sync + verification curls + screenshots. |
```

Note: step 1 (Setup, merged) and step 11 (Config review, inline) are
intentionally absent from this table — step 1 runs via `of1-setup` (not a
scoop with a model choice) and step 11 is always inline (see its own
section below).

- [ ] **Step 2: Renumber the scoop examples for steps 6 (Snowflake) and 8 (Brand/content)**

Find:

```markdown
**For step 6 (Snowflake), the scoop MUST additionally be created with write access to the project repo AND the DA mount:**
```
scoop_scoop({
  name: "of1-s6",
```

Replace with:

```markdown
**For step 5 (Snowflake), the scoop MUST additionally be created with write access to the project repo AND the DA mount:**
```
scoop_scoop({
  name: "of1-s5",
```

Find:

```markdown
**For step 9 (Brand voice + Content metadata), spawn TWO parallel scoops** — see "Step 9 split detail" below:

```
scoop_scoop({
  name: "of1-s9-brand",
  model: "claude-sonnet-5",
  writablePaths: ["/scoops/of1-s9-brand/", "/shared/", "/workspace/{REPO_NAME}/"]
})

# Content metadata uploads images via admin.da.live API (no mount needed).
scoop_scoop({
  name: "of1-s9-content",
  model: "claude-sonnet-5",
  writablePaths: ["/scoops/of1-s9-content/", "/shared/", "/workspace/{REPO_NAME}/"]
})
```

Run these in the same orchestrator turn as scoops 10 + 11 (four scoops in one batch after step 5).
```

Replace with:

```markdown
**For step 8 (Brand voice + Content metadata), spawn TWO parallel scoops** — see "Step 8 split detail" below:

```
scoop_scoop({
  name: "of1-s8-brand",
  model: "claude-sonnet-5",
  writablePaths: ["/scoops/of1-s8-brand/", "/shared/", "/workspace/{REPO_NAME}/"]
})

# Content metadata uploads images via admin.da.live API (no mount needed).
scoop_scoop({
  name: "of1-s8-content",
  model: "claude-sonnet-5",
  writablePaths: ["/scoops/of1-s8-content/", "/shared/", "/workspace/{REPO_NAME}/"]
})
```

Run these in the same orchestrator turn as scoops 9 + 10 (four scoops in one batch after step 4).
```

- [ ] **Step 3: Renumber the Step 7 → Step 6 template fan-out section**

Find:

```markdown
**For step 7 (Templates), spawn SIX scoops across 2 phases — one `base` scoop + five parallel intent scoops — then run assemble INLINE** (see "Step 7 fan-out detail" below for the rationale):

⚠️ **NEVER use `OF1_TG_MODE=all` (single-scoop mode).** It runs all 25 templates serially in one scoop (~18+ min) and produces incomplete output. Always use the 3-phase fan-out below. The `all` mode exists in the skill only as a fallback for environments that cannot fan out — SLICC CAN fan out, so always do so.

**Phase 1 — base (sequential, after Step 6):** spawn `of1-s7-base` alongside Step 8. It generates `styles/of1-template-base.css` from the prototype CSS — the shared design tokens all 25 per-template CSS files `@import`. Must finish before intent agents start.
```
scoop_scoop({
  name: "of1-s7-base",
  model: "claude-sonnet-5",
  writablePaths: ["/scoops/of1-s7-base/", "/shared/", "/workspace/{REPO_NAME}/"],
  env: { OF1_TG_MODE: "base" }
})
```

**Phase 2 — intent (5 parallel scoops, after base finishes):** spawn once `/shared/of1-demo/step-7-base-status.json` exists. Each writes only 5 templates (20 files). Do NOT combine intents into fewer scoops — parallelism is the speed win.
```
for INTENT in comparison recommendation deep-dive budget discovery; do
  scoop_scoop({
    name: "of1-s7-${INTENT}",
    model: "claude-sonnet-5",
    writablePaths: ["/scoops/of1-s7-${INTENT}/", "/shared/", "/workspace/{REPO_NAME}/"],
    env: { OF1_TG_MODE: "intent", OF1_TG_INTENT: "${INTENT}" }
  })
done
```
Intent scoops do NOT need DA mount access — they only write to the local repo.

**Phase 3 — assemble (ALWAYS inline, NEVER a scoop):** once all 5 intent status files (`/shared/of1-demo/step-7-intent-<intent>-status.json`) exist, run assemble **inline in the orchestrator**. Assemble is purely scripted — no LLM reasoning needed. Do NOT spawn a scoop; it adds 15+ min of scheduling overhead for zero benefit.

```bash
cd "$REPO_DIR"
run_jsh /workspace/skills/of1-template-generation/assets/assemble-catalog.jsh . "$OWNER" "$REPO" "$BRANCH"
mkdir -p tools drafts gallery
cp /workspace/skills/of1-template-generation/assets/fill-template.jsh tools/fill-template.jsh
for TPL in templates/of1-*.html; do
  NAME=$(basename "$TPL" .html)
  [ -f "templates/${NAME}.sample.json" ] && run_jsh tools/fill-template.jsh "$TPL" "templates/${NAME}.sample.json" "drafts/${NAME}-sample.html"
done
cp /workspace/skills/of1-template-generation/assets/gallery.html gallery/index.html
git add styles/of1-template-base.css styles/of1-*.css templates/ of1/config/templates.json drafts/ tools/ gallery/
git commit -m "feat: 25 OF1 templates (5 intents × 5 variations) for ${DOMAIN}"
git push origin "$BRANCH"
echo '{"step":7,"status":"review","deliverable":"https://'${BRANCH}'--'${REPO}'--'${OWNER}'.aem.page/gallery/index.html","summary":"25 templates assembled."}' > /shared/of1-demo/step-7-status.json
```
```

Replace with:

```markdown
**For step 6 (Templates), spawn SIX scoops across 2 phases — one `base` scoop + five parallel intent scoops — then run assemble INLINE** (see "Step 6 fan-out detail" below for the rationale):

⚠️ **NEVER use `OF1_TG_MODE=all` (single-scoop mode).** It runs all 25 templates serially in one scoop (~18+ min) and produces incomplete output. Always use the 3-phase fan-out below. The `all` mode exists in the skill only as a fallback for environments that cannot fan out — SLICC CAN fan out, so always do so.

**Phase 1 — base (sequential, after Step 5):** spawn `of1-s6-base` alongside Step 7. It generates `styles/of1-template-base.css` from the prototype CSS — the shared design tokens all 25 per-template CSS files `@import`. Must finish before intent agents start.
```
scoop_scoop({
  name: "of1-s6-base",
  model: "claude-sonnet-5",
  writablePaths: ["/scoops/of1-s6-base/", "/shared/", "/workspace/{REPO_NAME}/"],
  env: { OF1_TG_MODE: "base" }
})
```

**Phase 2 — intent (5 parallel scoops, after base finishes):** spawn once `/shared/of1-demo/step-6-base-status.json` exists. Each writes only 5 templates (20 files). Do NOT combine intents into fewer scoops — parallelism is the speed win.
```
for INTENT in comparison recommendation deep-dive budget discovery; do
  scoop_scoop({
    name: "of1-s6-${INTENT}",
    model: "claude-sonnet-5",
    writablePaths: ["/scoops/of1-s6-${INTENT}/", "/shared/", "/workspace/{REPO_NAME}/"],
    env: { OF1_TG_MODE: "intent", OF1_TG_INTENT: "${INTENT}" }
  })
done
```
Intent scoops do NOT need DA mount access — they only write to the local repo.

**Phase 3 — assemble (ALWAYS inline, NEVER a scoop):** once all 5 intent status files (`/shared/of1-demo/step-6-intent-<intent>-status.json`) exist, run assemble **inline in the orchestrator**. Assemble is purely scripted — no LLM reasoning needed. Do NOT spawn a scoop; it adds 15+ min of scheduling overhead for zero benefit.

```bash
cd "$REPO_DIR"
run_jsh /workspace/skills/of1-template-generation/assets/assemble-catalog.jsh . "$OWNER" "$REPO" "$BRANCH"
mkdir -p tools drafts gallery
cp /workspace/skills/of1-template-generation/assets/fill-template.jsh tools/fill-template.jsh
for TPL in templates/of1-*.html; do
  NAME=$(basename "$TPL" .html)
  [ -f "templates/${NAME}.sample.json" ] && run_jsh tools/fill-template.jsh "$TPL" "templates/${NAME}.sample.json" "drafts/${NAME}-sample.html"
done
cp /workspace/skills/of1-template-generation/assets/gallery.html gallery/index.html
git add styles/of1-template-base.css styles/of1-*.css templates/ of1/config/templates.json drafts/ tools/ gallery/
git commit -m "feat: 25 OF1 templates (5 intents × 5 variations) for ${DOMAIN}"
git push origin "$BRANCH"
echo '{"step":6,"status":"review","deliverable":"https://'${BRANCH}'--'${REPO}'--'${OWNER}'.aem.page/gallery/index.html","summary":"25 templates assembled."}' > /shared/of1-demo/step-6-status.json
```
```

- [ ] **Step 4: Renumber the Context Passing / dependency-graph / parallelism sections**

Find:

```markdown
| Trigger | Spawn immediately |
|---------|-------------------|
| Step 5 (Prototype) approved | **Track A:** Step 6 (Snowflake) AND **Track B:** Steps 9a, 9b, 11 (three scoops at once) |
| Steps 9a + 9b done | Step 10 (Suggestions — needs products.json + brand-voice.json) |
| Step 6 (Snowflake) done | Step 8 (OF1 styling) AND Steps 7a–7e (5 intent scoops in parallel) — 6 scoops at once |
| Steps 7a–7e ALL complete | Step 7-assemble — run INLINE in orchestrator (no scoop) |
| Steps 9-11 ALL complete | Step 12 (Config review) — run inline by the cone |
| Steps 7-assemble + 8 done AND Step 12 approved | Step 13 (Deploy) |
```

Replace with:

```markdown
| Trigger | Spawn immediately |
|---------|-------------------|
| Step 4 (Prototype) approved | **Track A:** Step 5 (Snowflake) AND **Track B:** Steps 8a, 8b, 10 (three scoops at once) |
| Steps 8a + 8b done | Step 9 (Suggestions — needs products.json + brand-voice.json) |
| Step 5 (Snowflake) done | Step 7 (OF1 styling) AND Steps 6a–6e (5 intent scoops in parallel) — 6 scoops at once |
| Steps 6a–6e ALL complete | Step 6-assemble — run INLINE in orchestrator (no scoop) |
| Steps 8-10 ALL complete | Step 11 (Config review) — run inline by the cone |
| Steps 6-assemble + 7 done AND Step 11 approved | Step 12 (Deploy) |
```

Find:

```markdown
### Dependency graph:
```
Steps 1→2 (sequential)
         ↓
    ┌────┴────┐
    ↓         ↓
  Step 3    Step 4        ← PARALLEL (both need only domain)
    ↓         ↓
    └────┬────┘
         ↓
       Step 5             ← needs both S3 + S4
         ↓
    ┌────┴────────────┐
    ↓                 ↓
  S6         Track B (S9+S10+S11)
    ↓                 ↓
  ┌─┴────────┐    Step 12
  S8   S7a∥7b∥7c∥7d∥7e
  ↓         ↓
  ↓     S7-assemble       ← runs ONCE after S7a–7e all done
  ↓         ↓             ↓
  └─────────┴─────────────┘
            ↓
       Step 13 (Deploy)
```
```

Replace with:

```markdown
### Dependency graph:
```
Step 1 (Setup)
         ↓
    ┌────┴────┐
    ↓         ↓
  Step 2    Step 3        ← PARALLEL (both need only domain)
    ↓         ↓
    └────┬────┘
         ↓
       Step 4             ← needs both S2 + S3
         ↓
    ┌────┴────────────┐
    ↓                 ↓
  S5         Track B (S8+S9+S10)
    ↓                 ↓
  ┌─┴────────┐    Step 11
  S7   S6a∥6b∥6c∥6d∥6e
  ↓         ↓
  ↓     S6-assemble       ← runs ONCE after S6a–6e all done
  ↓         ↓             ↓
  └─────────┴─────────────┘
            ↓
       Step 12 (Deploy)
```
```

Find:

```markdown
### Key rules:
1. **Track B does NOT wait for Step 6** — it starts immediately after Step 5 is approved
2. **Step 8 (OF1 styling) runs AFTER Step 6** — it must not overwrite of1.css that S6 creates. S8 commits last.
3. **Step 7 (Templates) waits for Step 6** — it needs the template CSS structure from the snowflake conversion
4. **Step 7 is FANNED OUT into 5 parallel intent scoops (7a–7e) + 1 assemble scoop** — see "Step 7 fan-out detail" below
5. **Step 8 runs in parallel with Steps 7a–7e** — 6 scoops at once after Step 6
6. **Steps 9a, 9b, 11 run at once** — spawn all 3 scoops simultaneously. **Step 10 waits for step 9 to finish** (it needs products.json + brand-voice.json to ground suggestions in real content)
7. **Push each status as it arrives** — don't wait for all parallel steps to finish before updating the sprinkle
```

Replace with:

```markdown
### Key rules:
1. **Track B does NOT wait for Step 5** — it starts immediately after Step 4 is approved
2. **Step 7 (OF1 styling) runs AFTER Step 5** — it must not overwrite of1.css that S5 creates. S7 commits last.
3. **Step 6 (Templates) waits for Step 5** — it needs the template CSS structure from the snowflake conversion
4. **Step 6 is FANNED OUT into 5 parallel intent scoops (6a–6e) + 1 assemble scoop** — see "Step 6 fan-out detail" below
5. **Step 7 runs in parallel with Steps 6a–6e** — 6 scoops at once after Step 5
6. **Steps 8a, 8b, 10 run at once** — spawn all 3 scoops simultaneously. **Step 9 waits for step 8 to finish** (it needs products.json + brand-voice.json to ground suggestions in real content)
7. **Push each status as it arrives** — don't wait for all parallel steps to finish before updating the sprinkle
```

Find:

```markdown
### Step 7 fan-out detail

Step 7 (template generation) is split into 7 scoops across 3 phases plus a small inline screenshot step:

- **Pre-fan-out (inline, orchestrator):** capture EDS-rendered visual references of all prototypes so the intent scoops see the actual rendered design system (see "Pre-fan-out: capture EDS visual reference" below).
- **7-base (sequential, 1 scoop):** named `of1-s7-base`. Runs `of1-template-generation` with `OF1_TG_MODE=base`. Generates `styles/of1-template-base.css` from the prototype CSS — the shared design tokens all per-template CSS files `@import`. Writes `/shared/of1-demo/step-7-base-status.json`. Must finish before intent scoops start.
- **7a–7e (parallel, 5 scoops):** named `of1-s7-comparison`, `of1-s7-recommendation`, `of1-s7-deep-dive`, `of1-s7-budget`, `of1-s7-discovery`. Each runs with `OF1_TG_MODE=intent` and `OF1_TG_INTENT=<intent>`. Each writes only its own `templates/of1-{intent}-*` + `styles/of1-{intent}-*` files. **No git operations.** Each writes `/shared/of1-demo/step-7-intent-<intent>-status.json` on completion.
- **7-assemble (inline, after 7a–7e):** runs in the orchestrator (NOT a scoop). Purely scripted: runs `assemble-catalog.jsh`, `fill-template.jsh`, installs the gallery, single commit + push. Writes the canonical `/shared/of1-demo/step-7-status.json` that the sprinkle reads.
```

Replace with:

```markdown
### Step 6 fan-out detail

Step 6 (template generation) is split into 7 scoops across 3 phases plus a small inline screenshot step:

- **Pre-fan-out (inline, orchestrator):** capture EDS-rendered visual references of all prototypes so the intent scoops see the actual rendered design system (see "Pre-fan-out: capture EDS visual reference" below).
- **6-base (sequential, 1 scoop):** named `of1-s6-base`. Runs `of1-template-generation` with `OF1_TG_MODE=base`. Generates `styles/of1-template-base.css` from the prototype CSS — the shared design tokens all per-template CSS files `@import`. Writes `/shared/of1-demo/step-6-base-status.json`. Must finish before intent scoops start.
- **6a–6e (parallel, 5 scoops):** named `of1-s6-comparison`, `of1-s6-recommendation`, `of1-s6-deep-dive`, `of1-s6-budget`, `of1-s6-discovery`. Each runs with `OF1_TG_MODE=intent` and `OF1_TG_INTENT=<intent>`. Each writes only its own `templates/of1-{intent}-*` + `styles/of1-{intent}-*` files. **No git operations.** Each writes `/shared/of1-demo/step-6-intent-<intent>-status.json` on completion.
- **6-assemble (inline, after 6a–6e):** runs in the orchestrator (NOT a scoop). Purely scripted: runs `assemble-catalog.jsh`, `fill-template.jsh`, installs the gallery, single commit + push. Writes the canonical `/shared/of1-demo/step-6-status.json` that the sprinkle reads.
```

Find:

```markdown
### Pre-fan-out: capture EDS visual reference (inline)

After step 6 returns `done` and before spawning 7a–7e, the orchestrator captures the EDS-rendered prototype-home and writes it to a known local path that all 5 intent scoops will read. This gives the agents the actual rendered styling stack (snowflake + OF1 + EDS base) instead of just the standalone prototype HTML.
```

Replace with:

```markdown
### Pre-fan-out: capture EDS visual reference (inline)

After step 5 returns `done` and before spawning 6a–6e, the orchestrator captures the EDS-rendered prototype-home and writes it to a known local path that all 5 intent scoops will read. This gives the agents the actual rendered styling stack (snowflake + OF1 + EDS base) instead of just the standalone prototype HTML.
```

Find:

```markdown
Spawn 7a–7e and Step 8 in the **same orchestrator turn** (6 scoops total). After all 5 intent status files exist, run assemble **inline** (no scoop). The sprinkle UI shows a single "Step 7" row; the orchestrator only pushes the step-7 status after the inline assemble writes `step-7-status.json`.

**Writable paths for ALL 6 step-7 scoops** (intent and assemble): the project repo (`/workspace/of1-demo/`) and `/shared/`. Intent scoops do not need DA mount access (no uploads from this step).

If any intent scoop fails, retry only that one. If `of1-s7-assemble` fails, fix and re-run it alone — intent outputs are intact.

### Step 9 split detail

Step 9 used to be a single scoop that ran `of1-brand-voice-extractor` and `of1-content-metadata` back-to-back (~12 min). They're independent — both consume Step 4's extraction output and produce different config files — so split into two parallel scoops alongside Steps 10 and 11.

- **`of1-s9-brand`** — runs `of1-brand-voice-extractor`. Produces `of1/config/brand-voice.json`. Writes `/shared/of1-demo/step-9-brand-status.json`. ~1–2 min.
- **`of1-s9-content`** — runs `of1-content-metadata`. Produces `of1/config/{products,personas,use-cases,features,faqs}.json` + uploads all product images. Writes `/shared/of1-demo/step-9-content-status.json`. ~3–5 min.

The content scoop **MUST use `download-images.jsh`** (parallel: 8 workers, content-type sniffing, mount-or-API fallback) — NOT a per-image `curl` loop. The skill documents this in its Step 9 section; no separate injection needed.

Once both `/shared/of1-demo/step-9-brand-status.json` AND `step-9-content-status.json` exist, the orchestrator merges them into a single `/shared/of1-demo/step-9-status.json`:

```bash
if [ -f /shared/of1-demo/step-9-brand-status.json ] \
   && [ -f /shared/of1-demo/step-9-content-status.json ] \
   && [ ! -f /shared/of1-demo/step-9-status.json ]; then
  BRAND_SUMMARY=$(jq -r .summary /shared/of1-demo/step-9-brand-status.json)
  CONTENT_SUMMARY=$(jq -r .summary /shared/of1-demo/step-9-content-status.json)
  jq -n \
    --arg s1 "$BRAND_SUMMARY" --arg s2 "$CONTENT_SUMMARY" \
    '{step:9, status:"done", summary:($s1 + " | " + $s2)}' \
    > /shared/of1-demo/step-9-status.json
fi
```
```

Replace with:

```markdown
Spawn 6a–6e and Step 7 in the **same orchestrator turn** (6 scoops total). After all 5 intent status files exist, run assemble **inline** (no scoop). The sprinkle UI shows a single "Step 6" row; the orchestrator only pushes the step-6 status after the inline assemble writes `step-6-status.json`.

**Writable paths for ALL 6 step-6 scoops** (intent and assemble): the project repo (`/workspace/of1-demo/`) and `/shared/`. Intent scoops do not need DA mount access (no uploads from this step).

If any intent scoop fails, retry only that one. If `of1-s6-assemble` fails, fix and re-run it alone — intent outputs are intact.

### Step 8 split detail

Step 8 used to be a single scoop that ran `of1-brand-voice-extractor` and `of1-content-metadata` back-to-back (~12 min). They're independent — both consume Step 3's extraction output and produce different config files — so split into two parallel scoops alongside Steps 9 and 10.

- **`of1-s8-brand`** — runs `of1-brand-voice-extractor`. Produces `of1/config/brand-voice.json`. Writes `/shared/of1-demo/step-8-brand-status.json`. ~1–2 min.
- **`of1-s8-content`** — runs `of1-content-metadata`. Produces `of1/config/{products,personas,use-cases,features,faqs}.json` + uploads all product images. Writes `/shared/of1-demo/step-8-content-status.json`. ~3–5 min.

The content scoop **MUST use `download-images.jsh`** (parallel: 8 workers, content-type sniffing, mount-or-API fallback) — NOT a per-image `curl` loop. The skill documents this in its Step 8 section; no separate injection needed.

Once both `/shared/of1-demo/step-8-brand-status.json` AND `step-8-content-status.json` exist, the orchestrator merges them into a single `/shared/of1-demo/step-8-status.json`:

```bash
if [ -f /shared/of1-demo/step-8-brand-status.json ] \
   && [ -f /shared/of1-demo/step-8-content-status.json ] \
   && [ ! -f /shared/of1-demo/step-8-status.json ]; then
  BRAND_SUMMARY=$(jq -r .summary /shared/of1-demo/step-8-brand-status.json)
  CONTENT_SUMMARY=$(jq -r .summary /shared/of1-demo/step-8-content-status.json)
  jq -n \
    --arg s1 "$BRAND_SUMMARY" --arg s2 "$CONTENT_SUMMARY" \
    '{step:8, status:"done", summary:($s1 + " | " + $s2)}' \
    > /shared/of1-demo/step-8-status.json
fi
```
```

- [ ] **Step 5: Renumber the "Handling scoop completions" and merge-logic examples**

Find:

```markdown
**Step 9 merge logic:** when both `step-9-brand-status.json` and `step-9-content-status.json` exist, merge them:

```bash
BRAND_SUM=$(jq -r .summary /shared/of1-demo/step-9-brand-status.json)
CONTENT_SUM=$(jq -r .summary /shared/of1-demo/step-9-content-status.json)
jq -n --arg s1 "$BRAND_SUM" --arg s2 "$CONTENT_SUM" \
  '{step:9, status:"done", summary:($s1 + " | " + $s2)}' \
  > /shared/of1-demo/step-9-status.json
sprinkle send of1-demo "$(cat /shared/of1-demo/step-9-status.json)"
```

**Step 7 fan-out logic:** when all 5 `step-7-intent-<intent>-status.json` files exist, run assemble (inline or spawn — see Phase 3 above). Only push step 7 status after assemble writes `step-7-status.json`.
```

Replace with:

```markdown
**Step 8 merge logic:** when both `step-8-brand-status.json` and `step-8-content-status.json` exist, merge them:

```bash
BRAND_SUM=$(jq -r .summary /shared/of1-demo/step-8-brand-status.json)
CONTENT_SUM=$(jq -r .summary /shared/of1-demo/step-8-content-status.json)
jq -n --arg s1 "$BRAND_SUM" --arg s2 "$CONTENT_SUM" \
  '{step:8, status:"done", summary:($s1 + " | " + $s2)}' \
  > /shared/of1-demo/step-8-status.json
sprinkle send of1-demo "$(cat /shared/of1-demo/step-8-status.json)"
```

**Step 6 fan-out logic:** when all 5 `step-6-intent-<intent>-status.json` files exist, run assemble (inline or spawn — see Phase 3 above). Only push step 6 status after assemble writes `step-6-status.json`.
```

Find:

```markdown
For step 9 see "Step 9 split detail" above — the merge logic combines the two sub-status files into a single `step-9-status.json` before pushing to the sprinkle.
```

Replace with:

```markdown
For step 8 see "Step 8 split detail" above — the merge logic combines the two sub-status files into a single `step-8-status.json` before pushing to the sprinkle.
```

- [ ] **Step 6: Renumber One-Shot Mode, Deliverable URLs table, Step → Skill mapping, Track Summary**

Find:

```markdown
3. **Pre-launch checklist still runs** — Step 13 must pass all 5 checks before marking done
```

Replace with:

```markdown
3. **Pre-launch checklist still runs** — Step 12 must pass all 5 checks before marking done
```

Find:

```markdown
| Step | Deliverable URL |
|------|----------------|
| 2 | `https://github.com/{owner}/{repo}/tree/{branch}` |
| 3 | `https://{branch}--{repo}--{owner}.aem.page/deliverables/discovery.html` |
| 4 | `https://{branch}--{repo}--{owner}.aem.page/deliverables/brand-review.html` |
| 5 | `https://{branch}--{repo}--{owner}.aem.page/deliverables/prototype-home.html` |
| 6 | `https://{branch}--{repo}--{owner}.aem.page/prototype-home` |
| 7 | `https://{branch}--{repo}--{owner}.aem.page/gallery/index.html` |
| 8 | `https://{branch}--{repo}--{owner}.aem.page/of1` |
| 12 | `https://{branch}--{repo}--{owner}.aem.page/deliverables/config-review.html` |
| 13 | `https://{branch}--{repo}--{owner}.aem.page/deliverables/index.html` |
```

Replace with:

```markdown
| Step | Deliverable URL |
|------|----------------|
| 1 | `https://github.com/{owner}/{repo}/tree/{branch}` |
| 2 | `https://{branch}--{repo}--{owner}.aem.page/deliverables/discovery.html` |
| 3 | `https://{branch}--{repo}--{owner}.aem.page/deliverables/brand-review.html` |
| 4 | `https://{branch}--{repo}--{owner}.aem.page/deliverables/prototype-home.html` |
| 5 | `https://{branch}--{repo}--{owner}.aem.page/prototype-home` |
| 6 | `https://{branch}--{repo}--{owner}.aem.page/gallery/index.html` |
| 7 | `https://{branch}--{repo}--{owner}.aem.page/of1` |
| 11 | `https://{branch}--{repo}--{owner}.aem.page/deliverables/config-review.html` |
| 12 | `https://{branch}--{repo}--{owner}.aem.page/deliverables/index.html` |
```

Find:

```markdown
| Step | Name | Skill(s) | Review | Track | Depends on |
|------|------|-----------|--------|-------|------------|
| 1 | Install dependencies | `of1-setup` | No | — | nothing |
| 2 | Repo setup | `of1-repo-setup` | No | — | step 1 |
| 3 | Discovery | `of1-discovery` | Yes | — | step 2 |
| 4 | Extraction | `of1-extraction` | Yes | — | step 2 (runs parallel with step 3) |
| 5 | Prototype | `of1-prototype` | Yes | — | steps 3 + 4 (needs both) |
| 6 | Snowflake | `of1-snowflake` | Yes | A | step 5 |
| 7 | Templates (fan-out) | `of1-template-generation` (×5 intent scoops + 1 assemble scoop) | Yes | A | step 6 |
| 8 | OF1 styling | `of1-generative-block-styler` | Yes | A | step 6 (must run AFTER S6 to avoid overwriting of1.css) |
| 9 | Brand & content (split) | `of1-brand-voice-extractor` (scoop `of1-s9-brand`) + `of1-content-metadata` (scoop `of1-s9-content`) — 2 parallel scoops | No | B | step 5 |
| 10 | Suggestions | `of1-quick-suggestions` | No | B | step 5 |
| 11 | CTA template | `of1-cta-template-builder` | No | B | step 5 |
| 12 | Config review | (orchestrator-inline) | Yes | B | steps 9+10+11 |
| 13 | Deploy | `of1-deploy` | Yes | — | steps 7+8+12 |

### Track Summary

**Track A (EDS Site):** Step 6 starts after Step 5 → Step 8 AND Steps 7a–7e (5 parallel intent scoops) start in parallel after Step 6 → Step 7-assemble runs once 7a–7e all complete

**Track B (Config):** Steps 9a + 9b + 11 (parallel, start after step 5) → Step 10 (after 9 done) → Step 12 (Config review)

**Both tracks start after Step 5 is approved.** Track B does NOT wait for Step 6. Step 8 DOES wait for Step 6 — it must commit AFTER S6 so it doesn't get overwritten.

**Step 13 (Deploy)** requires Track A (step 7-assemble done AND step 8 done) AND Track B (step 12 approved).
```

Replace with:

```markdown
| Step | Name | Skill(s) | Review | Track | Depends on |
|------|------|-----------|--------|-------|------------|
| 1 | Setup | `of1-setup` | No | — | nothing |
| 2 | Discovery | `of1-discovery` | Yes | — | step 1 |
| 3 | Extraction | `of1-extraction` | Yes | — | step 1 (runs parallel with step 2) |
| 4 | Prototype | `of1-prototype` | Yes | — | steps 2 + 3 (needs both) |
| 5 | Snowflake | `of1-snowflake` | Yes | A | step 4 |
| 6 | Templates (fan-out) | `of1-template-generation` (×5 intent scoops + 1 assemble scoop) | Yes | A | step 5 |
| 7 | OF1 styling | `of1-generative-block-styler` | Yes | A | step 5 (must run AFTER S5 to avoid overwriting of1.css) |
| 8 | Brand & content (split) | `of1-brand-voice-extractor` (scoop `of1-s8-brand`) + `of1-content-metadata` (scoop `of1-s8-content`) — 2 parallel scoops | No | B | step 4 |
| 9 | Suggestions | `of1-quick-suggestions` | No | B | step 4 |
| 10 | CTA template | `of1-cta-template-builder` | No | B | step 4 |
| 11 | Config review | (orchestrator-inline) | Yes | B | steps 8+9+10 |
| 12 | Deploy | `of1-deploy` | Yes | — | steps 6+7+11 |

### Track Summary

**Track A (EDS Site):** Step 5 starts after Step 4 → Step 7 AND Steps 6a–6e (5 parallel intent scoops) start in parallel after Step 5 → Step 6-assemble runs once 6a–6e all complete

**Track B (Config):** Steps 8a + 8b + 10 (parallel, start after step 4) → Step 9 (after 8 done) → Step 11 (Config review)

**Both tracks start after Step 4 is approved.** Track B does NOT wait for Step 5. Step 7 DOES wait for Step 5 — it must commit AFTER S5 so it doesn't get overwritten.

**Step 12 (Deploy)** requires Track A (step 6-assemble done AND step 7 done) AND Track B (step 11 approved).
```

- [ ] **Step 7: Remove the obsolete "Step 2 — Branch Setup" section**

Find (the entire section, from the heading through the bullet list ending
before "## Screenshot Diff Loop"):

```markdown
## Step 2 — Branch Setup

This step creates a domain-specific branch on the EDS demo repo and sets up the output directory.

The repo is already cloned at `/workspace/of1-demo`. The step:
1. Fetches latest from origin
2. Creates a branch named after the domain (without TLD, e.g., `frescopa` for `frescopa.coffee`)
3. Creates `output/{DOMAIN}/` directory for deliverables
4. Verifies DA API access (oauth-token adobe)

The step outputs `/shared/of1-demo/repo-config.json` which all subsequent steps use:
```json
{
  "owner": "<org>",
  "repo": "<repo>",
  "branch": "frescopa",
  "repoUrl": "https://github.com/<org>/<repo>",
  "previewUrl": "https://frescopa--<repo>--<org>.aem.page/",
  "daSource": "da://<org>/<repo>",
  "repoDir": "/workspace/of1-demo",
  "domain": "frescopa.coffee"
}
```

**All subsequent steps MUST read this file** to determine:
- Where to find the git repo (`repoDir`)
- Which branch to work on (`branch`)
- The DA mount source (`daSource`)
- The EDS preview URL (`previewUrl`)
- The preview/live URL patterns (`previewUrl`)
- The GitHub owner and repo name for branch URLs
```

Replace with:

```markdown
## Step 1 — Setup

Setup verifies prerequisites AND repo state (see the `of1-setup` skill —
this absorbed what used to be a separate "Repo setup" step). It does NOT
create a branch — it uses whatever branch is currently checked out at
`OF1_DEMO_REPO`.

The step outputs `/shared/of1-demo/repo-config.json` which all subsequent steps use:
```json
{
  "owner": "<org>",
  "repo": "<repo>",
  "branch": "<current-branch>",
  "contentPrefix": "<current-branch>",
  "repoUrl": "https://github.com/<org>/<repo>",
  "previewUrl": "https://<current-branch>--<repo>--<org>.aem.page/",
  "daSource": "da://<org>/<repo>",
  "repoDir": "/workspace/of1-demo",
  "domain": "frescopa.coffee"
}
```

**All subsequent steps MUST read this file** to determine:
- Where to find the git repo (`repoDir`)
- Which branch to work on (`branch`)
- The DA mount source (`daSource`)
- The EDS preview URL (`previewUrl`)
- The preview/live URL patterns (`previewUrl`)
- The GitHub owner and repo name for branch URLs
```

- [ ] **Step 8: Renumber the Screenshot Diff Loop section**

Find:

```markdown
Both the Prototype step (5) and the Snowflake step (6) MUST run a screenshot-based comparison loop before marking the step as review. This ensures visual fidelity.
```

Replace with:

```markdown
Both the Prototype step (4) and the Snowflake step (5) MUST run a screenshot-based comparison loop before marking the step as review. This ensures visual fidelity.
```

Find:

```markdown
1. **Screenshot the reference** — the live site (Step 5) or the prototype (Step 6)
2. **Screenshot the output** — the prototype HTML (Step 5) or the EDS preview URL (Step 6)
```

Replace with:

```markdown
1. **Screenshot the reference** — the live site (Step 4) or the prototype (Step 5)
2. **Screenshot the output** — the prototype HTML (Step 4) or the EDS preview URL (Step 5)
```

Find:

```markdown
### Step 5 specifics
- Reference = live site screenshot
- Output = prototype HTML served locally (`file://...`)
- Fix = edit the prototype HTML/CSS directly

### Step 6 specifics
- Reference = prototype screenshot (from Step 5 output)
- Output = EDS preview URL screenshot
- Fix = edit block CSS/JS, content HTML, re-push + re-preview
```

Replace with:

```markdown
### Step 4 specifics
- Reference = live site screenshot
- Output = prototype HTML served locally (`file://...`)
- Fix = edit the prototype HTML/CSS directly

### Step 5 specifics
- Reference = prototype screenshot (from Step 4 output)
- Output = EDS preview URL screenshot
- Fix = edit block CSS/JS, content HTML, re-push + re-preview
```

- [ ] **Step 9: Renumber the Scoop Naming and Context Passing sections**

Find:

```markdown
Name step scoops: `of1-s1`, `of1-s2`, ..., `of1-s13`. This keeps them short and identifiable.
```

Replace with:

```markdown
Name step scoops: `of1-s1`, `of1-s2`, ..., `of1-s12`. This keeps them short and identifiable.
```

Find (the entire Context Passing bullet list):

```markdown
- **Step 1 (Install dependencies)** needs: nothing (can run without domain)
- **Step 2 (Branch setup)** needs: domain. Creates branch on the EDS demo repo and outputs `repo-config.json`.
- **Step 3 (Discovery)** needs: domain — runs in PARALLEL with step 4
- **Step 4 (Extraction)** needs: domain only (does NOT need discovery output). Extracts design tokens, colors, typography, logo, and screenshots from the live site. Produces PRODUCT.md, DESIGN.json, screenshots, logo, and brand-review.html under `stardust/current/`. Runs in PARALLEL with step 3.
- **Step 5 (Prototype)** needs: domain + extraction outputs from step 4 (`stardust/current/`) + discovery output from step 3 (key pages and narrative). Waits for BOTH S3 and S4 to complete. When composing the step-5 prompt, list ALL key pages from discovery and require prototypes for each. Never say "focus on homepage" or "if time permits" — all pages are equally mandatory. The scoop must produce one prototype per key page.
- **Step 6 (Snowflake)** needs: domain, prototypes from step 5, repo-config.json
- **Step 7 (Templates)** is fanned out into 1 `base` + 5 parallel `intent` + 1 `assemble` scoop (see "Step 7 fan-out detail"):
  - The base scoop needs: prototype CSS files from step 6, `DESIGN.json` from step 4. It generates `styles/of1-template-base.css`.
  - Each intent scoop needs: domain, `styles/of1-template-base.css` (from base), demo narrative from step 3, prototype CSS + slot-marked templates from step 6, plus its assigned `OF1_TG_INTENT`
  - The assemble scoop needs: all 25 per-intent template + CSS files (from the 5 intent scoops), repo-config.json. It owns the single commit + push.
- **Step 8 (OF1 styling)** needs: domain, block names from step 6, `stardust/` data
- **Steps 9–12 (Track B)** need: domain, `stardust/` data from step 4. They do NOT depend on the snowflake — they can start immediately after step 5.
- **Step 12 (Config review)** needs: all `of1/config/` files from steps 9-11 — orchestrator generates review page inline
- **Step 13 (Deploy)** needs: step 7-assemble done AND step 8 done (Track A) AND step 12 approved (Track B), plus domain, all config files, repo-config.json
```

Replace with:

```markdown
- **Step 1 (Setup)** needs: an EDS repo checked out at `OF1_DEMO_REPO` on the branch to use. Verifies prerequisites + repo state and outputs `repo-config.json`. Does NOT create a branch.
- **Step 2 (Discovery)** needs: domain — runs in PARALLEL with step 3
- **Step 3 (Extraction)** needs: domain only (does NOT need discovery output). Extracts design tokens, colors, typography, logo, and screenshots from the live site. Produces PRODUCT.md, DESIGN.json, screenshots, logo, and brand-review.html under `stardust/current/`. Runs in PARALLEL with step 2.
- **Step 4 (Prototype)** needs: domain + extraction outputs from step 3 (`stardust/current/`) + discovery output from step 2 (key pages and narrative). Waits for BOTH S2 and S3 to complete. When composing the step-4 prompt, list ALL key pages from discovery and require prototypes for each. Never say "focus on homepage" or "if time permits" — all pages are equally mandatory. The scoop must produce one prototype per key page.
- **Step 5 (Snowflake)** needs: domain, prototypes from step 4, repo-config.json
- **Step 6 (Templates)** is fanned out into 1 `base` + 5 parallel `intent` + 1 `assemble` scoop (see "Step 6 fan-out detail"):
  - The base scoop needs: prototype CSS files from step 5, `DESIGN.json` from step 3. It generates `styles/of1-template-base.css`.
  - Each intent scoop needs: domain, `styles/of1-template-base.css` (from base), demo narrative from step 2, prototype CSS + slot-marked templates from step 5, plus its assigned `OF1_TG_INTENT`
  - The assemble scoop needs: all 25 per-intent template + CSS files (from the 5 intent scoops), repo-config.json. It owns the single commit + push.
- **Step 7 (OF1 styling)** needs: domain, block names from step 5, `stardust/` data
- **Steps 8–11 (Track B)** need: domain, `stardust/` data from step 3. They do NOT depend on the snowflake — they can start immediately after step 4.
- **Step 11 (Config review)** needs: all `of1/config/` files from steps 8-10 — orchestrator generates review page inline
- **Step 12 (Deploy)** needs: step 6-assemble done AND step 7 done (Track A) AND step 11 approved (Track B), plus domain, all config files, repo-config.json
```

- [ ] **Step 10: Renumber "Step 12 — Config Review" to "Step 11" and "Step 13" to "Step 12"**

Find:

```markdown
## Step 12 — Config Review (ALWAYS inline, NEVER a scoop)

⚠️ **DO NOT spawn a scoop for step 12.** It is purely scripted (run `fill-config-review.jsh` + git push) — no LLM reasoning needed. Spawning a scoop wastes 12+ min of scheduling overhead for a 30-second task. Run it inline in the orchestrator.

Once all parallel steps (9–11) are done, the orchestrator runs step 12 **inline**. This is a review gate where the user validates all the config that will be deployed.
```

Replace with:

```markdown
## Step 11 — Config Review (ALWAYS inline, NEVER a scoop)

⚠️ **DO NOT spawn a scoop for step 11.** It is purely scripted (run `fill-config-review.jsh` + git push) — no LLM reasoning needed. Spawning a scoop wastes 12+ min of scheduling overhead for a 30-second task. Run it inline in the orchestrator.

Once all parallel steps (8–10) are done, the orchestrator runs step 11 **inline**. This is a review gate where the user validates all the config that will be deployed.
```

Find (inside the "How to run" bash block and the sprinkle push):

```bash
sprinkle send of1-demo '{"step":12,"status":"review","deliverable":"https://'${BRANCH}'--'${REPO}'--'${OWNER}'.aem.page/deliverables/config-review.html","summary":"Review all config before deploy: products, brand voice, personas, CTA, suggestions."}'
```

Replace with:

```bash
sprinkle send of1-demo '{"step":11,"status":"review","deliverable":"https://'${BRANCH}'--'${REPO}'--'${OWNER}'.aem.page/deliverables/config-review.html","summary":"Review all config before deploy: products, brand voice, personas, CTA, suggestions."}'
```

Find:

```markdown
## Step 13 — MANDATORY Pre-Launch Checklist

**DO NOT mark Step 13 as `"done"` without running these 5 checks.** This applies in ALL modes — one-shot, auto-approve, or manual. The cone must run these checks INLINE (not delegated to a scoop) after the sync succeeds:
```

Replace with:

```markdown
## Step 12 — MANDATORY Pre-Launch Checklist

**DO NOT mark Step 12 as `"done"` without running these 5 checks.** This applies in ALL modes — one-shot, auto-approve, or manual. The cone must run these checks INLINE (not delegated to a scoop) after the sync succeeds:
```

Find:

```markdown
### On failure:
Fix the issue (commit + push + re-preview + re-sync if needed), then re-run the failing check. Only push `"step":13,"status":"done"` to the sprinkle after ALL 5 pass.
```

Replace with:

```markdown
### On failure:
Fix the issue (commit + push + re-preview + re-sync if needed), then re-run the failing check. Only push `"step":12,"status":"done"` to the sprinkle after ALL 5 pass.
```

- [ ] **Step 11: Renumber the pipeline-audit example and "Iteration"/"Completion"/misc mentions**

Find:

```markdown
1. After step 13 completes (success)
2. If the pipeline aborts (partial audit is still useful)
```

Replace with:

```markdown
1. After step 12 completes (success)
2. If the pipeline aborts (partial audit is still useful)
```

Find:

```markdown
After step 13 succeeds, all steps show green. The sprinkle stays open as a reference with all URLs and status.
```

Replace with:

```markdown
After step 12 succeeds, all steps show green. The sprinkle stays open as a reference with all URLs and status.
```

Find (in "Shell Environment Pitfalls" item 4):

```markdown
4. **Step 13 (Deploy)** — just `git push` + one POST to `/api/tenants/{id}/sync`. Can be done inline by the cone (no scoop needed).
```

Replace with:

```markdown
4. **Step 12 (Deploy)** — just `git push` + one POST to `/api/tenants/{id}/sync`. Can be done inline by the cone (no scoop needed).
```

Find (item 16, the `git add -A` exception):

```markdown
16. **NEVER use `git add .` or `git add -A` in a scoop** — SLICC scoops may have an incomplete working tree (they only see files they touched). `git add .` creates a commit containing ONLY the local files, which on push **deletes everything else in the repo**. Always add specific paths: `git add templates/ styles/ fragments/ of1/config/`. The only safe place for `git add -A` is the orchestrator's repo-setup (which is removing files intentionally from a complete tree).
```

Replace with:

```markdown
16. **NEVER use `git add .` or `git add -A` in a scoop** — SLICC scoops may have an incomplete working tree (they only see files they touched). `git add .` creates a commit containing ONLY the local files, which on push **deletes everything else in the repo**. Always add specific paths: `git add templates/ styles/ fragments/ of1/config/`. The only safe place for `git add -A` is `of1-setup`'s clean-slate step (which is removing files intentionally from a complete tree).
```

Find the improvements-section example JSON block referencing step 5 and step 9:

```json
{
  "improvements": [
    {
      "step": 5,
      "issue": "Prototype generation took 14 min (3× expected) — agent re-generated the full page 4 times instead of iterating on specific sections",
      "suggestion": "Add a 'targeted fix only — do not regenerate the full page' instruction to the stardust:prototype invocation"
    },
    {
      "step": 9,
      "issue": "Content-metadata retried 2× — download-images.py failed on first run because products.json had 3 products with only external CDN URLs (no source images found on detail pages)",
      "suggestion": "Have the extraction step (4) capture more image URLs per product page upfront, or fall back to listing-page carousel images when detail pages have <2"
    }
  ]
}
```

Replace with:

```json
{
  "improvements": [
    {
      "step": 4,
      "issue": "Prototype generation took 14 min (3× expected) — agent re-generated the full page 4 times instead of iterating on specific sections",
      "suggestion": "Add a 'targeted fix only — do not regenerate the full page' instruction to the stardust:prototype invocation"
    },
    {
      "step": 8,
      "issue": "Content-metadata retried 2× — download-images.py failed on first run because products.json had 3 products with only external CDN URLs (no source images found on detail pages)",
      "suggestion": "Have the extraction step (3) capture more image URLs per product page upfront, or fall back to listing-page carousel images when detail pages have <2"
    }
  ]
}
```

- [ ] **Step 12: Verify no stale numbering remains**

```bash
grep -n "step 13\|Step 13\|of1-s7\|of1-s9\|step-7-\|step-9-\|of1-repo-setup" skills/of1-demo/SKILL.md
```

Expected: no output.

- [ ] **Step 13: Commit**

```bash
git add skills/of1-demo/SKILL.md
git commit -m "docs: full renumbering of of1-demo/SKILL.md to 12-step pipeline"
```

---

### Task 8: `of1-demo/of1-demo.shtml` — verify the sprinkle's `openLabel`/comments match

**Files:**
- Modify: `skills/of1-demo/of1-demo.shtml` (verification/small touch-up only —
  the `STEPS` array, index shifts, and `QUICKLINKS` were already renumbered
  in a prior commit)

**Interfaces:**
- Consumes: nothing new
- Produces: nothing new — this task only double-checks the earlier
  renumbering is complete and consistent with Task 7's doc changes

- [ ] **Step 1: Confirm no stale numeric references remain**

```bash
grep -n "Repo setup\|Install dependencies\|of1-repo-setup\|requires: \[12\]\|requires: \[13\]" skills/of1-demo/of1-demo.shtml
```

Expected: no output (the `STEPS` array's first entry should read `name:
'Setup'`, and no `requires` array should reference index 12 or 13 since the
array now has exactly 12 entries, indices 0–11).

- [ ] **Step 2: Confirm the STEPS array has exactly 12 entries**

```bash
node -e "
const fs = require('fs');
const content = fs.readFileSync('skills/of1-demo/of1-demo.shtml', 'utf8');
const match = content.match(/var STEPS = (\[[\s\S]*?\n  \]);/);
const steps = eval(match[1]);
console.log('count:', steps.length);
console.log('names:', steps.map(s => s.name).join(', '));
"
```

Expected: `count: 12` and names starting with `Setup, Discovery, Extraction,
Prototype, Snowflake, Templates, OF1 styling, Brand & content, Suggestions,
CTA template, Config review, Deploy`.

- [ ] **Step 3: If Step 2's output shows a discrepancy, fix it inline**

Only take action if the check in Step 2 fails. If it fails, re-read the
`STEPS` array and the `requires`/`QUICKLINKS`/track-index sections described
earlier in this plan's history and correct them to match the 12-step model
(index 0 = Setup, ..., index 10 = Config review, index 11 = Deploy).

- [ ] **Step 4: Commit (only if Step 3 made changes)**

```bash
git add skills/of1-demo/of1-demo.shtml
git commit -m "fix: correct sprinkle STEPS array indices for 12-step pipeline"
```

If no changes were needed, skip this commit — nothing to record.

---

### Task 9: `of1-demo-cc/SKILL.md` — full renumbering (Claude Code orchestrator)

**Files:**
- Modify: `skills/of1-demo-cc/SKILL.md`

**Interfaces:**
- Consumes: nothing new
- Produces: nothing new — pure renumbering, mirroring Task 7 but for the CC
  orchestrator's Agent-dispatch model instead of SLICC's scoop model

- [ ] **Step 1: Update the description and hard-gate line count reference**

Find:

```markdown
Turns any website into a branded OF1 generative-search demo on Adobe Edge Delivery Services. 13 steps. Auto-approves by default; user can interrupt to revise any step.
```

Replace with:

```markdown
Turns any website into a branded OF1 generative-search demo on Adobe Edge Delivery Services. 12 steps. Auto-approves by default; user can interrupt to revise any step.
```

- [ ] **Step 2: Update Phase 0 to mention repo verification**

Find:

```markdown
## Phase 0 — Verify dependencies (inline)

Invoke the `of1-setup` skill via the **Skill tool** (not Agent — this is light and must run in your context to read the verified state). If it fails, surface the exact error and stop.

After it succeeds, read `<STATE_DIR>/setup.json` to get `stateDir` and `of1Repo` absolute paths. Use these for all subsequent steps.
```

Replace with:

```markdown
## Phase 0 — Verify dependencies + repo state (inline)

Invoke the `of1-setup` skill via the **Skill tool** (not Agent — this is light and must run in your context to read the verified state, and its "Repo state" section may need `AskUserQuestion` for continue/restart). If it fails, surface the exact error and stop.

After it succeeds, read `<STATE_DIR>/setup.json` for `stateDir`/`of1Repo` and `<STATE_DIR>/repo-config.json` for `owner`/`repo`/`branch`/`domain`. Use these for all subsequent steps.
```

- [ ] **Step 3: Renumber Phase 1's task list**

Find:

```markdown
Use **TaskCreate** with one task per pipeline step:

```
1.  Setup           (already done if you got here)
2.  Repo setup      — set up EDS repo + create demo branch
3.  Discovery       — crawl site, propose narrative
4.  Extraction      — design tokens, logo, screenshots (parallel with 3)
5.  Prototype       — pixel-perfect HTML (needs 3 + 4)
6.  Snowflake       — convert prototypes to EDS pages
7.  Templates       — 25 branded templates (base + fan-out: 5 intents + assemble)
8.  OF1 styling     — generative-block CSS + /of1 page setup (needs 6)
9a. Brand voice     — voice extraction (parallel)
9b. Content meta    — products, personas, FAQs + image upload (parallel)
10. Suggestions     — search chips + UI copy (parallel)
11. CTA template    — branded CTA JSON (parallel)
12. Config review   — generate review page (inline; needs 9a + 9b + 10 + 11)
13. Deploy          — push, sync, pre-launch checklist
```
```

Replace with:

```markdown
Use **TaskCreate** with one task per pipeline step:

```
1.  Setup           (already done if you got here — verifies deps + repo state, outputs repo-config.json)
2.  Discovery       — crawl site, propose narrative
3.  Extraction      — design tokens, logo, screenshots (parallel with 2)
4.  Prototype       — pixel-perfect HTML (needs 2 + 3)
5.  Snowflake       — convert prototypes to EDS pages
6.  Templates       — 25 branded templates (base + fan-out: 5 intents + assemble)
7.  OF1 styling     — generative-block CSS + /of1 page setup (needs 5)
8a. Brand voice     — voice extraction (parallel)
8b. Content meta    — products, personas, FAQs + image upload (parallel)
9.  Suggestions     — search chips + UI copy (parallel)
10. CTA template    — branded CTA JSON (parallel)
11. Config review   — generate review page (inline; needs 8a + 8b + 9 + 10)
12. Deploy          — push, sync, pre-launch checklist
```
```

- [ ] **Step 4: Renumber the Phase 2 dependency graph and trigger table**

Find:

```markdown
```
2  →  3 ∥ 4  →  5  →  ┬─ 6  →  ┬─ 7-base → 7a ∥ 7b ∥ 7c ∥ 7d ∥ 7e  →  7-assemble  ─┐
                      │        └─ 8                                                   │
                      └─ 9a ∥ 9b ∥ 11  →  10  →  12  ───────────────────────────────┴─→  13
```
```

Replace with:

```markdown
```
1  →  2 ∥ 3  →  4  →  ┬─ 5  →  ┬─ 6-base → 6a ∥ 6b ∥ 6c ∥ 6d ∥ 6e  →  6-assemble  ─┐
                      │        └─ 7                                                   │
                      └─ 8a ∥ 8b ∥ 10  →  9  →  11  ───────────────────────────────┴─→  12
```
```

Find:

```markdown
| Trigger (ALL must be done) | Dispatch in one message |
|---------|-------------------------|
| Step 2 done | Step 3 AND Step 4 |
| Steps 3 + 4 done | Step 5 |
| Step 5 done | Step 6 AND Steps 9a, 9b, 11 (4 agents in one message) |
| Step 6 done | Step 7-base AND Step 8 (Step 7-base must finish before intent fan-out) |
| Step 7-base done | Steps 7a–7e (5 intent agents in one message) |
| Steps 9a + 9b done | Step 10 (needs products.json + brand-voice.json) |
| Steps 7a–7e all done | Step 7-assemble (1 agent, sequential) |
| Steps 9a + 9b + 10 + 11 ALL done | Step 12 (inline — do NOT run until all four are confirmed done) |
| Steps 7-assemble + 8 + 12 ALL done | Step 13 |

**Common mistakes to avoid:**
- Do NOT run Step 12 as soon as 9a finishes — it needs 9a + 9b + 10 + 11 ALL completed.
- Do NOT run Step 7-base before Step 6 returns — 7 reads from 6's output files.
- Do NOT run Step 10 before BOTH 9a and 9b return — it needs both brand-voice.json and products.json.
```

Replace with:

```markdown
| Trigger (ALL must be done) | Dispatch in one message |
|---------|-------------------------|
| Step 1 done | Step 2 AND Step 3 |
| Steps 2 + 3 done | Step 4 |
| Step 4 done | Step 5 AND Steps 8a, 8b, 10 (4 agents in one message) |
| Step 5 done | Step 6-base AND Step 7 (Step 6-base must finish before intent fan-out) |
| Step 6-base done | Steps 6a–6e (5 intent agents in one message) |
| Steps 8a + 8b done | Step 9 (needs products.json + brand-voice.json) |
| Steps 6a–6e all done | Step 6-assemble (1 agent, sequential) |
| Steps 8a + 8b + 9 + 10 ALL done | Step 11 (inline — do NOT run until all four are confirmed done) |
| Steps 6-assemble + 7 + 11 ALL done | Step 12 |

**Common mistakes to avoid:**
- Do NOT run Step 11 as soon as 8a finishes — it needs 8a + 8b + 9 + 10 ALL completed.
- Do NOT run Step 6-base before Step 5 returns — 6 reads from 5's output files.
- Do NOT run Step 9 before BOTH 8a and 8b return — it needs both brand-voice.json and products.json.
```

- [ ] **Step 5: Renumber the Step 7 fan-out detail and pre-fan-out screenshot section**

Find:

```markdown
### Step 7 fan-out detail

Step 7 (template generation) is split into 7 dispatches across 3 phases:

- **7-base (sequential, 1 agent):** runs `of1-template-generation` with `OF1_TG_MODE=base`. Generates `styles/of1-template-base.css` from the prototype CSS — the shared design tokens all 25 per-template CSS files `@import`. Must finish before intent agents start so they can read the tokens.
- **7a–7e (parallel, 5 agents):** each runs the same skill with `OF1_TG_MODE=intent` and `OF1_TG_INTENT` set to one of `comparison`, `recommendation`, `deep-dive`, `budget`, `discovery`. Each writes only its own `templates/of1-{intent}-*` + `styles/of1-{intent}-*` files. No git operations.
- **7-assemble (sequential, 1 agent):** same skill with `OF1_TG_MODE=assemble`. Verifies base CSS exists, assembles the fully-inlined catalog, runs `fill-template.py`, installs the gallery, and commits everything in one push.

### Pre-fan-out: capture EDS visual references (inline, orchestrator turn)

After Step 6 returns `done` and before dispatching 7-base, screenshot every prototype page as rendered by EDS. The intent agents read these from disk to match their templates to the full rendered design system.
```

Replace with:

```markdown
### Step 6 fan-out detail

Step 6 (template generation) is split into 7 dispatches across 3 phases:

- **6-base (sequential, 1 agent):** runs `of1-template-generation` with `OF1_TG_MODE=base`. Generates `styles/of1-template-base.css` from the prototype CSS — the shared design tokens all 25 per-template CSS files `@import`. Must finish before intent agents start so they can read the tokens.
- **6a–6e (parallel, 5 agents):** each runs the same skill with `OF1_TG_MODE=intent` and `OF1_TG_INTENT` set to one of `comparison`, `recommendation`, `deep-dive`, `budget`, `discovery`. Each writes only its own `templates/of1-{intent}-*` + `styles/of1-{intent}-*` files. No git operations.
- **6-assemble (sequential, 1 agent):** same skill with `OF1_TG_MODE=assemble`. Verifies base CSS exists, assembles the fully-inlined catalog, runs `fill-template.py`, installs the gallery, and commits everything in one push.

### Pre-fan-out: capture EDS visual references (inline, orchestrator turn)

After Step 5 returns `done` and before dispatching 6-base, screenshot every prototype page as rendered by EDS. The intent agents read these from disk to match their templates to the full rendered design system.
```

Find:

```markdown
If any 7a–7e fails, retry just that one; don't re-run the others. If `7-assemble` fails, re-run it alone — intent outputs are intact.

### Step 9 split

Steps 9a and 9b are independent — both consume Step 4's extraction output and produce different files. Dispatch both in the same message as Steps 10 + 11 (4 agents total after Step 5).
```

Replace with:

```markdown
If any 6a–6e fails, retry just that one; don't re-run the others. If `6-assemble` fails, re-run it alone — intent outputs are intact.

### Step 8 split

Steps 8a and 8b are independent — both consume Step 3's extraction output and produce different files. Dispatch both in the same message as Steps 9 + 10 (4 agents total after Step 4).
```

- [ ] **Step 6: Renumber the model-assignment table**

Find:

```markdown
| Step | Model | Why |
|------|-------|-----|
| 2 — branch setup | `sonnet` | Mechanical: git ops + write config JSON. |
| 3 — discovery | `opus` | Brand/narrative synthesis from crawled pages. Drives demo story. |
| 4 — extraction | `opus` | Design-token extraction. Wrong tokens cascade everywhere. |
| 5 — prototype | `opus` | Pixel-perfect HTML requiring visual judgment. |
| 6 — snowflake | `opus` | Invokes the adobe snowflake skill. Complex multi-phase conversion requiring precise instruction-following. |
| 7-base | `sonnet` | Reads prototype CSS → writes `:root` tokens. Structured extraction. |
| 7a–7e — template intents | `sonnet` | Structured generation from a clear pattern. 5 parallel = biggest cost block. |
| 7-assemble | `sonnet` | Runs scripts + one commit. Bump to `opus` if quality dips. |
| 8 — OF1 styling | `opus` | CSS generation + /of1 page setup. Must follow multi-step instructions precisely (copy base CSS, patch scripts.js, copy fragments, upload DA content). Sonnet deviates from the procedure. |
| 9a — brand voice | `sonnet` | Synthesis from existing extraction JSON. |
| 9b — content metadata | `sonnet` | Scrape product pages + run download-images.py. Structured. |
| 10 — quick suggestions | `sonnet` | Generate 12 chips from discovery narrative. |
| 11 — CTA template | `sonnet` | Generate one JSON file from DESIGN.json tokens. |
| 13 — deploy + verify | `sonnet` | Scripted sync + verification curls + screenshots. |
```

Replace with:

```markdown
| Step | Model | Why |
|------|-------|-----|
| 2 — discovery | `opus` | Brand/narrative synthesis from crawled pages. Drives demo story. |
| 3 — extraction | `opus` | Design-token extraction. Wrong tokens cascade everywhere. |
| 4 — prototype | `opus` | Pixel-perfect HTML requiring visual judgment. |
| 5 — snowflake | `opus` | Invokes the adobe snowflake skill. Complex multi-phase conversion requiring precise instruction-following. |
| 6-base | `sonnet` | Reads prototype CSS → writes `:root` tokens. Structured extraction. |
| 6a–6e — template intents | `sonnet` | Structured generation from a clear pattern. 5 parallel = biggest cost block. |
| 6-assemble | `sonnet` | Runs scripts + one commit. Bump to `opus` if quality dips. |
| 7 — OF1 styling | `opus` | CSS generation + /of1 page setup. Must follow multi-step instructions precisely (copy base CSS, patch scripts.js, copy fragments, upload DA content). Sonnet deviates from the procedure. |
| 8a — brand voice | `sonnet` | Synthesis from existing extraction JSON. |
| 8b — content metadata | `sonnet` | Scrape product pages + run download-images.py. Structured. |
| 9 — quick suggestions | `sonnet` | Generate 12 chips from discovery narrative. |
| 10 — CTA template | `sonnet` | Generate one JSON file from DESIGN.json tokens. |
| 12 — deploy + verify | `sonnet` | Scripted sync + verification curls + screenshots. |
```

- [ ] **Step 7: Renumber the "Per-dispatch prompt additions for Step 7" heading and its Mode blocks**

Find:

```markdown
### Per-dispatch prompt additions for Step 7

For the base agent:
```
## Mode (Step 7)
- `export OF1_TG_MODE=base`
- Follow the skill's "Mode: base" section.
```

For each intent agent (7a–7e):
```
## Mode (Step 7 fan-out)
- `export OF1_TG_MODE=intent`
- `export OF1_TG_INTENT=<comparison|recommendation|deep-dive|budget|discovery>`
- Follow the skill's "Mode: intent" section. Do NOT generate styles/of1-template-base.css, the catalog, the gallery, or commit anything.
```

For the assemble agent:
```
## Mode (Step 7 fan-out)
- `export OF1_TG_MODE=assemble`
- Follow the skill's "Mode: assemble" section.
- Precondition: all 25 templates/of1-*.html, .metadata.json, .sample.json + styles/of1-*.css exist. Fail fast if missing.
```
```

Replace with:

```markdown
### Per-dispatch prompt additions for Step 6

For the base agent:
```
## Mode (Step 6)
- `export OF1_TG_MODE=base`
- Follow the skill's "Mode: base" section.
```

For each intent agent (6a–6e):
```
## Mode (Step 6 fan-out)
- `export OF1_TG_MODE=intent`
- `export OF1_TG_INTENT=<comparison|recommendation|deep-dive|budget|discovery>`
- Follow the skill's "Mode: intent" section. Do NOT generate styles/of1-template-base.css, the catalog, the gallery, or commit anything.
```

For the assemble agent:
```
## Mode (Step 6 fan-out)
- `export OF1_TG_MODE=assemble`
- Follow the skill's "Mode: assemble" section.
- Precondition: all 25 templates/of1-*.html, .metadata.json, .sample.json + styles/of1-*.css exist. Fail fast if missing.
```
```

- [ ] **Step 8: Renumber "Step 12 — Config review" and "Step 13 — Deploy"**

Find:

```markdown
## Step 12 — Config review (inline, no Agent)

**PREREQUISITE GATE:** Do NOT execute this step until you have confirmed ALL FOUR of these steps returned `"status": "done"`: 9a (brand voice), 9b (content metadata), 10 (suggestions), 11 (CTA template). If ANY of these is still running or has not been dispatched yet, WAIT.

Once all four are confirmed done, run inline:

```bash
cd "$OF1_REPO"
python3 "$SKILL_DIR_CONFIG_REVIEW/assets/fill-config-review.py" . "$DOMAIN"
git add deliverables/config-review.html
git commit -m "docs: config review page for $DOMAIN"
git push origin "$BRANCH"
```

(`$SKILL_DIR_CONFIG_REVIEW` = absolute path to `.claude/skills/of1-config-review`.)

Deliverable: `https://<branch>--<repo>--<owner>.aem.page/deliverables/config-review.html`

## Step 13 — Deploy (inline)

After step 12 approved AND steps 7-assemble + 8 done, run step 13 inline (read the `of1-deploy` skill and follow it). The pre-launch checklist has **5 checks** — all must pass:

1. OF1 page loads with styled search UI
2. OF1 nav/footer matches prototype-home
3. All products have ≥2 images
4. Template catalog has 25 of1-* entries across all 5 intents
5. All deliverable URLs return 200

Mark task 13 `completed` only after all 5 pass.
```

Replace with:

```markdown
## Step 11 — Config review (inline, no Agent)

**PREREQUISITE GATE:** Do NOT execute this step until you have confirmed ALL FOUR of these steps returned `"status": "done"`: 8a (brand voice), 8b (content metadata), 9 (suggestions), 10 (CTA template). If ANY of these is still running or has not been dispatched yet, WAIT.

Once all four are confirmed done, run inline:

```bash
cd "$OF1_REPO"
python3 "$SKILL_DIR_CONFIG_REVIEW/assets/fill-config-review.py" . "$DOMAIN"
git add deliverables/config-review.html
git commit -m "docs: config review page for $DOMAIN"
git push origin "$BRANCH"
```

(`$SKILL_DIR_CONFIG_REVIEW` = absolute path to `.claude/skills/of1-config-review`.)

Deliverable: `https://<branch>--<repo>--<owner>.aem.page/deliverables/config-review.html`

## Step 12 — Deploy (inline)

After step 11 approved AND steps 6-assemble + 7 done, run step 12 inline (read the `of1-deploy` skill and follow it). The pre-launch checklist has **5 checks** — all must pass:

1. OF1 page loads with styled search UI
2. OF1 nav/footer matches prototype-home
3. All products have ≥2 images
4. Template catalog has 25 of1-* entries across all 5 intents
5. All deliverable URLs return 200

Mark task 12 `completed` only after all 5 pass.
```

- [ ] **Step 9: Renumber the State files table and pipeline-audit example**

Find:

```markdown
| File | Owner | Purpose |
|------|-------|---------|
| `setup.json` | of1-setup | Verified paths + token source |
| `repo-config.json` | Step 2 | owner, repo, branch, repoDir, domain |
| `step-<N>-summary.json` | Orchestrator (parsed from Agent return) | Step result, for resuming/debug |
| `pipeline.log` | Orchestrator | Append-only dispatch/return log |
```

Replace with:

```markdown
| File | Owner | Purpose |
|------|-------|---------|
| `setup.json` | of1-setup | Verified paths + owner/repo/branch + token source |
| `repo-config.json` | Step 1 (Setup) | owner, repo, branch, contentPrefix, repoDir, domain |
| `step-<N>-summary.json` | Orchestrator (parsed from Agent return) | Step result, for resuming/debug |
| `pipeline.log` | Orchestrator | Append-only dispatch/return log |
```

Find:

```markdown
1. After step 13 completes (success path)
2. If the pipeline aborts (failure path — partial audit is still useful)
```

Replace with:

```markdown
1. After step 12 completes (success path)
2. If the pipeline aborts (failure path — partial audit is still useful)
```

Find the audit shape example:

```json
  "steps": [
    {
      "step": 2,
      "name": "repo-setup",
      "model": "sonnet",
      "startedAt": "...",
      "durationMs": 12400,
      "totalTokens": 3200,
      "toolUses": 8,
      "status": "done",
      "summary": "branch + repo-config ready",
      "retries": 0,
      "error": null
    }
  ]
```

Replace with:

```json
  "steps": [
    {
      "step": 1,
      "name": "setup",
      "model": "sonnet",
      "startedAt": "...",
      "durationMs": 12400,
      "totalTokens": 3200,
      "toolUses": 8,
      "status": "done",
      "summary": "prerequisites verified, repo-config ready",
      "retries": 0,
      "error": null
    }
  ]
```

Find the improvements-section example JSON block:

```json
{
  "improvements": [
    {
      "step": 5,
      "issue": "Prototype generation took 14 min (3× expected) — agent re-generated the full page 4 times instead of iterating on specific sections",
      "suggestion": "Add a 'targeted fix only — do not regenerate the full page' instruction to the stardust:prototype invocation"
    },
    {
      "step": 9,
      "issue": "Content-metadata retried 2× — download-images.py failed on first run because products.json had 3 products with only external CDN URLs (no source images found on detail pages)",
      "suggestion": "Have the extraction step (4) capture more image URLs per product page upfront, or fall back to listing-page carousel images when detail pages have <2"
    }
  ]
}
```

Replace with:

```json
{
  "improvements": [
    {
      "step": 4,
      "issue": "Prototype generation took 14 min (3× expected) — agent re-generated the full page 4 times instead of iterating on specific sections",
      "suggestion": "Add a 'targeted fix only — do not regenerate the full page' instruction to the stardust:prototype invocation"
    },
    {
      "step": 8,
      "issue": "Content-metadata retried 2× — download-images.py failed on first run because products.json had 3 products with only external CDN URLs (no source images found on detail pages)",
      "suggestion": "Have the extraction step (3) capture more image URLs per product page upfront, or fall back to listing-page carousel images when detail pages have <2"
    }
  ]
}
```

- [ ] **Step 10: Update the SLICC hard-gate line's skill-name mention if present, and any remaining scoop/step references**

```bash
grep -n "repo-setup\|of1-repo-setup\|Step 13\|step 13\|Step 2 done\|step 2 done" skills/of1-demo-cc/SKILL.md
```

If any output remains beyond what's already been fixed above, resolve it
using the same before/after pattern demonstrated in this task.

- [ ] **Step 11: Verify no stale numbering remains**

```bash
grep -n "step 13\|Step 13\|9a\|9b\|7-base\|7a\|7-assemble\|of1-repo-setup" skills/of1-demo-cc/SKILL.md
```

Expected: no output.

- [ ] **Step 12: Commit**

```bash
git add skills/of1-demo-cc/SKILL.md
git commit -m "docs: full renumbering of of1-demo-cc/SKILL.md to 12-step pipeline"
```

---

### Task 10: Final consistency sweep

**Files:**
- None modified directly — verification only. Fix inline if anything turns up.

**Interfaces:**
- Consumes: the full repo state after Tasks 1–9
- Produces: confidence that no reference to the deleted skill or the old
  13-step numbering survives anywhere non-historical

- [ ] **Step 1: Repo-wide grep for the deleted skill name**

```bash
grep -rln "of1-repo-setup" --include="*.md" --include="*.shtml" --include="*.sh" --include="*.json" . 2>/dev/null | grep -v "^\./\.claude/worktrees/"
```

Expected output: only files under `docs/superpowers/specs/` and
`docs/superpowers/plans/` (this plan and the design spec themselves, which
correctly document the *removal* of `of1-repo-setup` and should not be
edited). If any *other* file appears, open it and fix the reference using
the patterns established in this plan's earlier tasks.

- [ ] **Step 2: Repo-wide grep for `BRANCH_MODE`**

```bash
grep -rln "BRANCH_MODE" --include="*.md" --include="*.sh" . 2>/dev/null | grep -v "^\./\.claude/worktrees/"
```

Expected: no output.

- [ ] **Step 3: Confirm `skills/` directory no longer contains `of1-repo-setup`**

```bash
ls skills/ | grep repo-setup
```

Expected: no output.

- [ ] **Step 4: Confirm the full pipeline is referred to as 12 steps everywhere it's counted**

```bash
grep -rn "13 step\|13-step\|shows 13" README.md .claude-plugin/plugin.json skills/of1-demo/SKILL.md skills/of1-demo-cc/SKILL.md
```

Expected: no output.

- [ ] **Step 5: No commit needed for this task** — it's verification-only. If
  Steps 1, 2, or 4 surfaced anything, the fix was committed as part of
  whichever earlier task's file it belonged to; re-run this task's greps
  once more to confirm clean before considering the plan complete.
