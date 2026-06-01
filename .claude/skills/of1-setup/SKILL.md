---
name: of1-setup
description: Install and verify all dependencies for the OF1 demo pipeline — skills, tools, and prerequisites.
user-invocable: false
---

# OF1 Setup — Install Dependencies

Verify that all required skills, tools, and prerequisites for the demo pipeline are in place.

## Step 1: Install skill packages

```bash
upskill aem-growth-adoption/of1-demo-skills --all --branch skills-v3 --force 2>/dev/null && echo "of1-demo-skills OK" || echo "WARN: could not install of1-demo-skills"
upskill adobe/skills --path plugins/aem/edge-delivery-services --all 2>/dev/null && echo "adobe/skills (EDS + snowflake) OK" || echo "WARN: could not install adobe/skills"
upskill adobe/skills --path plugins/stardust --all 2>/dev/null && echo "adobe/skills (stardust) OK" || echo "WARN: could not install stardust"
upskill pbakaus/impeccable --all 2>/dev/null && echo "impeccable OK" || echo "WARN: could not install impeccable"
```

## Step 2: Verify local skills installed

```bash
SKILLS_OK=true
for SKILL in of1-discovery of1-branch-setup of1-snowflake of1-template-generation of1-brand-voice-extractor of1-content-metadata of1-generative-block-styler of1-quick-suggestions of1-cta-template-builder of1-deploy; do
  if [ -f "/workspace/skills/${SKILL}/SKILL.md" ]; then
    echo "  ✓ ${SKILL}"
  else
    echo "  ✗ ${SKILL} MISSING"
    SKILLS_OK=false
  fi
done
```

## Step 3: Verify upstream plugins available

Verify the EDS, stardust, and impeccable skills installed from the upstream packages:

```bash
for SKILL in snowflake da-content stardust impeccable; do
  if [ -f "/workspace/skills/${SKILL}/SKILL.md" ]; then
    echo "  ✓ ${SKILL}"
  else
    echo "  ✗ ${SKILL} MISSING"
    SKILLS_OK=false
  fi
done
```

## Step 4: Verify tools

```bash
TOOLS_OK=true

which playwright-cli >/dev/null 2>&1 && echo "  ✓ playwright-cli" || { echo "  ✗ playwright-cli NOT FOUND"; TOOLS_OK=false; }
which python3 >/dev/null 2>&1 && echo "  ✓ python3" || { echo "  ✗ python3 NOT FOUND"; TOOLS_OK=false; }
which jq >/dev/null 2>&1 && echo "  ✓ jq" || { echo "  ✗ jq NOT FOUND"; TOOLS_OK=false; }
which git >/dev/null 2>&1 && echo "  ✓ git" || { echo "  ✗ git NOT FOUND"; TOOLS_OK=false; }
```

## Step 5: Clone of1-demo repo

```bash
if [ -d /workspace/of1-demo ]; then
  echo "  ✓ of1-demo repo already cloned"
else
  cd /workspace && git clone https://github.com/aem-growth-adoption/of1-demo.git && echo "  ✓ of1-demo cloned" || { echo "  ✗ clone failed"; TOOLS_OK=false; }
fi
```

## Step 6: Verify git credentials

```bash
[ -f ~/.git-credentials ] && echo "  ✓ git credentials" || echo "  ⚠ no git credentials file (push may require auth)"
```

## Completion

Report results as a summary:

```
## Setup Complete

- Skills: [N/N] local + stardust plugins
- Tools: playwright-cli, python3, jq, git
- Repo: of1-demo cloned
- Git: credentials OK
```

If all critical checks pass, write:
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
