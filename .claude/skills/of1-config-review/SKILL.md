---
name: of1-config-review
description: Generate the config-review.html deliverable showing all OF1 config data for user approval
user-invocable: true
---

# OF1 Config Review

Generate the config-review.html deliverable for an OF1 demo using the proper template and fill script.

## When to Use

- After ANY change to `of1/config/*.json` files (products, suggestions, brand-voice, personas, use-cases, features, cta-template)
- As step 12 in the pipeline (after steps 9-11 complete)
- Whenever the user asks to regenerate or update the config review page

## Prerequisites

- Config JSON files must already exist under `of1/config/` in the repo
- The skills must be installed (fill script at `/workspace/skills/of1-config-review/assets/`)

## Execution — EXACT Recipe

### Step 1: Read repo config

```bash
REPO_CONFIG=$(cat /shared/of1-demo/repo-config.json)
OWNER=$(echo "$REPO_CONFIG" | jq -r '.owner')
REPO=$(echo "$REPO_CONFIG" | jq -r '.repo')
BRANCH=$(echo "$REPO_CONFIG" | jq -r '.branch')
REPO_DIR=$(echo "$REPO_CONFIG" | jq -r '.repoDir')
DOMAIN=$(echo "$REPO_CONFIG" | jq -r '.domain')
```

### Step 2: Run the fill script

```bash
cd "$REPO_DIR" && python3 /workspace/skills/of1-config-review/assets/fill-config-review.py . "$DOMAIN"
```

The script:
- Reads: `of1/config/{products,brand-voice,personas,suggestions,use-cases,features,cta-template}.json`
- Uses template: `/workspace/skills/of1-config-review/assets/config-review.html`
- Writes: `deliverables/config-review.html`

### Step 3: Commit and push

```bash
cd "$REPO_DIR"
git add deliverables/config-review.html
git commit -m "docs: config review page for ${DOMAIN}"
git push origin "$BRANCH"
```

### Step 4: Verify

The review page is available at:
```
https://${BRANCH}--${REPO}--${OWNER}.aem.page/deliverables/config-review.html
```

## What the Script Produces

The config-review.html is a self-contained dark-themed dashboard showing:
- **Stats bar**: Product count, image count, personas, suggestions, features, use cases
- **Products section**: Expandable cards with thumbnail, name, category, price, image count — click to reveal full gallery, description, features, highlights, keywords, persona, use case, and link to source
- **Brand Voice section**: Personality, tone, vocabulary, avoid words
- **Personas section**: Grid of persona cards with name, description, keywords
- **Use Cases section**: Cards with name and description
- **Features section**: Chip list
- **Suggestions section**: Title/subtitle/placeholder + suggestion chips with label and query
- **CTA Template section**: JSON preview of the CTA configuration

## Completion (pipeline mode)

When running as step 12 in the pipeline:

```bash
mkdir -p /shared/of1-demo
echo '{"step":12,"status":"review","deliverable":"https://'${BRANCH}'--'${REPO}'--'${OWNER}'.aem.page/deliverables/config-review.html","summary":"Review all config before deploy: products, brand voice, personas, CTA, suggestions."}' > /shared/of1-demo/step-12-status.json
```

Do NOT call `sprinkle send` — only the of1-demo orchestrator scoop may do that.

## Common Mistakes That Waste Time

| Mistake | Time Cost | Fix |
|---------|-----------|-----|
| Writing inline Python to generate config-review HTML | 5-10 min | Always use `fill-config-review.py` — it uses the proper template |
| Forgetting to `cd` into the repo before running the script | 2 min | Use `cd "$REPO_DIR"` first |
| Not passing the domain argument | 1 min | Second arg is required: `python3 fill-config-review.py . frescopa.coffee` |
| Trying to use Node.js | 3 min | Node is a shim in SLICC — always use `python3` |
| Manually editing deliverables/config-review.html | 5+ min | Never hand-edit — always regenerate with the script |

## DO NOT

- **DO NOT** write your own HTML generation logic — the template + fill script handles everything
- **DO NOT** use Node.js, npm, or any .mjs files — Python only
- **DO NOT** hand-edit `deliverables/config-review.html` — it's a generated artifact
- **DO NOT** skip this step after config changes — the review page is the user's primary way to verify all config data
