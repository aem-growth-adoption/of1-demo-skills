---
name: of1-branch-setup
description: Create a git branch and output directory for the OF1 demo domain.
user-invocable: false
---

# OF1 Branch Setup

Create the domain branch on the shared `aem-growth-adoption/of1-demo` repo for the demo.

## Inputs

- `DOMAIN`: The target domain (e.g., `bmwusa.com`)
- `BRANCH`: Domain without TLD (e.g., `bmwusa`)

## Schema Reference

Read `/workspace/skills/of1-demo/knowledge/worker-config-schemas.md` § `of1-endpoint.json` for the exact output format expected by the worker.

## Process

### 1. Ensure repo is cloned

```bash
cd /workspace/of1-demo || {
  cd /workspace
  git clone https://github.com/aem-growth-adoption/of1-demo.git
  cd of1-demo
}
```

### 2. Fetch and check if branch already exists

```bash
cd /workspace/of1-demo
git fetch origin

BRANCH_EXISTS_REMOTE=$(git ls-remote --heads origin ${BRANCH} | wc -l | tr -d ' ')
BRANCH_EXISTS_LOCAL=$(git branch --list ${BRANCH} | wc -l | tr -d ' ')
```

**If the branch already exists (remote or local):**

Tell the user:
> Branch `{BRANCH}` already exists — there's a previous demo for this domain.
>
> Options:
> 1. **Continue** — reuse the existing branch (picks up where the last run left off)
> 2. **Fresh start** — create a new branch `{BRANCH}-2` (or `-3`, etc.) for a clean demo
>
> Which would you prefer?

- If **continue**: `git checkout ${BRANCH}` (or `git checkout -b ${BRANCH} origin/${BRANCH}` if only remote)
- If **fresh start**: increment the suffix (`${BRANCH}-2`, `${BRANCH}-3`, etc.) until finding one that doesn't exist, then `git checkout -b ${NEW_BRANCH} origin/main`. Update `BRANCH` to the new name for the rest of the pipeline.

**If the branch does NOT exist:**

```bash
git checkout -b ${BRANCH} origin/main
```

### 2b. Clean slate — remove prior PIPELINE artifacts only

Whether continuing on an existing branch or starting fresh, remove stale pipeline outputs so scoops don't get confused by old data. **DO NOT delete boilerplate core files** (`styles/styles.css`, `scripts/`, `blocks/header/`, `blocks/footer/`, `blocks/fragment/`, `head.html`, etc.) — only demo-specific outputs:

```bash
cd /workspace/of1-demo

# Remove prior pipeline outputs ONLY (NOT boilerplate core files)
rm -rf stardust/ deliverables/ templates/ fragments/ .snowflake/ drafts/ gallery/ of1/config/ tools/ output/
rm -rf styles/of1-*.css styles/prototype-*.css
rm -f PRODUCT.md

# Remove shared state from prior run
rm -rf /shared/of1-demo/step-*
rm -f /shared/of1-demo/discovery.html

# Commit the cleanup if there were tracked files
git add -A
if ! git diff --cached --quiet; then
  git commit -m "chore: clean slate for fresh demo run"
  git push origin ${BRANCH}
fi
```

**NEVER delete these boilerplate files:**
- `styles/styles.css` — EDS requires this (body stays invisible without it)
- `styles/fonts.css`, `styles/lazy-styles.css` — EDS expects these
- `scripts/scripts.js`, `scripts/aem.js` — EDS core runtime
- `blocks/header/`, `blocks/footer/`, `blocks/fragment/` — EDS infrastructure blocks
- `head.html` — EDS head includes

**Why this matters:** Previous runs leave behind `deliverables/`, `stardust/`, `of1/config/`, and DA content. Scoops that find existing files waste 5-30 minutes trying to decide whether to reuse them, adapt to them, or overwrite them. A clean slate eliminates this confusion — but deleting boilerplate core files breaks the site entirely.

### 3. Check for existing DA content

```bash
if [ -d /mnt/da ] && ls /mnt/da/${BRANCH}/ >/dev/null 2>&1; then
  echo "DA content already exists at /mnt/da/${BRANCH}/"
fi
```

**ALWAYS clean DA content for fresh runs** (regardless of branch choice). Old DA content with mismatched slot names is the #1 cause of the snowflake step failing:

```bash
DA_TOKEN=$(oauth-token adobe)

if [ -d "/mnt/da/${BRANCH}" ]; then
  # Remove all existing DA pages for this branch
  for f in /mnt/da/${BRANCH}/*.html; do
    [ -f "$f" ] || continue
    BASENAME=$(basename "$f")
    rm -f "$f" 2>/dev/null || \
      curl -s -X DELETE -H "Authorization: Bearer ${DA_TOKEN}" \
        "https://admin.da.live/source/${OWNER}/${REPO}/${BRANCH}/${BASENAME}"
  done
  echo "✓ Cleaned DA content at /mnt/da/${BRANCH}/"
fi

# Ensure the DA directory exists
mkdir -p "/mnt/da/${BRANCH}" 2>/dev/null
```

**If DA is not mounted:**

Inform the user:
> DA.live is not mounted. Run:
> ```
> mount --source da://aem-growth-adoption/of1-demo /mnt/da
> ```

### 4. Write repo-config.json

**This is a contract.** All 13 step skills read this file to learn where to operate. Both runtimes (SLICC and Claude Code) MUST produce the same required-fields shape — downstream skills depend on a stable schema.

#### Schema

**REQUIRED fields** (read by downstream skills — must always be present):

| Field | Type | Read by | Notes |
|---|---|---|---|
| `owner` | string | 10 skills | GitHub org, always `aem-growth-adoption` for this pipeline |
| `repo` | string | 10 skills | GitHub repo, always `of1-demo` for this pipeline |
| `branch` | string | 10 skills | Demo branch name (e.g. `frescopa`, `wknd-3`) |
| `contentPrefix` | string | 1 skill (`of1-snowflake`) | Subfolder in DA; same as `branch` |
| `repoDir` | string | 12 skills | Absolute path to the local git clone |
| `domain` | string | 10 skills | The customer domain (e.g. `wknd.site`) |

**OPTIONAL documentation fields** (write them for humans reading the file; downstream skills MUST NOT depend on them):

| Field | Example | Purpose |
|---|---|---|
| `repoUrl` | `https://github.com/aem-growth-adoption/of1-demo` | GitHub URL |
| `previewUrl` | `https://${branch}--of1-demo--aem-growth-adoption.aem.page/` | EDS preview root |
| `daSource` | `da://aem-growth-adoption/of1-demo` | DA source URL |

**DEPRECATED — DO NOT WRITE.** These fields appeared in earlier runtime variants and caused silent drift. Downstream skills now compute these from the required fields instead:

| Field | Compute from | |
|---|---|---|
| `daMount` | (SLICC only) hardcode `/mnt/da` | If you need it in SLICC, build it inline. |
| `daContentPath` | `/mnt/da/${branch}` | Build inline. |
| `daApiBase` | `https://admin.da.live/source/${owner}/${repo}/${branch}` | Build inline. |
| `daListBase` | `https://admin.da.live/list/${owner}/${repo}/${branch}` | Build inline. |

#### Minimal valid output

```bash
STATE_DIR="${OF1_STATE_DIR:-/shared/of1-demo}"
mkdir -p "$STATE_DIR"
cat > "$STATE_DIR/repo-config.json" <<EOF
{
  "owner": "aem-growth-adoption",
  "repo": "of1-demo",
  "branch": "${BRANCH}",
  "contentPrefix": "${BRANCH}",
  "repoDir": "${REPO_DIR}",
  "domain": "${DOMAIN}",
  "repoUrl": "https://github.com/aem-growth-adoption/of1-demo",
  "previewUrl": "https://${BRANCH}--of1-demo--aem-growth-adoption.aem.page/",
  "daSource": "da://aem-growth-adoption/of1-demo"
}
EOF
```

`${REPO_DIR}` is `/workspace/of1-demo` in SLICC, `$OF1_DEMO_REPO` (project-local absolute path) in Claude Code — set by the respective setup skill.

### 5. Write of1-endpoint.json

The worker needs this to build CTA links in personalize mode. The URL is deterministic from the branch name — create it now so it's available as soon as config is synced:

```bash
cd /workspace/of1-demo
mkdir -p of1/config
cat > of1/config/of1-endpoint.json <<EOF
{
  "url": "https://${BRANCH}--of1-demo--aem-growth-adoption.aem.page/${BRANCH}/of1"
}
EOF
git add of1/config/of1-endpoint.json
git commit -m "feat: of1-endpoint config for ${DOMAIN}"
git push origin ${BRANCH}
```

**Notes:**
- `contentPrefix` is always the same as `branch` for this pipeline; it exists as a separate field because the DA-content URL pattern uses it explicitly (`/{contentPrefix}/{page}`)
- Content URLs follow: `https://{branch}--of1-demo--aem-growth-adoption.aem.page/{contentPrefix}/{page}`

## Completion

Write a status file — do NOT call `sprinkle send` directly (only the of1-demo orchestrator scoop may do that):

```bash
echo '{"step":2,"status":"done"}' > /shared/of1-demo/step-2-status.json
```
