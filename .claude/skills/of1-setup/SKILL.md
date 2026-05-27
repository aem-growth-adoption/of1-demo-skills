---
name: of1-setup
description: Install and verify all dependencies for the OF1 demo pipeline — skills, tools, and prerequisites.
user-invocable: false
---

# OF1 Setup — Install Dependencies

Verify that all required skills, tools, and prerequisites for the demo pipeline are in place.

## Checks

### 1. Install skills from sources

Install all required skill packages:

```bash
upskill aem-growth-adoption/of1-demo-skills --all --branch skills-v3 --force 2>/dev/null && echo "of1-demo-skills OK" || echo "WARN: could not install of1-demo-skills"
upskill adobe/skills@feat/eds-snowflake-da-content --path plugins/aem/edge-delivery-services --all 2>/dev/null && echo "adobe/skills (EDS + snowflake) OK" || echo "WARN: could not install adobe/skills"
```

### 2. Verify required skills

```bash
ls /workspace/skills/of1-discovery/SKILL.md && echo "of1-discovery OK"
ls /workspace/skills/of1-branch-setup/SKILL.md && echo "of1-branch-setup OK"
ls /workspace/skills/extract/SKILL.md && echo "extract OK"
ls /workspace/skills/prototype/SKILL.md && echo "prototype OK"
ls /workspace/skills/snowflake/SKILL.md && echo "snowflake OK"
ls /workspace/skills/da-content/SKILL.md && echo "da-content OK"
ls /workspace/skills/of1-snowflake/SKILL.md && echo "of1-snowflake OK"
ls /workspace/skills/of1-template-generation/SKILL.md && echo "of1-template-generation OK"
ls /workspace/skills/of1-brand-voice-extractor/SKILL.md && echo "of1-brand-voice-extractor OK"
ls /workspace/skills/of1-content-metadata/SKILL.md && echo "of1-content-metadata OK"
ls /workspace/skills/of1-generative-block-styler/SKILL.md && echo "of1-generative-block-styler OK"
ls /workspace/skills/of1-quick-suggestions/SKILL.md && echo "of1-quick-suggestions OK"
ls /workspace/skills/of1-cta-template-builder/SKILL.md && echo "of1-cta-template-builder OK"
ls /workspace/skills/of1-deploy/SKILL.md && echo "of1-deploy OK"
```

### 3. Playwright

```bash
which playwright-cli >/dev/null 2>&1 && echo "Playwright OK" || echo "FAIL: playwright-cli not found"
```

### 4. Node.js

```bash
which node >/dev/null 2>&1 && echo "Node OK" || echo "FAIL: node not found"
```

### 5. Git credentials

```bash
[ -f ~/.git-credentials ] && echo "Git credentials OK" || echo "FAIL: no git credentials"
```

### 6. Clone of1-demo repo

```bash
if [ -d /workspace/of1-demo ]; then
  echo "of1-demo repo already cloned"
else
  cd /workspace && git clone https://github.com/aem-growth-adoption/of1-demo.git && echo "of1-demo cloned OK"
fi
```

## Completion

Report results as a summary:

```
## Install Dependencies — Check

- Skills: [N/N] installed
- Snowflake (overlay): OK / FAIL
- Playwright: OK / FAIL
- Node: OK / FAIL
- Git: OK / FAIL
- of1-demo repo: OK / FAIL
```

If all critical checks pass (skills, playwright, node, git, repo), write:
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
