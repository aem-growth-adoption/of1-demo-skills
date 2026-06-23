---
name: of1-setup
description: Verify all prerequisites for the OF1 demo pipeline — skills, mounts, tokens, repo state.
user-invocable: false
---

# OF1 Setup

Verify that everything required for the demo pipeline is in place before starting.

## Checks

### 1. Required skills

Verify these skills are installed:

```bash
ls /workspace/skills/of1-discovery/SKILL.md && echo "of1-discovery OK"
ls /workspace/skills/of1-branch-setup/SKILL.md && echo "of1-branch-setup OK"
ls /workspace/skills/extract/SKILL.md && echo "extract OK"
ls /workspace/skills/prototype/SKILL.md && echo "prototype OK"
ls /workspace/skills/of1-snowflake/SKILL.md && echo "of1-snowflake OK"
ls /workspace/skills/stardust-to-snowflake/SKILL.md && echo "stardust-to-snowflake OK (from ai-ecoverse/snowflake plugin)"
ls /workspace/skills/brand-voice-extractor/SKILL.md && echo "brand-voice-extractor OK"
ls /workspace/skills/content-metadata/SKILL.md && echo "content-metadata OK"
ls /workspace/skills/block-guide-builder/SKILL.md && echo "block-guide-builder OK"
ls /workspace/skills/generative-block-styler/SKILL.md && echo "generative-block-styler OK"
ls /workspace/skills/quick-suggestions/SKILL.md && echo "quick-suggestions OK"
ls /workspace/skills/of1-deploy/SKILL.md && echo "of1-deploy OK"
```

### 2. Clone the OF1 demo repo

The skills in this plugin operate on the `of1-demo` repo. Clone it if it doesn't already exist:

```bash
OF1_REPO_DIR="${OF1_DEMO_DIR:-$HOME/of1-demo}"

if [ -d "$OF1_REPO_DIR/.git" ]; then
  echo "Git repo already exists at $OF1_REPO_DIR — OK"
else
  echo "Cloning of1-demo repo to $OF1_REPO_DIR..."
  git clone https://github.com/aem-growth-adoption/of1-demo.git "$OF1_REPO_DIR"
  echo "Git repo cloned — OK"
fi
```

Then verify:

```bash
cd "$OF1_REPO_DIR" && git status >/dev/null 2>&1 && echo "Git repo OK" || echo "FAIL: not a git repo"
```

### 3. DA mount

```bash
ls /mnt/da >/dev/null 2>&1 && echo "DA mount OK" || echo "WARN: DA not mounted — run: mount --source da://aem-growth-adoption/of1-demo /mnt/da"
```

### 4. DA_TOKEN

```bash
[ -n "${DA_TOKEN}" ] && echo "DA_TOKEN OK" || echo "WARN: DA_TOKEN not set — needed for step 5 (Snowflake)"
```

### 5. Impeccable

```bash
ls /workspace/skills/frontend-design/SKILL.md >/dev/null 2>&1 && echo "Impeccable OK" || echo "FAIL: impeccable (frontend-design) not installed"
```

### 5b. Update skills from source

Re-install key skills to ensure they're up to date:

```bash
upskill adobe/skills@main --all 2>/dev/null && echo "adobe/skills updated" || echo "WARN: could not update adobe/skills"
upskill pbakaus/impeccable@main --all 2>/dev/null && echo "impeccable updated" || echo "WARN: could not update impeccable"
upskill ai-ecoverse/snowflake@main --all 2>/dev/null && echo "snowflake updated" || echo "WARN: could not update ai-ecoverse/snowflake"
```

If updates fail, warn but don't block — existing versions may still work.

### 6. Playwright

```bash
which playwright-cli >/dev/null 2>&1 && echo "Playwright OK" || echo "FAIL: playwright-cli not found"
```

### 7. Node.js

```bash
which node >/dev/null 2>&1 && echo "Node OK" || echo "FAIL: node not found"
```

## Completion

Report results as a summary:

```
## Setup Check

- Skills: [N/N] installed
- Impeccable: OK / FAIL
- Git repo: OK (cloned) / OK (exists) / FAIL
- DA mount: OK / WARN (not required until step 6)
- DA_TOKEN: OK / WARN (not required until step 6)
- Playwright: OK / FAIL
- Node: OK / FAIL
```

If all critical checks pass, write:
```bash
mkdir -p /shared/of1-demo
echo '{"step":1,"status":"done"}' > /shared/of1-demo/step-1-status.json
```

If any critical check fails (skills, git, playwright, node), write:
```bash
mkdir -p /shared/of1-demo
echo '{"step":1,"status":"failed","error":"Missing: [list what failed]"}' > /shared/of1-demo/step-1-status.json
```

Do NOT call `sprinkle send` — only the of1-demo orchestrator scoop may do that.
The orchestrator reads this file and pushes the status to the sprinkle.
