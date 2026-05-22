---
name: of1-branch-setup
description: Create a git branch and output directory for the OF1 demo domain.
user-invocable: false
---

# OF1 Branch Setup

Create the domain branch and output directory for the demo.

## Inputs

- `DOMAIN`: The target domain (e.g., `bmwusa.com`)
- `BRANCH`: Domain without TLD (e.g., `bmwusa`)
- Repo config from `/shared/of1-demo/repo-config.json` (written by step 2)

## Process

### 1. Read repo config

```bash
REPO_CONFIG=$(cat /shared/of1-demo/repo-config.json)
REPO_DIR=$(echo "$REPO_CONFIG" | jq -r '.repoDir')
OWNER=$(echo "$REPO_CONFIG" | jq -r '.owner')
REPO=$(echo "$REPO_CONFIG" | jq -r '.repo')
echo "Working in: $REPO_DIR ($OWNER/$REPO)"
```

### 2. Ensure we're on main

```bash
cd "$REPO_DIR"
git fetch origin
git checkout main
git pull origin main
```

### 3. Create domain branch

```bash
BRANCH="{branch}"  # domain without TLD
git checkout -b ${BRANCH} 2>/dev/null || git checkout ${BRANCH}
```

### 4. Create output directory

```bash
mkdir -p "output/{DOMAIN}"
ls "output/{DOMAIN}" && echo "Output dir OK"
```

### 5. Verify DA mount

```bash
ls /mnt/da >/dev/null 2>&1 || echo "DA NOT MOUNTED"
```

If not mounted, read the DA source from repo-config.json and mount:
```bash
DA_SOURCE=$(echo "$REPO_CONFIG" | jq -r '.daSource')
mount --source "$DA_SOURCE" /mnt/da
```

## Deliverables

- On branch `{BRANCH}`
- `output/{DOMAIN}/` directory exists

## Completion

Write a status file — do NOT call `sprinkle send` directly (only the of1-demo orchestrator scoop may do that):

```bash
mkdir -p /shared/of1-demo
echo '{"step":4,"status":"done"}' > /shared/of1-demo/step-4-status.json
```
