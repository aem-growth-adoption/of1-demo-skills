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

## Process

### 1. Ensure we're on main

```bash
git fetch origin
git checkout main
git pull origin main
```

### 2. Create domain branch

```bash
BRANCH="{branch}"  # domain without TLD
git checkout -b ${BRANCH} 2>/dev/null || git checkout ${BRANCH}
```

### 3. Create output directory

The output directory must be created by the cone (scoops do not have write access to `/workspace/of1-demo`). If you are a scoop, skip this step — the cone will have already created `output/{DOMAIN}/` before spawning you. Just verify it exists:

```bash
ls output/{DOMAIN} && echo "Output dir OK" || echo "WARN: output/{DOMAIN} missing — cone should create it"
```

### 4. Verify DA mount (SLICC only)

```bash
ls /mnt/da >/dev/null 2>&1 || echo "DA NOT MOUNTED"
```

If not mounted, inform the user:
> DA.live is not mounted. Run:
> ```
> mount --source da://aem-growth-adoption/of1-demo /mnt/da
> ```

## Deliverables

- On branch `{BRANCH}`
- `output/{DOMAIN}/` directory exists

## Completion

Write a status file — do NOT call `sprinkle send` directly (only the of1-demo orchestrator scoop may do that):

```bash
mkdir -p /shared/of1-demo
echo '{"step":3,"status":"done"}' > /shared/of1-demo/step-3-status.json
```
