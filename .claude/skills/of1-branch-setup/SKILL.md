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

### 2b. Clean slate — remove ALL prior artifacts

Whether continuing on an existing branch or starting fresh, ALWAYS remove stale pipeline artifacts so scoops don't get confused by old data:

```bash
cd /workspace/of1-demo

# Remove prior pipeline outputs (git-tracked artifacts from previous runs)
rm -rf stardust/ deliverables/ templates/ styles/ fragments/ .snowflake/ drafts/ gallery/ of1/config/ tools/ output/
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

**Why this matters:** Previous runs leave behind `deliverables/`, `stardust/`, `of1/config/`, and DA content. Scoops that find existing files waste 5-30 minutes trying to decide whether to reuse them, adapt to them, or overwrite them. A clean slate eliminates all this confusion.

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

```bash
mkdir -p /shared/of1-demo
cat > /shared/of1-demo/repo-config.json <<EOF
{
  "owner": "aem-growth-adoption",
  "repo": "of1-demo",
  "branch": "${BRANCH}",
  "contentPrefix": "${BRANCH}",
  "repoUrl": "https://github.com/aem-growth-adoption/of1-demo",
  "previewUrl": "https://${BRANCH}--of1-demo--aem-growth-adoption.aem.page/",
  "daSource": "da://aem-growth-adoption/of1-demo",
  "daMount": "/mnt/da",
  "daContentPath": "/mnt/da/${BRANCH}",
  "repoDir": "/workspace/of1-demo",
  "domain": "${DOMAIN}"
}
EOF
```

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

**Key fields explained:**
- `contentPrefix`: The subfolder in DA where this demo's content lives (same as branch name)
- `daMount`: The VFS mount point for the DA repo
- `daContentPath`: Full path to write DA content files (= `daMount` + `/` + `contentPrefix`)
- Content URLs follow: `https://{branch}--of1-demo--aem-growth-adoption.aem.page/{contentPrefix}/{page}`

## Completion

Write a status file — do NOT call `sprinkle send` directly (only the of1-demo orchestrator scoop may do that):

```bash
echo '{"step":2,"status":"done"}' > /shared/of1-demo/step-2-status.json
```
