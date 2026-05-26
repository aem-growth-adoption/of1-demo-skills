---
name: of1-branch-setup
description: Create a git branch and output directory for the OF1 demo domain.
user-invocable: false
---

# OF1 Branch Setup

Create the domain branch on the shared `aem-growth-adoption/of1-demo` repo and output directory for the demo.

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

### 2. Fetch and create domain branch

```bash
cd /workspace/of1-demo
git fetch origin
git checkout -b ${BRANCH} origin/main 2>/dev/null || git checkout ${BRANCH}
```

### 3. Create output directory

```bash
mkdir -p output/${DOMAIN}
```

### 4. Verify DA mount

```bash
ls /mnt/da >/dev/null 2>&1 || echo "DA NOT MOUNTED"
```

If not mounted, inform the user:
> DA.live is not mounted. Run:
> ```
> mount --source da://aem-growth-adoption/of1-demo /mnt/da
> ```

### 5. Write repo-config.json

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

## Deliverables

- On branch `{BRANCH}`
- `output/{DOMAIN}/` directory exists
- `/shared/of1-demo/repo-config.json` written

## Completion

Write a status file — do NOT call `sprinkle send` directly (only the of1-demo orchestrator scoop may do that):

```bash
echo '{"step":2,"status":"done"}' > /shared/of1-demo/step-2-status.json
```
