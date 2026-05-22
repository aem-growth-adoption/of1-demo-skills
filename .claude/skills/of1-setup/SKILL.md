---
name: of1-setup
description: Install and verify all dependencies for the OF1 demo pipeline — skills, tools, and prerequisites.
user-invocable: false
---

# OF1 Setup — Install Dependencies

Verify that all required skills, tools, and prerequisites for the demo pipeline are in place.

## Checks

### 1. Required skills

Verify these skills are installed:

```bash
ls /workspace/skills/of1-discovery/SKILL.md && echo "of1-discovery OK"
ls /workspace/skills/of1-repo-setup/SKILL.md && echo "of1-repo-setup OK"
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

### 2. Impeccable (frontend-design)

```bash
ls /workspace/skills/frontend-design/SKILL.md >/dev/null 2>&1 && echo "Impeccable OK" || echo "FAIL: impeccable (frontend-design) not installed"
```

### 3. Update skills from source

Re-install key skills to ensure they're up to date:

```bash
upskill adobe/skills@main --all 2>/dev/null && echo "adobe/skills updated" || echo "WARN: could not update adobe/skills"
upskill pbakaus/impeccable@main --all 2>/dev/null && echo "impeccable updated" || echo "WARN: could not update impeccable"
upskill ai-ecoverse/snowflake@main --all 2>/dev/null && echo "snowflake updated" || echo "WARN: could not update ai-ecoverse/snowflake"
```

If updates fail, warn but don't block — existing versions may still work.

### 4. Playwright

```bash
which playwright-cli >/dev/null 2>&1 && echo "Playwright OK" || echo "FAIL: playwright-cli not found"
```

### 5. Node.js

```bash
which node >/dev/null 2>&1 && echo "Node OK" || echo "FAIL: node not found"
```

### 6. DA_TOKEN

```bash
[ -n "${DA_TOKEN}" ] && echo "DA_TOKEN OK" || echo "WARN: DA_TOKEN not set — needed for later steps"
```

## Completion

Report results as a summary:

```
## Install Dependencies — Check

- Skills: [N/N] installed
- Impeccable: OK / FAIL
- Playwright: OK / FAIL
- Node: OK / FAIL
- DA_TOKEN: OK / WARN
```

If all critical checks pass (skills, playwright, node), write:
```bash
mkdir -p /shared/of1-demo
echo '{"step":1,"status":"done"}' > /shared/of1-demo/step-1-status.json
```

If any critical check fails, write:
```bash
mkdir -p /shared/of1-demo
echo '{"step":1,"status":"failed","error":"Missing: [list what failed]"}' > /shared/of1-demo/step-1-status.json
```

Do NOT call `sprinkle send` — only the of1-demo orchestrator scoop may do that.
The orchestrator reads this file and pushes the status to the sprinkle.
