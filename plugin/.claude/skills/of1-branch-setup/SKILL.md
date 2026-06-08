---
name: of1-branch-setup
description: Create the demo branch on the of1-demo repo, clear stale artifacts, and write the repo-config.json contract every downstream step reads.
user-invocable: false
---

# OF1 Branch Setup

Create the demo branch on `aem-growth-adoption/of1-demo`, wipe stale demo outputs, and write the config contract every downstream step depends on.

## Env — orchestrator exports these (see `of1-setup`)

| Var | Purpose |
|-----|---------|
| `OF1_STATE_DIR` | state + IPC dir; receives `repo-config.json` + `step-2-status.json` |
| `OF1_DEMO_REPO` | absolute path to the local `of1-demo` git clone |
| `ADOBE_IMS_TOKEN` | raw DA token (preferred) |
| `OF1_TOKEN_FILE` | path to a `{"access_token":"…"}` JSON (fallback) |

Resolve `DA_TOKEN` once at the top:

```bash
DA_TOKEN="${ADOBE_IMS_TOKEN:-$(jq -r .access_token "$OF1_TOKEN_FILE")}"
[ -n "$DA_TOKEN" ] || { echo "FAIL: no DA token available" >&2; exit 1; }
```

## Inputs

- `DOMAIN` — target domain (e.g. `frescopa.coffee`)
- `BRANCH` — domain without TLD (e.g. `frescopa`)

## Process

### 0. Verify step 1 ran (hard gate)

```bash
[ -f "$OF1_STATE_DIR/setup.json" ] || {
  echo "FAIL: $OF1_STATE_DIR/setup.json does not exist." >&2
  echo "Step 1 (of1-setup) was either skipped or its verify.sh script was not executed." >&2
  echo "Go back and run: bash /workspace/skills/of1-setup/scripts/verify.sh" >&2
  exit 1
}
```

### 1. Verify the clone exists

```bash
cd "$OF1_DEMO_REPO" || { echo "FAIL: $OF1_DEMO_REPO is not a valid git clone" >&2; exit 1; }
```

### 2. Pick or create the branch

```bash
git fetch origin
EXISTS_REMOTE=$(git ls-remote --heads origin "$BRANCH" | wc -l | tr -d ' ')
EXISTS_LOCAL=$(git branch --list "$BRANCH" | wc -l | tr -d ' ')
```

**If the branch exists (remote or local), ask the user:**

> Branch `${BRANCH}` already exists — there's a previous demo for this domain.
>
> 1. **Continue** — reuse the branch (picks up where the last run left off)
> 2. **Fresh start** — create `${BRANCH}-2` (or `-3`, …) for a clean demo

- Continue: `git checkout "$BRANCH"` (or `git checkout -b "$BRANCH" "origin/$BRANCH"` if only remote)
- Fresh start: increment the suffix until an unused name, `git checkout -b "$NEW_BRANCH" origin/main`, and use `$NEW_BRANCH` as `$BRANCH` for the rest of the pipeline.

**Otherwise:** `git checkout -b "$BRANCH" origin/main`.

### 3. Clean slate — remove prior pipeline artifacts only

Stale demo outputs confuse downstream steps. **Do NOT touch EDS boilerplate** — `styles/styles.css`, `styles/{fonts,lazy-styles}.css`, `scripts/{scripts,aem}.js`, `blocks/{header,footer,fragment}/`, `head.html` — deleting them breaks the site (the body stays invisible without `styles.css`).

```bash
cd "$OF1_DEMO_REPO"
rm -rf stardust/ deliverables/ templates/ fragments/ .snowflake/ drafts/ gallery/ of1/config/ tools/ output/
rm -rf styles/of1-*.css styles/prototype-*.css
rm -f PRODUCT.md

# Drop prior shared state in the orchestrator's IPC dir
rm -rf "$OF1_STATE_DIR"/step-*
rm -f "$OF1_STATE_DIR/discovery.html"

git add -A
git diff --cached --quiet || {
  git commit -m "chore: clean slate for fresh demo run"
  git push origin "$BRANCH"
}
```

### 4. Clean DA content for this branch

Old DA content with mismatched slot names is the #1 cause of step 6 (snowflake) failing. Always clear before re-running:

```bash
OWNER="aem-growth-adoption"
REPO="of1-demo"
curl -s -H "Authorization: Bearer $DA_TOKEN" \
  "https://admin.da.live/list/${OWNER}/${REPO}/${BRANCH}" \
  | jq -r '.[] | select(.ext == "html") | .name' \
  | while read -r name; do
      curl -s -X DELETE -H "Authorization: Bearer $DA_TOKEN" \
        "https://admin.da.live/source/${OWNER}/${REPO}/${BRANCH}/${name}.html" >/dev/null
    done
echo "✓ Cleaned DA content for ${BRANCH}"
```

The DA directory is auto-created on first write — no `mkdir` needed.

### 5. Write `repo-config.json` — the downstream contract

Every downstream step reads this file. Required fields MUST be present; optional fields are for humans; deprecated fields MUST NOT be written.

| Field | Type | Read by | Notes |
|---|---|---|---|
| `owner` | string | 10 skills | Always `aem-growth-adoption` |
| `repo` | string | 10 skills | Always `of1-demo` |
| `branch` | string | 10 skills | Demo branch name |
| `contentPrefix` | string | `of1-snowflake` | Same as `branch`. Separate field because the DA URL pattern is `/{contentPrefix}/{page}` and that doesn't always equal the git branch in every project. |
| `repoDir` | string | 12 skills | Absolute path to the local clone |
| `domain` | string | 10 skills | The customer domain |

**Optional (write for humans, downstream MUST NOT depend on them):** `repoUrl`, `previewUrl`, `daSource`.

**Deprecated — do NOT write:** `daMount`, `daContentPath`, `daApiBase`, `daListBase`. Downstream skills compute these inline from the required fields. Worker-side schema in `of1-demo/knowledge/worker-config-schemas.md`.

```bash
mkdir -p "$OF1_STATE_DIR"
cat > "$OF1_STATE_DIR/repo-config.json" <<EOF
{
  "owner": "aem-growth-adoption",
  "repo": "of1-demo",
  "branch": "${BRANCH}",
  "contentPrefix": "${BRANCH}",
  "repoDir": "${OF1_DEMO_REPO}",
  "domain": "${DOMAIN}",
  "repoUrl": "https://github.com/aem-growth-adoption/of1-demo",
  "previewUrl": "https://${BRANCH}--of1-demo--aem-growth-adoption.aem.page/",
  "daSource": "da://aem-growth-adoption/of1-demo"
}
EOF
```

### 6. Write `of1-endpoint.json`

The worker needs this to build CTA links in personalize mode. The URL is deterministic from the branch — create it now so config sync can pick it up:

```bash
cd "$OF1_DEMO_REPO"
mkdir -p of1/config
cat > of1/config/of1-endpoint.json <<EOF
{
  "url": "https://${BRANCH}--of1-demo--aem-growth-adoption.aem.page/${BRANCH}/of1"
}
EOF
git add of1/config/of1-endpoint.json
git commit -m "feat: of1-endpoint config for ${DOMAIN}"
git push origin "$BRANCH"
```

## Completion

```bash
echo '{"step":2,"status":"done","summary":"branch + repo-config ready"}' \
  > "$OF1_STATE_DIR/step-2-status.json"
```

SLICC's sprinkle polls this; CC ignores it (orchestrator parses the agent's return JSON).
