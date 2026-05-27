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

### 3. Check for existing DA content

```bash
if [ -d /mnt/da ] && ls /mnt/da/${BRANCH}/ >/dev/null 2>&1; then
  echo "DA content already exists at /mnt/da/${BRANCH}/"
fi
```

**If DA content exists and user chose "fresh start" in step 2:**

```bash
rm -rf /mnt/da/${BRANCH}/
mkdir -p /mnt/da/${BRANCH}/
```

**If DA content exists and user chose "continue":**

Leave it in place — the pipeline will overwrite individual pages as it progresses.

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
