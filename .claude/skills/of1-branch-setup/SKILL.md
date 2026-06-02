---
name: of1-branch-setup
description: Create a git branch and output directory for the OF1 demo domain.
user-invocable: false
---

# OF1 Branch Setup

Create the domain branch on the shared `aem-growth-adoption/of1-demo` repo for the demo.

## Platform context

This skill runs in both SLICC and Claude Code. Resolve these symbols up-front — the rest of the skill uses them by name and assumes you've read this section.

| Symbol | SLICC default | Claude Code override |
|---|---|---|
| `$STATE_DIR` | `/shared/of1-demo` | `$OF1_STATE_DIR` (e.g. `<project>/.of1/state`) |
| `$REPO_DIR` | `/workspace/of1-demo` (cloned by SLICC setup) | `$OF1_DEMO_REPO` (project-local clone path) |
| `$DA_TOKEN` | `$(oauth-token adobe)` | `$ADOBE_IMS_TOKEN`, or `$(jq -r .access_token "$OF1_TOKEN_FILE")` |
| Schema reference path | `/workspace/skills/of1-demo/knowledge/worker-config-schemas.md` | `<plugin-dir>/of1-demo/knowledge/worker-config-schemas.md` (sibling to this skill) |

Multi-line operations:

### Platform: DA list (files in a directory)
- **SLICC:** `ls /mnt/da/<branch>/*.html` (filesystem mount)
- **Claude Code:** `curl -s -H "Authorization: Bearer $DA_TOKEN" "https://admin.da.live/list/<owner>/<repo>/<branch>"` (returns JSON; filter `.html` entries)

### Platform: DA delete (single file)
- **SLICC:** `rm -f /mnt/da/<branch>/<file>.html`
- **Claude Code:** `curl -s -X DELETE -H "Authorization: Bearer $DA_TOKEN" "https://admin.da.live/source/<owner>/<repo>/<branch>/<file>.html"`

## Schema Reference

Read worker-config-schemas.md § `of1-endpoint.json` for the exact output format expected by the worker. Use the schema reference path from Platform context.

## Inputs

- `DOMAIN`: The target domain (e.g., `bmwusa.com`)
- `BRANCH`: Domain without TLD (e.g., `bmwusa`)

## Process

### 1. Ensure repo is cloned

In SLICC the setup skill clones the repo to `$REPO_DIR` before this step runs. In Claude Code the user / `of1-setup-cc` skill points `$OF1_DEMO_REPO` at an existing clone. Either way, verify it exists:

```bash
cd "$REPO_DIR" || {
  echo "FAIL: $REPO_DIR is not a valid git clone. Resolve via Platform context." >&2
  exit 1
}
```

### 2. Fetch and check if branch already exists

```bash
cd "$REPO_DIR"
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
cd "$REPO_DIR"

# Remove prior pipeline outputs ONLY (NOT boilerplate core files)
rm -rf stardust/ deliverables/ templates/ fragments/ .snowflake/ drafts/ gallery/ of1/config/ tools/ output/
rm -rf styles/of1-*.css styles/prototype-*.css
rm -f PRODUCT.md

# Remove shared state from prior run
rm -rf "$STATE_DIR"/step-*
rm -f "$STATE_DIR/discovery.html"

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

### 3. Clean existing DA content for this branch

**ALWAYS clean DA content for fresh runs** (regardless of branch choice). Old DA content with mismatched slot names is the #1 cause of the snowflake step failing.

Use the platform's DA list + delete forms (see Platform context). Pseudocode:

```
for each .html file at <da>/<owner>/<repo>/<branch>/:
  delete <da>/<owner>/<repo>/<branch>/<file>.html
```

Concrete by platform:

**SLICC:**
```bash
if [ -d "/mnt/da/${BRANCH}" ]; then
  for f in /mnt/da/${BRANCH}/*.html; do
    [ -f "$f" ] || continue
    rm -f "$f"
  done
  echo "✓ Cleaned DA content at /mnt/da/${BRANCH}/"
fi
mkdir -p "/mnt/da/${BRANCH}" 2>/dev/null
```

**Claude Code:**
```bash
OWNER="aem-growth-adoption"
REPO="of1-demo"
LIST=$(curl -s -H "Authorization: Bearer $DA_TOKEN" \
  "https://admin.da.live/list/${OWNER}/${REPO}/${BRANCH}")
echo "$LIST" | jq -r '.[] | select(.ext == "html") | .name' | while read -r name; do
  curl -s -X DELETE -H "Authorization: Bearer $DA_TOKEN" \
    "https://admin.da.live/source/${OWNER}/${REPO}/${BRANCH}/${name}.html" >/dev/null
done
echo "✓ Cleaned DA content for ${BRANCH}"
```

The DA directory is auto-created on the first write — no explicit `mkdir` needed in Claude Code.

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

### 5. Write of1-endpoint.json

The worker needs this to build CTA links in personalize mode. The URL is deterministic from the branch name — create it now so it's available as soon as config is synced:

```bash
cd "$REPO_DIR"
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

Write a status file — do NOT call `sprinkle send` directly (only the of1-demo orchestrator scoop may do that). In Claude Code the orchestrator's `Agent` return is the source of truth and this file is optional.

```bash
echo '{"step":2,"status":"done"}' > "$STATE_DIR/step-2-status.json"
```
